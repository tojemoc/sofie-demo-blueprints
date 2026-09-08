import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { PGM_DOUBLEBOX_CAMERA_FILL } from '../../studio/applyConfig/mappings/casparcgLayers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'

function isLiveFfmpegProducer(producer: string): boolean {
	return /^dshow:\/\//i.test(producer) || /^v4l2:\/\//i.test(producer) || /^iec61883:\/\//i.test(producer)
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

/**
 * Keep CAM1 warm on DoubleBox (BG A / ch3 layer 115) for the whole rundown.
 * Opening dshow only on Take into DoubleBox lags the first ILU and floods rtbufsize
 * while Full (ch4) may still hold a capture during wipe keepalive.
 */
export function createDoubleBoxBaselineCameraTimeline(
	config: StudioConfig
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> | undefined {
	if (!config.casparcg.hypercomposed) return undefined
	const producer = getPgmCameraProducer(config)
	if (!producer) return undefined

	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { while: 1 },
		priority: 0,
		layer: CasparCGLayers.CasparCGPgmCamera,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: producer,
			mixer: {
				fill: { ...PGM_DOUBLEBOX_CAMERA_FILL },
			},
			...getPgmCameraMediaContentOptions(config, producer),
		},
	})
}
