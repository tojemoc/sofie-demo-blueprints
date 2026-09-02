import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'

type AudioBedMixer = NonNullable<TSR.TimelineContentCCGMedia['mixer']>

export interface AudioBedTimelineOptions {
	volume?: number
	keyframes?: TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']
	priority?: number
	enable?: TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['enable']
}

/** Play the same background-music bed on LED and PGM Caspar channels. */
export function createDualChannelAudioBedTimelineObjects(
	file: string,
	options?: AudioBedTimelineOptions
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	const mixer: AudioBedMixer | undefined =
		options?.volume !== undefined
			? {
					volume: options.volume,
				}
			: undefined

	const layers = [CasparCGLayers.CasparCGAudioBed, CasparCGLayers.CasparCGAudioBedPgm] as const

	return layers.map((layer) =>
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
			id: '',
			enable: options?.enable ?? { start: 0 },
			layer,
			priority: options?.priority ?? 0,
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				file,
				loop: true,
				...(mixer ? { mixer } : {}),
			},
			...(options?.keyframes ? { keyframes: options.keyframes } : {}),
		})
	)
}
