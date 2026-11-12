import { TSR } from '@sofie-automation/blueprints-integration'

import { assertUnreachable, literal } from '../../../common/util.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { StudioConfig, VisionMixerDevice } from '../../studio/helpers/config.js'
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

/** vMix input index of the composite look input for the slot (A or B). */
export function getVmixLookInput(config: StudioConfig, slot: 'A' | 'B'): number {
	return slot === 'A' ? config.vmixProgram.lookAInput : config.vmixProgram.lookBInput
}

/**
 * NDI look feed input for the slot — layered ABOVE the camera on the composite look
 * input (cam layer 1, feed layer 2). `0`/unset → legacy cam-on-top mode (no feed layer).
 * Returns 0 when it equals the look input itself (never self-layer an input).
 */
export function getVmixLookFeedInput(config: StudioConfig, slot: 'A' | 'B'): number {
	const feed = slot === 'A' ? config.vmixProgram.lookAFeedInput : config.vmixProgram.lookBFeedInput
	const look = getVmixLookInput(config, slot)
	return typeof feed === 'number' && feed > 0 && feed !== look ? feed : 0
}

/** vMix input index of the clean-GFX feed (Overlay 1). */
export function getVmixCleanGfxInput(config: StudioConfig): number {
	return config.vmixProgram.cleanGfxInput
}

/** vMix input index of the studio camera layered on the look inputs. */
export function getVmixCameraInput(config: StudioConfig): number {
	return config.vmixProgram.cameraInput
}

/** Classical `wipes/wipe` → Stinger1; themed SJV / ŠPORT / Počasie → Stinger2–4. */
export function vmixStingerForWipeFile(wipeFile: string | undefined): TSR.VMixTransitionType {
	return (
		VMIX_STINGER_BY_WIPE.find(({ match }) => match.test(wipeFile ?? ''))?.stinger ?? TSR.VMixTransitionType.Stinger1
	)
}

/** vMix Stinger1–4 ignore the transition's Input and sting whatever sits in Preview — lead the PROGRAM by this much so the lead PREVIEW (incoming look) is already selected. */
export const VMIX_STINGER_PREVIEW_LEAD_MS = 40

/**
 * Measured Caspar RESUME/LOAD → picture visible in vMix program latency
 * (~283–344 ms on the studio feed). Used to place off-air EMPTYs / preview
 * reveals so their effect lands just after the vMix cut.
 */
export const VMIX_CASPAR_FEED_LATENCY_MS = 300

/** Extra headroom added to the off-air point so the Caspar state change lands past the vMix cut. */
export const VMIX_OFF_AIR_MARGIN_MS = 140

/** Worst-case measured RESUME → picture latency on the studio feed (~283–344 ms). */
export const VMIX_CASPAR_FEED_LATENCY_MAX_MS = 344

/**
 * Hard-cut RESUME lead: the worst-case feed latency plus one 25fps frame of
 * headroom, so the first moving frame reaches vMix before the Cut even at the
 * measured upper bound.
 */
export const VMIX_HARD_CUT_RESUME_LEAD_MS = VMIX_CASPAR_FEED_LATENCY_MAX_MS + 40

/** Default stinger cut point measured from the stinger PROGRAM command (~960 ms on the studio). */
export const DEFAULT_VMIX_STINGER_CUT_POINT_MS = 960

/** Studio `vmixProgram.stingerCutPointMs` (optional) — stinger cut measured from the stinger PROGRAM command. */
export function getVmixStingerCutPointMs(config: StudioConfig): number {
	const raw = config.vmixProgram?.stingerCutPointMs
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
		return Math.floor(raw)
	}
	return DEFAULT_VMIX_STINGER_CUT_POINT_MS
}

/**
 * Take-relative vMix program cut: hard cuts `Cut` at the keepalive; wiped Takes
 * cut when the stinger (fired at {@link VMIX_STINGER_PREVIEW_LEAD_MS}) reaches
 * its configured cut point.
 */
export function vmixProgramCutMs(config: StudioConfig, hasWipe: boolean, hardCutKeepaliveMs: number): number {
	return hasWipe ? VMIX_STINGER_PREVIEW_LEAD_MS + getVmixStingerCutPointMs(config) : hardCutKeepaliveMs
}

/** Take-relative point where the outgoing look channel goes off air (EMPTY / preview reveal). */
export function vmixOutgoingOffAirMs(config: StudioConfig, hasWipe: boolean, hardCutKeepaliveMs: number): number {
	return Math.max(
		0,
		vmixProgramCutMs(config, hasWipe, hardCutKeepaliveMs) - VMIX_CASPAR_FEED_LATENCY_MS + VMIX_OFF_AIR_MARGIN_MS
	)
}

/**
 * Take-shaped vMix program switch: PROGRAM moves to the incoming look input at `start`
 * (stinger from Take, or CUT after the hard-cut keepalive) and PREVIEW follows to the
 * outgoing input — the idle channel the next look composes on. For stingers, a lead
 * PREVIEW first selects the incoming input, since Stinger1–4 transition the current
 * Preview rather than the Input passed to TRANSITION.
 */
export function createVMixTakeTimelineObjects(
	input: number,
	options: { start: number; transition: TSR.VMixTransition; previewInput?: number }
): TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] {
	const isStinger = options.transition.effect !== TSR.VMixTransitionType.Cut
	const previewLeadMs = isStinger ? VMIX_STINGER_PREVIEW_LEAD_MS : 0
	const objects: TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] = []
	if (isStinger) {
		objects.push(
			literal<TimelineBlueprintExt<TSR.TimelineContentVMixPreview>>({
				id: '',
				enable: {
					start: options.start,
					duration: VMIX_STINGER_PREVIEW_LEAD_MS + options.transition.duration + 40,
				},
				layer: VMixLayers.VMixMePreview,
				content: {
					deviceType: TSR.DeviceType.VMIX,
					type: TSR.TimelineContentTypeVMix.PREVIEW,
					input,
				},
				priority: 1,
			})
		)
	}
	objects.push(
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixProgram>>({
			id: '',
			enable: { start: options.start + previewLeadMs },
			layer: VMixLayers.VMixMeProgram,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.PROGRAM,
				input,
				transition: options.transition,
			},
			priority: 1,
		})
	)
	if (options.previewInput !== undefined) {
		objects.push(
			literal<TimelineBlueprintExt<TSR.TimelineContentVMixPreview>>({
				id: '',
				enable: { start: options.start + previewLeadMs + options.transition.duration + 40 },
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
