import { TSR } from '@sofie-automation/blueprints-integration'
import { StudioConfig } from '../../studio/helpers/config.js'

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
