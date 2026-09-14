import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { PGM_DOUBLEBOX_CAMERA_FILL } from '../../studio/applyConfig/mappings/casparcgLayers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'

/** Caspar AMCP media or structured DeckLink input (must not be quoted as a clip path). */
export type PgmCameraTimelineContent = TSR.TimelineContentCCGMedia | TSR.TimelineContentCCGInput

const DECKLINK_PRODUCER_RE = /^DECKLINK(?:\s+DEVICE)?\s+(\d+)(?:\s+FORMAT\s+(\S+))?$/i

function isLiveFfmpegProducer(producer: string): boolean {
	return /^dshow:\/\//i.test(producer) || /^v4l2:\/\//i.test(producer) || /^iec61883:\/\//i.test(producer)
}

/** Parse studio `pgmCameraProducer` when set to Caspar DeckLink AMCP syntax. */
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

/** Caspar PLAY path for the PGM UVC / virtual camera layer. */
export function getPgmCameraProducer(config: StudioConfig): string | undefined {
	const producer = config.casparcg.hypercomposed?.pgmCameraProducer?.trim()
	return producer || undefined
}

/** Optional libavfilter string forwarded to Caspar as VF (e.g. scale=1280:720). */
export function getPgmCameraVideoFilter(config: StudioConfig): string | undefined {
	const filter = config.casparcg.hypercomposed?.pgmCameraVideoFilter?.trim()
	return filter || undefined
}

/** Extra fields for live dshow/v4l2 producers — avoids spurious seek + reduces AMCP churn. */
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

/** True when {@link getPgmCameraProducer} resolves to a live capture (ffmpeg URI or DeckLink). */
export function isLivePgmCameraProducer(producer: string): boolean {
	return isLiveFfmpegProducer(producer) || parseDecklinkProducer(producer) !== undefined
}

/**
 * Timeline content for the PGM camera layer.
 *
 * DeckLink strings must use {@link TSR.TimelineContentTypeCasparCg.INPUT} — quoting them as MEDIA
 * makes Caspar treat `DECKLINK DEVICE …` as a missing file (404 PLAY FAILED).
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
			deviceFormat: decklink.format ? casparFormatToChannelFormat(decklink.format) : TSR.ChannelFormat.HD_1080P5000,
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
 * Opening dshow only on Take into DoubleBox lags the first ILU and floods rtbufsize
 * while Full (ch4) may still hold a capture during wipe keepalive.
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
