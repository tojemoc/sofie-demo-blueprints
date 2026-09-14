import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { PGM_DOUBLEBOX_CAMERA_FILL } from '../../studio/applyConfig/mappings/casparcgLayers.js'
import { getHypercomposedChannels } from '../../studio/applyConfig/mappings/casparcg.js'
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

/** Caspar channel that permanently holds live CAM (default **5**). */
export function getCamIngestChannel(config: StudioConfig): number {
	return getHypercomposedChannels({ studio: config }).camIngestChannel
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
 * Native producer content for the **ingest** channel only (channel 5 by default).
 * This is the sole timeline object allowed to open DeckLink / dshow.
 *
 * - `DECKLINK DEVICE N FORMAT …` → INPUT (PlayDecklink, unquoted).
 * - `dshow://…` / files → MEDIA with `file` = that exact string.
 */
export function createPgmCameraTimelineContent(
	config: StudioConfig,
	producer: string,
	mixer?: TSR.Mixer
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
			...(mixer ? { mixer } : {}),
			...(videoFilter ? { videoFilter } : {}),
		}
	}

	return {
		deviceType: TSR.DeviceType.CASPARCG,
		type: TSR.TimelineContentTypeCasparCg.MEDIA,
		file: producer,
		...(mixer ? { mixer } : {}),
		...getPgmCameraMediaContentOptions(config, producer),
	}
}

/**
 * Look A/B camera layer content (BG 3/4 layer 115).
 *
 * Live producers → MEDIA `route://{camIngestChannel}` with the look FILL (DeckLink stays
 * open only on the ingest helper). File/still producers → play the file on the look layer.
 */
export function createLookCameraTimelineContent(
	config: StudioConfig,
	producer: string,
	mixer: TSR.Mixer
): PgmCameraTimelineContent {
	if (isLivePgmCameraProducer(producer)) {
		const channel = getCamIngestChannel(config)
		return {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: `route://${channel}`,
			noStarttime: true,
			mixer,
		}
	}
	return createPgmCameraTimelineContent(config, producer, mixer)
}

/**
 * Keep live CAM open for the whole rundown on the ingest helper channel (default ch5).
 * Look pieces never PLAY DeckLink/dshow — they route from here. Change config, then Reset Rundown.
 */
export function createCameraIngestBaselineTimeline(
	config: StudioConfig
): TimelineBlueprintExt<PgmCameraTimelineContent> | undefined {
	if (!config.casparcg.hypercomposed) return undefined
	const producer = getPgmCameraProducer(config)
	if (!producer || !isLivePgmCameraProducer(producer)) return undefined

	return literal<TimelineBlueprintExt<PgmCameraTimelineContent>>({
		id: '',
		enable: { while: 1 },
		priority: 0,
		layer: CasparCGLayers.CasparCGPgmCameraIngest,
		content: createPgmCameraTimelineContent(config, producer),
	})
}

/**
 * Optional non-live CAM still/file on DoubleBox (BG A / ch3 layer 115) for the rundown.
 * Live producers use {@link createCameraIngestBaselineTimeline} instead.
 */
export function createDoubleBoxBaselineCameraTimeline(
	config: StudioConfig
): TimelineBlueprintExt<PgmCameraTimelineContent> | undefined {
	if (!config.casparcg.hypercomposed) return undefined
	const producer = getPgmCameraProducer(config)
	if (!producer) return undefined
	if (isLivePgmCameraProducer(producer)) return undefined

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
