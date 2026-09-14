import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { PGM_DOUBLEBOX_CAMERA_FILL } from '../../studio/applyConfig/mappings/casparcgLayers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'

/** Caspar MEDIA or DeckLink INPUT — always derived from studio `pgmCameraProducer`. */
export type PgmCameraTimelineContent = TSR.TimelineContentCCGMedia | TSR.TimelineContentCCGInput

const DECKLINK_PRODUCER_RE = /^DECKLINK(?:\s+DEVICE)?\s+(\d+)(?:\s+FORMAT\s+(\S+))?$/i

function isLiveFfmpegProducer(producer: string): boolean {
	return /^dshow:\/\//i.test(producer) || /^v4l2:\/\//i.test(producer) || /^iec61883:\/\//i.test(producer)
}

/**
 * Parse studio config when it is Caspar DeckLink AMCP text.
 * Returns undefined for dshow:// and every other producer — never invents DeckLink.
 *
 * Accepts both `DECKLINK DEVICE N …` (Caspar docs) and `DECKLINK N …` (what
 * casparcg-connection's PlayDecklink serializer emits). Caspar's producer parser
 * treats them equivalently (`get_param(DEVICE)` or `params[1]`).
 */
export function parseDecklinkProducer(producer: string): { device: number; format?: string } | undefined {
	const match = DECKLINK_PRODUCER_RE.exec(producer.trim())
	if (!match) return undefined
	return {
		device: Number(match[1]),
		format: match[2],
	}
}

/** Map Caspar FORMAT tokens (e.g. 1080p5000) to TSR {@link TSR.ChannelFormat}. */
export function casparFormatToChannelFormat(format: string): TSR.ChannelFormat {
	const normalized = format.trim().toUpperCase()
	for (const value of Object.values<TSR.ChannelFormat>(TSR.ChannelFormat)) {
		if (typeof value === 'string' && value.toUpperCase() === normalized) {
			return value
		}
	}
	return TSR.ChannelFormat.INVALID
}

/** Prefer a known ChannelFormat; never emit FORMAT INVALID on air. */
export function resolveDecklinkDeviceFormat(format: string | undefined): TSR.ChannelFormat {
	if (!format) return TSR.ChannelFormat.HD_1080P5000
	const mapped = casparFormatToChannelFormat(format)
	return mapped === TSR.ChannelFormat.INVALID ? TSR.ChannelFormat.HD_1080P5000 : mapped
}

/** Exact studio `pgmCameraProducer` string (trimmed), or undefined if unset. */
export function getPgmCameraProducer(config: StudioConfig): string | undefined {
	const producer = config.casparcg.hypercomposed?.pgmCameraProducer?.trim()
	return producer || undefined
}

/** Optional libavfilter string forwarded to Caspar as VF (e.g. scale=1280:720). */
export function getPgmCameraVideoFilter(config: StudioConfig): string | undefined {
	const filter = config.casparcg.hypercomposed?.pgmCameraVideoFilter?.trim()
	return filter || undefined
}

/** True when the configured producer is a live capture (ffmpeg URI or DeckLink AMCP). */
export function isLivePgmCameraProducer(producer: string): boolean {
	return isLiveFfmpegProducer(producer) || parseDecklinkProducer(producer) !== undefined
}

/** MEDIA-only options (dshow/v4l2/etc.) — noStarttime avoids spurious SEEK on live URIs. */
export function getPgmCameraMediaContentOptions(
	config: StudioConfig,
	producer: string
): Pick<TSR.TimelineContentCCGMedia, 'noStarttime' | 'videoFilter'> {
	const options: Pick<TSR.TimelineContentCCGMedia, 'noStarttime' | 'videoFilter'> = {}

	if (isLiveFfmpegProducer(producer)) {
		options.noStarttime = true
	}

	const videoFilter = getPgmCameraVideoFilter(config)
	if (videoFilter) {
		options.videoFilter = videoFilter
	}

	return options
}

/**
 * Build camera timeline content from the studio config producer string only.
 *
 * - `dshow://…` / files → MEDIA with `file` = that exact string (quoted by Sofie; fine for URIs).
 * - `DECKLINK DEVICE N FORMAT …` → INPUT parsed from that same string (PlayDecklink, unquoted).
 *   Sofie always quotes MEDIA clips; quoting native DECKLINK AMCP makes Caspar look for a file
 *   (`404 PLAY FAILED` / File not found).
 *
 * Note on the word `DEVICE`: blueprints do **not** strip it from config. We parse device index
 * + format into TSR INPUT; playout's casparcg-connection serializes PlayDecklink as
 * `DECKLINK <n> FORMAT <fmt>` (no `DEVICE` keyword). That is intentional upstream and Caspar
 * accepts it. A log line like `DeckLink … [1|1080p5000] Could not enable video input` means
 * device+format were parsed — `EnableVideoInput` failed for hardware/config reasons (device
 * already used as a DeckLink consumer, Desktop Video connector mode, no signal, etc.).
 */
export function createPgmCameraTimelineContent(
	config: StudioConfig,
	producer: string,
	mixer: TSR.Mixer
): PgmCameraTimelineContent {
	const decklink = parseDecklinkProducer(producer)
	const videoFilter = getPgmCameraVideoFilter(config)

	if (decklink) {
		return {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.INPUT,
			inputType: 'decklink',
			device: decklink.device,
			deviceFormat: resolveDecklinkDeviceFormat(decklink.format),
			mixer,
			...(videoFilter ? { videoFilter } : {}),
		}
	}

	return {
		deviceType: TSR.DeviceType.CASPARCG,
		type: TSR.TimelineContentTypeCasparCg.MEDIA,
		file: producer,
		mixer,
		...getPgmCameraMediaContentOptions(config, producer),
	}
}

/**
 * Keep CAM1 warm on DoubleBox (BG A / ch3 layer 115) for the whole rundown.
 * Producer comes only from studio config — change config, then Reset Rundown to apply.
 */
export function createDoubleBoxBaselineCameraTimeline(
	config: StudioConfig
): TimelineBlueprintExt<PgmCameraTimelineContent> | undefined {
	if (!config.casparcg.hypercomposed) return undefined
	const producer = getPgmCameraProducer(config)
	if (!producer) return undefined

	return literal<TimelineBlueprintExt<PgmCameraTimelineContent>>({
		id: '',
		enable: { while: 1 },
		priority: 0,
		layer: CasparCGLayers.CasparCGPgmCamera,
		content: createPgmCameraTimelineContent(config, producer, {
			fill: { ...PGM_DOUBLEBOX_CAMERA_FILL },
		}),
	})
}
