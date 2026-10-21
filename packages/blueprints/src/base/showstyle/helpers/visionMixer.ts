import { TSR } from '@sofie-automation/blueprints-integration'
import { assertUnreachable, literal } from '../../../common/util.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../../studio/helpers/config.js'
import { VmixInputConfig } from '../../../$schemas/generated/main-studio-config.js'
import { AtemLayers, VMixLayers } from '../../studio/layers.js'

export function createAtemInputTimelineObjects(
	input: number,
	start = 0,
	transitionDuration = 40,
	transitionProps?: Omit<TSR.TimelineContentAtemME['me'], 'programInput' | 'previewInput'>
): TimelineBlueprintExt<TSR.TimelineContentAtemME>[] {
	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentAtemME>>({
			id: '',
			enable: { start: start },
			layer: AtemLayers.AtemMeProgram,
			content: {
				deviceType: TSR.DeviceType.ATEM,
				type: TSR.TimelineContentTypeAtem.ME,

				me: {
					programInput: input,
				},
			},
			keyframes: [
				{
					id: '',
					enable: {
						start: 0,
						duration: transitionDuration, // only used to do the transition
					},
					content: {
						me: {
							input: input,
							transition: TSR.AtemTransitionStyle.CUT,
							...(transitionProps || {}),
						},
					},
				},
			],
			priority: 1,
		}),
		// Add object for preview
		literal<TimelineBlueprintExt<TSR.TimelineContentAtemME>>({
			id: '',
			enable: { start: start },
			layer: AtemLayers.AtemMePreview,
			content: {
				deviceType: TSR.DeviceType.ATEM,
				type: TSR.TimelineContentTypeAtem.ME,

				me: {
					previewInput: 0,
				},
			},
			keyframes: [
				{
					id: '',
					enable: {
						start: transitionDuration + 40, // after the transition keyframe
					},
					content: {
						me: {
							previewInput: input,
						},
					},
					preserveForLookahead: true,
				},
			],
			priority: 1,
		}),
	]
}

export function createVMixTimelineObjects(
	input: number,
	start = 0,
	transitionDuration = 40,
	transitionProps?: TSR.VMixTransition
): TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] {
	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixProgram>>({
			id: '',
			enable: { start: start },
			layer: VMixLayers.VMixMeProgram,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.PROGRAM,

				input,
				transition: transitionProps,
			},
			priority: 1,
		}),

		// Add object for preview
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixPreview>>({
			id: '',
			enable: { start: start },
			layer: VMixLayers.VMixMePreview,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.PREVIEW,

				input: 0,
			},
			keyframes: [
				{
					id: '',
					enable: {
						start: transitionDuration + 40, // after the transition keyframe
					},
					content: {
						input,
					},
					preserveForLookahead: true,
				},
			],
			priority: 1,
		}),
	]
}

export function createVisionMixerObjects(
	config: StudioConfig,
	input: number,
	start = 0,
	transitionDuration = 40,
	transitionProps?: {
		atemTransitionProps?: Omit<TSR.TimelineContentAtemME['me'], 'programInput' | 'previewInput'>
		vmixTransitionProps?: TSR.VMixTransition
	}
): TimelineBlueprintExt<TSR.TimelineContentVMixAny | TSR.TimelineContentAtemAny>[] {
	if (config.visionMixer.type === VisionMixerDevice.Atem) {
		return createAtemInputTimelineObjects(input, start, transitionDuration, transitionProps?.atemTransitionProps)
	} else if (config.visionMixer.type === VisionMixerDevice.VMix) {
		return createVMixTimelineObjects(input, start, transitionDuration, transitionProps?.vmixTransitionProps)
	} else {
		assertUnreachable(config.visionMixer.type)
		return []
	}
}

/**
 * `vmixSources` keys for the hypercomposed vMix program bus: the two Caspar look feeds that
 * alternate on Takes and the clean-GFX feed keyed over program. Camera is the first
 * `SourceType.Camera` entry.
 */
export const VMIX_LOOK_SOURCE_KEYS = { A: 'lookA', B: 'lookB' } as const
export const VMIX_CLEAN_GFX_SOURCE_KEY = 'cleanGfx'
/** `vmixSources` keys for the kolíska beds vMix plays (Caspar beds are not emitted on vMix studios). */
export const VMIX_BED_SOURCE_KEYS = { A: 'bedA', C: 'bedC' } as const

/** vMix stinger slot per wipe file — slots are loaded with the matching wipe in vMix. */
const VMIX_STINGER_BY_WIPE: ReadonlyArray<{ match: RegExp; stinger: TSR.VMixTransitionType }> = [
	{ match: /wipe_sjv/i, stinger: TSR.VMixTransitionType.Stinger2 },
	{ match: /wipe_sport/i, stinger: TSR.VMixTransitionType.Stinger3 },
	{ match: /wipe_pocasie/i, stinger: TSR.VMixTransitionType.Stinger4 },
]

/** True when vMix (not Caspar PGM) switches the hypercomposed look program. */
export function usesVmixProgram(config: StudioConfig): boolean {
	return config.visionMixer.type === VisionMixerDevice.VMix && Boolean(config.casparcg.hypercomposed)
}

export function getVmixLookInput(config: StudioConfig, slot: 'A' | 'B'): number | undefined {
	return config.vmixSources[VMIX_LOOK_SOURCE_KEYS[slot]]?.input
}

export function getVmixCleanGfxInput(config: StudioConfig): number | undefined {
	return config.vmixSources[VMIX_CLEAN_GFX_SOURCE_KEY]?.input
}

export function getVmixCameraInput(config: StudioConfig): number | undefined {
	return Object.values<VmixInputConfig>(config.vmixSources).find((source) => source.type === SourceType.Camera)?.input
}

/** Classical `wipes/wipe` → Stinger1; themed SJV / ŠPORT / Počasie → Stinger2–4. */
export function vmixStingerForWipeFile(wipeFile: string | undefined): TSR.VMixTransitionType {
	return (
		VMIX_STINGER_BY_WIPE.find(({ match }) => match.test(wipeFile ?? ''))?.stinger ?? TSR.VMixTransitionType.Stinger1
	)
}

/**
 * Take-shaped vMix program switch: PROGRAM moves to the incoming look input at `start`
 * (stinger from Take, or CUT after the hard-cut keepalive) and PREVIEW follows to the
 * outgoing input — the idle channel the next look composes on.
 */
export function createVMixTakeTimelineObjects(
	input: number,
	options: { start: number; transition: TSR.VMixTransition; previewInput?: number }
): TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] {
	const objects: TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] = [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixProgram>>({
			id: '',
			enable: { start: options.start },
			layer: VMixLayers.VMixMeProgram,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.PROGRAM,
				input,
				transition: options.transition,
			},
			priority: 1,
		}),
	]
	if (options.previewInput !== undefined) {
		objects.push(
			literal<TimelineBlueprintExt<TSR.TimelineContentVMixPreview>>({
				id: '',
				enable: { start: options.start + options.transition.duration + 40 },
				layer: VMixLayers.VMixMePreview,
				content: {
					deviceType: TSR.DeviceType.VMIX,
					type: TSR.TimelineContentTypeVMix.PREVIEW,
					input: options.previewInput,
				},
				priority: 1,
			})
		)
	}
	return objects
}
