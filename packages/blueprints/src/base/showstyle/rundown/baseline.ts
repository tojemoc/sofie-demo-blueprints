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
import {
	getVmixCameraInput,
	getVmixCleanGfxInput,
	getVmixLookFeedInput,
	getVmixLookInput,
	usesVmixProgram,
} from '../helpers/visionMixer.js'
import { createDebugChannelLabelTimeline } from '../helpers/debugChannelLabels.js'
import {
	createCameraIngestBaselineTimeline,
	createDoubleBoxBaselineCameraTimeline,
	createFullLookBaselineCameraTimeline,
	createLookCameraTimelineContent,
	getPgmCameraProducer,
	PgmCameraTimelineContent,
	vmixLayerTransformFromFill,
} from '../helpers/pgmCamera.js'
import {
	createFullChannelRouteContent,
	createStickyWipeBaselineTimeline,
	PGM_ROUTE_LAYERS,
} from '../helpers/pgmLook.js'
import { LED_POD_HEADLINE_FILE } from '../helpers/ledPodHeadline.js'
import { DOUBLEBOX_LOOP_FILE } from '../helpers/doubleboxLoop.js'
import { CALIBRATION_FRAME_FILE, LED_TEST_FRAME_FILE } from '../helpers/studioCalibration.js'
import {
	PGM_DOUBLEBOX_CAMERA_FILL,
	PGM_FULLSCREEN_CAMERA_FILL,
} from '../../studio/applyConfig/mappings/casparcgLayers.js'
import { getHypercomposedChannels } from '../../studio/applyConfig/mappings/casparcg.js'

/** Caspar PLAY path (no extension) for the LED background loop on clip layer 110. */
export const LED_BACKGROUND_LOOP_FILE = 'loops/bg_loop'

// Defined in helpers/countupReveal.ts so countupReveal does not have to import
// baseline (baseline → pgmLook → countupReveal would form a module cycle).
export { PGM_COUNTUP_FILE } from '../helpers/countupReveal.js'

