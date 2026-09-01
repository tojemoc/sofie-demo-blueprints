import { BlueprintResultBaseline, IShowStyleUserContext, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../../studio/helpers/config.js'
import { AtemLayers, CasparCGLayers, SisyfosLayers, VMixLayers } from '../../studio/layers.js'
import { getSisyfosBaseline } from '../helpers/audio.js'
import { DVEDesigns, DVELayouts } from '../helpers/dve.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { InputConfig, OutputConfig, VmixInputConfig } from '../../../$schemas/generated/main-studio-config.js'
import { parseConfig } from '../helpers/config.js'
import { createBackgroundMusicBaselineTimeline } from '../helpers/backgroundMusic.js'

/** Caspar PLAY path (no extension) for the LED background loop on clip layer 110. */
export const LED_BACKGROUND_LOOP_FILE = 'loops/bg_loop'

/**
 * PGM counter bug — short alpha clip that briefly replaces `gfx/logo-bug` every
 * {@link PGM_COUNTER_INTERVAL_MS}. Disk file: `assets/counter.mov` (or `loops/counter.mov`
 * renamed/symlinked to the assets path). Full-frame alpha overlay (graphic already
 * sits bottom-right in the mov).
 */
export const PGM_COUNTER_FILE = 'assets/counter'

/** First counter appearance and repeat period (ms from rundown start). */
export const PGM_COUNTER_INTERVAL_MS = 30_000

/** How long the counter stays visible each cycle (ms). */
export const PGM_COUNTER_DURATION_MS = 4_000

/** MIX fade in/out when counter visibility pulses. */
export const PGM_COUNTER_FADE_MS = 400

/** Counter visibility pulses scheduled from rundown start (30s cadence). */
const PGM_COUNTER_VISIBILITY_CYCLES = 40

function pgmCounterOpacityKeyframes(): NonNullable<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']> {
	const keyframes: NonNullable<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']> = []
	for (let cycle = 1; cycle <= PGM_COUNTER_VISIBILITY_CYCLES; cycle++) {
		const pulseStart = cycle * PGM_COUNTER_INTERVAL_MS
		keyframes.push({
			id: '',
			enable: { start: pulseStart },
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				mixer: {
					opacity: 1,
					volume: 1,
				},
				transitions: {
					inTransition: {
						type: TSR.Transition.MIX,
						duration: PGM_COUNTER_FADE_MS,
					},
				},
			},
		})
		keyframes.push({
			id: '',
			enable: { start: pulseStart + PGM_COUNTER_DURATION_MS },
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				mixer: {
					opacity: 0,
					volume: 0,
				},
				transitions: {
					outTransition: {
						type: TSR.Transition.MIX,
						duration: PGM_COUNTER_FADE_MS,
					},
				},
			},
		})
	}
	return keyframes
}

export function getBaseline(context: IShowStyleUserContext): BlueprintResultBaseline {
	const config = parseConfig(context).studio

	return {
		timelineObjects: [
			...(config.visionMixer.type === VisionMixerDevice.Atem ? getAtemBaseline(config) : []),
			...(config.visionMixer.type === VisionMixerDevice.VMix ? getVMixBaseline(config) : []),

			literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
				id: '',
				enable: { while: 1 },
				priority: 0,
				layer: CasparCGLayers.CasparCGClipPlayer1,
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.MEDIA,

					file: LED_BACKGROUND_LOOP_FILE,
					loop: true,
				},
			}),

			// PGM ClipPlayer2 is reserved for story VT/SYN/weather — never baseline bg_loop.
			// LED owns loops/bg_loop; PGM shows OBS cam / DoubleBox / intro overlays instead.
			// db_loop on PGM 118 bakes bg art into the DoubleBox frame — that is not bg_loop PLAY.

			literal<TimelineBlueprintExt<TSR.TimelineContentCCGRoute>>({
				id: '',
				enable: { while: 1 },
				priority: 0,
				layer: CasparCGLayers.CasparCGClipPlayerPreview,
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.ROUTE,

					mappedLayer: CasparCGLayers.CasparCGClipPlayer1,
					mode: 'BACKGROUND',
				},
			}),

			// Counter runs from rundown start (silent/invisible) so logo-bug timing stays synced.
			// gfx/logo-bug is enabled by rundown pieces (OutOnRundownEnd), not baseline.
			literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
				id: '',
				enable: { while: 1 },
				priority: 0,
				layer: CasparCGLayers.CasparCGGraphicsLogo,
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.MEDIA,
					file: PGM_COUNTER_FILE,
					loop: true,
					mixer: {
						opacity: 0,
						volume: 0,
					},
				},
				keyframes: pgmCounterOpacityKeyframes(),
			}),

			createBackgroundMusicBaselineTimeline(),

			literal<TimelineBlueprintExt<TSR.TimelineContentSisyfosChannels>>({
				id: '',
				enable: {
					while: 1,
				},
				layer: SisyfosLayers.Baseline,
				content: {
					deviceType: TSR.DeviceType.SISYFOS,
					type: TSR.TimelineContentTypeSisyfos.CHANNELS,
					overridePriority: -10,

					channels: getSisyfosBaseline(config),
				},
				priority: 0,
			}),
		],
	}
}

function getAtemBaseline(config: StudioConfig): TimelineBlueprintExt[] {
	const dskInput = Object.values<InputConfig>(config.atemSources).find((source) => source.type === SourceType.Graphics)

	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentAtemSsrcProps>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: AtemLayers.AtemSuperSourceProps,
			content: {
				deviceType: TSR.DeviceType.ATEM,
				type: TSR.TimelineContentTypeAtem.SSRCPROPS,
				ssrcProps: {
					artFillSource: 3010, // atem mediaplayer1
					artCutSource: 3011,
					artOption: 0, // bg art
					artPreMultiplied: true,
					borderEnabled: false,
				},
			},
		}),

		literal<TimelineBlueprintExt<TSR.TimelineContentAtemSsrc>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: AtemLayers.AtemSuperSourceBoxes,
			content: {
				deviceType: TSR.DeviceType.ATEM,
				type: TSR.TimelineContentTypeAtem.SSRC,

				ssrc: {
					boxes: [...DVEDesigns[DVELayouts.TwoBox]],
				},
			},
		}),

		literal<TimelineBlueprintExt<TSR.TimelineContentAtemDSK>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: AtemLayers.AtemDskGraphics,
			content: {
				deviceType: TSR.DeviceType.ATEM,
				type: TSR.TimelineContentTypeAtem.DSK,

				dsk: {
					onAir: true,
					sources: {
						fillSource: dskInput?.input || 0,
						cutSource: dskInput ? dskInput.input + 1 : 0,
					},
					properties: {
						preMultiply: true,
					},
				},
			},
		}),

		...Object.values<OutputConfig>(config.atemOutputs).map((output) =>
			literal<TimelineBlueprintExt<TSR.TimelineContentAtemAUX>>({
				id: '',
				enable: { while: 1 },
				priority: 0,
				layer: `atem_aux_${output.output - 1}`,
				content: {
					deviceType: TSR.DeviceType.ATEM,
					type: TSR.TimelineContentTypeAtem.AUX,

					aux: {
						input: output.source,
					},
				},
			})
		),
	]
}

function getVMixBaseline(config: StudioConfig): TimelineBlueprintExt[] {
	const dskInput = Object.values<VmixInputConfig>(config.vmixSources).find(
		(source) => source.type === SourceType.Graphics
	)

	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixOverlay>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: VMixLayers.VMixOverlayGraphics,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.OVERLAY,

				input: dskInput?.input || -1,
			},
		}),
	]
}