/** Rundown-activation baseline: LED/look underlays, calibration frames, beds, routes and mixer program/preview seeding per studio type. */
export function getBaseline(context: IShowStyleUserContext): BlueprintResultBaseline {
	const config = parseConfig(context).studio
	const vmixProgram = usesVmixProgram(config)

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

			// Sticky look bg_loop on BOTH BG A and BG B (layer 110). SYN/VT live on
			// ClipPlayer (111) so CLEAR/EMPTY of a clip cannot darken the CAM pane —
			// bg_loop shows through the transparent cam cutout (blue pane).
			// Live CAM opens once on the ingest helper (ch5); looks PLAY route://5 on 115.
			// vMix studios keep the look channels transparent (the camera lives on the
			// vMix look inputs) — no bg_loop; instead both slots run a phase-locked
			// opacity-0 db_loop so DoubleBox takes reveal, never restart, the frame.
			// Exception — legacy vMix without look feed inputs: there is no static
			// camera under the NDI feed on the look input, so a transparent channel
			// shows black. Keep the bg_loop underlay per slot without a feed input
			// so an unwiped VT/VO has a visible picture until its clip feed is up.
			...(config.casparcg.hypercomposed
				? [
						...(vmixProgram
							? ([CasparCGLayers.CasparCGPgmDoubleBoxLoop, CasparCGLayers.CasparCGPgmDoubleBoxLoopB] as const).map(
									(layer) =>
										literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
											id: '',
											enable: { while: 1 },
											priority: 0,
											layer,
											content: {
												deviceType: TSR.DeviceType.CASPARCG,
												type: TSR.TimelineContentTypeCasparCg.MEDIA,
												file: DOUBLEBOX_LOOP_FILE,
												loop: true,
												mixer: { opacity: 0 },
											},
										})
								)
							: []),
						...(vmixProgram
							? (
									[
										{ layer: CasparCGLayers.CasparCGLookBgLoop, slot: 'A' },
										{ layer: CasparCGLayers.CasparCGLookBgLoopB, slot: 'B' },
									] as const
								)
									.filter(({ slot }) => getVmixLookFeedInput(config, slot) === 0)
									.map(({ layer }) =>
										literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
											id: '',
											enable: { while: 1 },
											priority: 0,
											layer,
											content: {
												deviceType: TSR.DeviceType.CASPARCG,
												type: TSR.TimelineContentTypeCasparCg.MEDIA,
												file: LED_BACKGROUND_LOOP_FILE,
												loop: true,
											},
										})
									)
							: [
									literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
										id: '',
										enable: { while: 1 },
										priority: 0,
										layer: CasparCGLayers.CasparCGLookBgLoop,
										content: {
											deviceType: TSR.DeviceType.CASPARCG,
											type: TSR.TimelineContentTypeCasparCg.MEDIA,
											file: LED_BACKGROUND_LOOP_FILE,
											loop: true,
										},
									}),
									literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
										id: '',
										enable: { while: 1 },
										priority: 0,
										layer: CasparCGLayers.CasparCGLookBgLoopB,
										content: {
											deviceType: TSR.DeviceType.CASPARCG,
											type: TSR.TimelineContentTypeCasparCg.MEDIA,
											file: LED_BACKGROUND_LOOP_FILE,
											loop: true,
										},
									}),
								]),
						...(vmixProgram ? [] : getCasparProgramBaseline(config)),
						// LED pod underlay for opening headlines — visible from Activate/Rehearsal
						// (not only after first Take). Cleared on first DoubleBox Take.
						literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
							id: '',
							enable: { while: 1 },
							priority: 0,
							layer: CasparCGLayers.CasparCGLedPodHeadline,
							content: {
								deviceType: TSR.DeviceType.CASPARCG,
								type: TSR.TimelineContentTypeCasparCg.MEDIA,
								file: LED_POD_HEADLINE_FILE,
								loop: true,
							},
						}),
						// Studio calibration until the first Take — killed by the per-part
						// OutOnRundownEnd EMPTY (createStudioCalibrationClearPiece). LED gets
						// the presenter-alignment test frame; the on-air look channel (B)
						// gets the DoubleBox frame so framing can be checked live on PGM.
						literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
							id: '',
							enable: { while: 1 },
							priority: 0,
							layer: CasparCGLayers.CasparCGLedTestframe,
							content: {
								deviceType: TSR.DeviceType.CASPARCG,
								type: TSR.TimelineContentTypeCasparCg.MEDIA,
								file: LED_TEST_FRAME_FILE,
							},
						}),
						literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
							id: '',
							enable: { while: 1 },
							priority: 0,
							layer: CasparCGLayers.CasparCGLookCalibFrame,
							content: {
								deviceType: TSR.DeviceType.CASPARCG,
								type: TSR.TimelineContentTypeCasparCg.MEDIA,
								file: CALIBRATION_FRAME_FILE,
								loop: true,
							},
						}),
						// Caspar-switched studios: live CAM inside the db_loop window on a
						// spare look-B layer. vMix studios layer the camera on the look
						// input instead (getVMixProgramBaseline) — no route:// ingest there.
						...(!vmixProgram
							? ([createLookBCalibrationCameraTimeline(config)].filter(
									(obj): obj is TimelineBlueprintExt<PgmCameraTimelineContent> => obj !== undefined
								) as TimelineBlueprintExt[])
							: []),
					]
				: []),

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

			...createBackgroundMusicBaselineTimeline(config),

			...createDebugChannelLabelTimeline(config),

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

/**
 * Caspar-switched program only: live CAM framed into the DoubleBox window on a
 * spare look-B layer (117) for the pre-first-Take calibration look.
 */
function createLookBCalibrationCameraTimeline(
	config: StudioConfig
): TimelineBlueprintExt<PgmCameraTimelineContent> | undefined {
	const producer = getPgmCameraProducer(config)
	if (!producer) return undefined
	return literal<TimelineBlueprintExt<PgmCameraTimelineContent>>({
		id: '',
		enable: { while: 1 },
		priority: 0,
		layer: CasparCGLayers.CasparCGLookCalibCam,
		content: createLookCameraTimelineContent(config, producer, {
			fill: { ...PGM_DOUBLEBOX_CAMERA_FILL },
		}),
	})
}

/**
 * Caspar-switched program only: dual always-live PGM routes (baseline shows BG B, Takes swap
 * opacity/volume — never re-PLAY), look CAM pre-warm via the ingest channel, and sticky
 * opacity-0 wipe LOADBG on every EffectsPlayer (205–208) so idle layers never LOADBG "EMPTY".
 */
/**
 * vMix-switched program: look B on air until the first Take (matches the Caspar baseline
 * route), and both look inputs with no camera layer so a finished CAM piece clears it.
 */
function getVMixProgramBaseline(config: StudioConfig): TimelineBlueprintExt[] {
	const lookB = getVmixLookInput(config, 'B')
	const lookInputs = [VMixLayers.VMixLookInputA, VMixLayers.VMixLookInputB] as const
	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixProgram>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: VMixLayers.VMixMeProgram,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.PROGRAM,
				input: lookB,
			},
		}),
		...lookInputs.map((layer) => {
			const slot = layer === VMixLayers.VMixLookInputA ? 'A' : 'B'
			const feedInput = getVmixLookFeedInput(config, slot)
			const cameraInput = getVmixCameraInput(config)
			const layers: TSR.VMixLayers = {}
			if (feedInput > 0) {
				// Static camera on layer 1 of BOTH look inputs (fullscreen at rest —
				// camera parts re-assert their own FILL) under the NDI feed on 2.
				if (cameraInput > 0) {
					layers[1] = {
						input: cameraInput,
						...vmixLayerTransformFromFill(PGM_FULLSCREEN_CAMERA_FILL),
					}
				}
				layers[2] = { input: feedInput }
			}
			// Pre-first-Take framing aid on the baseline on-air look (B): camera in the
			// DoubleBox window, drawn ABOVE the NDI feed. Any Take that claims look B
			// replaces this baseline INPUT object, clearing the calibration layer.
			if (cameraInput > 0 && slot === 'B') {
				layers[feedInput > 0 ? 3 : 1] = {
					input: cameraInput,
					...vmixLayerTransformFromFill(PGM_DOUBLEBOX_CAMERA_FILL),
				}
			}
			return literal<TimelineBlueprintExt<TSR.TimelineContentVMixInput>>({
				id: '',
				enable: { while: 1 },
				priority: 0,
				layer,
				content: {
					deviceType: TSR.DeviceType.VMIX,
					type: TSR.TimelineContentTypeVMix.INPUT,
					// No camera layer at rest; keep the NDI look feed on layer 2 above
					// the (now empty) camera layer when feed inputs are configured.
					layers,
				},
			})
		}),
		// Stingers transition the Preview input — seed it with look A so the first
		// stung Take (to A — B is on air) airs the right feed even before the lead PREVIEW lands.
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixPreview>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: VMixLayers.VMixMePreview,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.PREVIEW,
				input: getVmixLookInput(config, 'A'),
			},
		}),
	]
}

/** Caspar-PGM baseline: dual always-live look routes and look CAM pre-warm. */
function getCasparProgramBaseline(config: StudioConfig): TimelineBlueprintExt[] {
	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: PGM_ROUTE_LAYERS.A,
			content: {
				...createFullChannelRouteContent(getHypercomposedChannels({ studio: config }).bgChannelA),
				mixer: { opacity: 0, volume: 0 },
			},
		}),
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: PGM_ROUTE_LAYERS.B,
			content: {
				...createFullChannelRouteContent(getHypercomposedChannels({ studio: config }).bgChannelB),
				mixer: { opacity: 1, volume: 1 },
			},
		}),
		// Pre-warm look CAM on both A (DoubleBox FILL) and B (fullscreen) so
		// the first Take only RESUMEs — no cold PLAY of route://5 / bg_loop.
		...([
			createCameraIngestBaselineTimeline(config),
			createFullLookBaselineCameraTimeline(config),
			createDoubleBoxBaselineCameraTimeline(config),
		].filter(
			(obj): obj is NonNullable<ReturnType<typeof createCameraIngestBaselineTimeline>> => obj !== undefined
		) as TimelineBlueprintExt[]),
		// Sticky opacity-0 wipe LOADBG on every EffectsPlayer (205–208).
		// Without these, idle layers resolve to nothing and TSR emits
		// LOADBG … "EMPTY", destroying the next Take's PRELOAD.
		...createStickyWipeBaselineTimeline(),
	]
}

/** ATEM baseline: DSK graphics overlay + audio mappings. */
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

/** vMix baseline: clean-GFX overlay and, for program studios, the look program/preview objects. */
function getVMixBaseline(config: StudioConfig): TimelineBlueprintExt[] {
	const dskInput = usesVmixProgram(config)
		? getVmixCleanGfxInput(config)
		: (Object.values<VmixInputConfig>(config.vmixSources).find((source) => source.type === SourceType.Graphics)
				?.input ?? -1)

	return [
		...(usesVmixProgram(config) ? getVMixProgramBaseline(config) : []),
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixOverlay>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer: VMixLayers.VMixOverlayGraphics,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.OVERLAY,

				input: dskInput,
			},
		}),
	]
}
