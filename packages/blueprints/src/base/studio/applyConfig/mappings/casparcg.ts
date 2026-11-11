import { BlueprintMappings, BlueprintMapping, TSR, LookaheadMode } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { BlueprintConfig, VisionMixerDevice } from '../../helpers/config.js'
import { CasparCGLayers } from '../../layers.js'
import {
	BgChannelLayers,
	CamIngestChannelLayers,
	LedChannelLayers,
	PgmChannelLayers,
	DEBUG_CHANNEL_LABEL_LAYER,
} from './casparcgLayers.js'

export interface HypercomposedChannelMap {
	ledChannel: number
	pgmChannel: number
	bgChannelA: number
	bgChannelB: number
	/** Render-only helper that holds the single live CAM (DeckLink / dshow). Default 5. */
	camIngestChannel: number
}

function nextFreeChannel(preferred: number, used: Set<number>): number {
	let channel = Number.isFinite(preferred) && preferred >= 1 ? Math.floor(preferred) : 1
	while (used.has(channel)) {
		channel++
	}
	used.add(channel)
	return channel
}

export function getHypercomposedChannels(config: BlueprintConfig): HypercomposedChannelMap {
	const hypercomposed = config.studio.casparcg.hypercomposed
	const used = new Set<number>()

	return {
		ledChannel: nextFreeChannel(hypercomposed?.ledChannel ?? 1, used),
		pgmChannel: nextFreeChannel(hypercomposed?.pgmChannel ?? 2, used),
		bgChannelA: nextFreeChannel(hypercomposed?.bgChannelA ?? 3, used),
		bgChannelB: nextFreeChannel(hypercomposed?.bgChannelB ?? 4, used),
		camIngestChannel: nextFreeChannel(hypercomposed?.camIngestChannel ?? 5, used),
	}
}

function casparLayerMapping(
	channel: number,
	layer: number,
	lookahead: LookaheadMode = LookaheadMode.NONE
): BlueprintMapping<TSR.MappingCasparCGLayer> {
	return literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
		device: TSR.DeviceType.CASPARCG,
		deviceId: 'casparcg0',
		lookahead,
		options: {
			mappingType: TSR.MappingCasparCGType.Layer,
			channel,
			layer,
		},
	})
}

/**
 * Paused LOADBG while the part is Next (Sofie PRELOAD). `lookaheadDepth` 1 +
 * `lookaheadMaxSearchDistance` **1** scopes the search to the *immediate* next
 * PartInstance only — a deeper same-channel part can never arm the live layer's
 * background (the pre-#126 failure: PRELOAD LOADBG'd a one-or-more-takes-ahead
 * clip and `PLAY` promoted the wrong/still-loading producer under the wipe).
 * Lookahead media objects are always emitted paused (`auto:false`, keyframes
 * stripped) so the off-air channel holds a cue'd first frame; the Take's
 * `playing:true` keyframe is then a bare `PLAY` promote (no cold decode → no
 * `bg_loop` blink on ILU→SYN hard cuts), and even an early vMix cut lands on the
 * loaded frame instead of a still-loading layer.
 */
function casparPreloadMapping(channel: number, layer: number): BlueprintMapping<TSR.MappingCasparCGLayer> {
	return literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
		device: TSR.DeviceType.CASPARCG,
		deviceId: 'casparcg0',
		lookahead: LookaheadMode.PRELOAD,
		lookaheadDepth: 1,
		lookaheadMaxSearchDistance: 1,
		options: {
			mappingType: TSR.MappingCasparCGType.Layer,
			channel,
			layer,
		},
	})
}

/** vMix: SYN/VT clips ride layer 120 above the phase-locked db_loop (118); Caspar keeps 111. */
function lookClipLayer(vmix: boolean): number {
	return vmix ? BgChannelLayers.VmixClipPlayer : BgChannelLayers.ClipPlayer
}

/**
 * vMix: db_loop is phase-locked from baseline and only changes opacity — lookahead
 * NONE so a LOADBG'd copy can never be promoted (`PLAY x-118` restarts the loop).
 */
function lookDoubleBoxLoopMapping(channel: number, vmix: boolean): BlueprintMapping<TSR.MappingCasparCGLayer> {
	return vmix
		? casparLayerMapping(channel, BgChannelLayers.DoubleBoxLoop, LookaheadMode.NONE)
		: casparPreloadMapping(channel, BgChannelLayers.DoubleBoxLoop)
}

function lookStackMappings(
	channel: number,
	lowerThird: { channel: number; layer: number } = { channel, layer: BgChannelLayers.GraphicsLowerThird },
	vmix = false
): Pick<
	BlueprintMappings,
	| CasparCGLayers.CasparCGLookBgLoop
	| CasparCGLayers.CasparCGClipPlayer2
	| CasparCGLayers.CasparCGPgmIluPlayer
	| CasparCGLayers.CasparCGPgmCamera
	| CasparCGLayers.CasparCGPgmDoubleBoxLoop
	| CasparCGLayers.CasparCGGraphicsPgmLowerThird
> {
	// PRELOAD (distance 1) on compose media layers: the immediate next part LOADBGs
	// paused onto the idle look channel while Next, so a hard cut / stinger cut
	// promotes an armed frame instead of cold-decoding (bg_loop blink). bgLoop +
	// L3D stay NONE (sticky loop never hot-cues; template PRELOAD becomes CG UPDATE).
	return {
		[CasparCGLayers.CasparCGLookBgLoop]: casparLayerMapping(channel, BgChannelLayers.BgLoop, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGClipPlayer2]: casparPreloadMapping(channel, lookClipLayer(vmix)),
		[CasparCGLayers.CasparCGPgmIluPlayer]: casparPreloadMapping(channel, BgChannelLayers.IluPlayer),
		[CasparCGLayers.CasparCGPgmCamera]: casparPreloadMapping(channel, BgChannelLayers.Camera),
		[CasparCGLayers.CasparCGPgmDoubleBoxLoop]: lookDoubleBoxLoopMapping(channel, vmix),
		// NONE: PRELOAD of the next L3D on the same CEF layer becomes CG UPDATE
		// (text swap, no in/out animation). Takes must STOP then ADD instead.
		[CasparCGLayers.CasparCGGraphicsPgmLowerThird]: casparLayerMapping(
			lowerThird.channel,
			lowerThird.layer,
			LookaheadMode.NONE
		),
	}
}

function lookStackMappingsB(
	channel: number,
	lowerThird: { channel: number; layer: number } = { channel, layer: BgChannelLayers.GraphicsLowerThird },
	vmix = false
): Pick<
	BlueprintMappings,
	| CasparCGLayers.CasparCGLookBgLoopB
	| CasparCGLayers.CasparCGClipPlayer2B
	| CasparCGLayers.CasparCGPgmIluPlayerB
	| CasparCGLayers.CasparCGPgmCameraB
	| CasparCGLayers.CasparCGPgmDoubleBoxLoopB
	| CasparCGLayers.CasparCGLookCalibCam
	| CasparCGLayers.CasparCGLookCalibFrame
	| CasparCGLayers.CasparCGGraphicsPgmLowerThirdB
> {
	return {
		[CasparCGLayers.CasparCGLookBgLoopB]: casparLayerMapping(channel, BgChannelLayers.BgLoop, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGClipPlayer2B]: casparPreloadMapping(channel, lookClipLayer(vmix)),
		[CasparCGLayers.CasparCGPgmIluPlayerB]: casparPreloadMapping(channel, BgChannelLayers.IluPlayer),
		[CasparCGLayers.CasparCGPgmCameraB]: casparPreloadMapping(channel, BgChannelLayers.Camera),
		[CasparCGLayers.CasparCGPgmDoubleBoxLoopB]: lookDoubleBoxLoopMapping(channel, vmix),
		// Pre-first-Take calibration look on BG B — spare layers so the per-part
		// OutOnRundownEnd EMPTY never fights show pieces on 115/118.
		[CasparCGLayers.CasparCGLookCalibCam]: casparLayerMapping(
			channel,
			BgChannelLayers.CalibrationCamera,
			LookaheadMode.NONE
		),
		[CasparCGLayers.CasparCGLookCalibFrame]: casparLayerMapping(
			channel,
			BgChannelLayers.CalibrationFrame,
			LookaheadMode.NONE
		),
		[CasparCGLayers.CasparCGGraphicsPgmLowerThirdB]: casparLayerMapping(
			lowerThird.channel,
			lowerThird.layer,
			LookaheadMode.NONE
		),
	}
}

/** Shared PRELOAD options for every PGM wipe EffectsPlayer mapping. */
function pgmWipeEffectsMapping(channel: number, layer: number): BlueprintMapping<TSR.MappingCasparCGLayer> {
	return literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
		device: TSR.DeviceType.CASPARCG,
		deviceId: 'casparcg0',
		lookahead: LookaheadMode.PRELOAD,
		lookaheadDepth: 1,
		lookaheadMaxSearchDistance: 100,
		options: {
			mappingType: TSR.MappingCasparCGType.Layer,
			channel,
			layer,
		},
	})
}

/**
 * One Sofie mapping + Caspar layer per wipe file so PRELOAD cannot evict a
 * different sting from the next Take (see cold-PLAY Latency 22–34f in Caspar logs).
 */
function pgmWipeEffectsMappings(
	pgmChannel: number
): Pick<
	BlueprintMappings,
	| CasparCGLayers.CasparCGPgmEffectsPlayer
	| CasparCGLayers.CasparCGPgmEffectsPlayerSjv
	| CasparCGLayers.CasparCGPgmEffectsPlayerSport
	| CasparCGLayers.CasparCGPgmEffectsPlayerPocasie
> {
	return {
		[CasparCGLayers.CasparCGPgmEffectsPlayer]: pgmWipeEffectsMapping(pgmChannel, PgmChannelLayers.EffectsPlayer),
		[CasparCGLayers.CasparCGPgmEffectsPlayerSjv]: pgmWipeEffectsMapping(pgmChannel, PgmChannelLayers.EffectsPlayerSjv),
		[CasparCGLayers.CasparCGPgmEffectsPlayerSport]: pgmWipeEffectsMapping(
			pgmChannel,
			PgmChannelLayers.EffectsPlayerSport
		),
		[CasparCGLayers.CasparCGPgmEffectsPlayerPocasie]: pgmWipeEffectsMapping(
			pgmChannel,
			PgmChannelLayers.EffectsPlayerPocasie
		),
	}
}

/** Caspar program-switch + cam-ingest layers that vMix replaces (input switch, stingers, decklink). */
export const VMIX_RETIRED_CASPAR_LAYERS: ReadonlyArray<CasparCGLayers> = [
	CasparCGLayers.CasparCGPgmRouteA,
	CasparCGLayers.CasparCGPgmRoute,
	CasparCGLayers.CasparCGPgmEffectsPlayer,
	CasparCGLayers.CasparCGPgmEffectsPlayerSjv,
	CasparCGLayers.CasparCGPgmEffectsPlayerSport,
	CasparCGLayers.CasparCGPgmEffectsPlayerPocasie,
	CasparCGLayers.CasparCGPgmCameraIngest,
	CasparCGLayers.CasparCGDebugLabelCamIngest,
]

export function getCasparCGMappings(config: BlueprintConfig): BlueprintMappings {
	const { ledChannel, pgmChannel, bgChannelA, bgChannelB, camIngestChannel } = getHypercomposedChannels(config)
	// vMix switches program: the PGM channel carries clean GFX. Headline L3Ds stay
	// there; all other L3Ds ride their look feed so transitions remove them atomically.
	const vmixProgram = config.studio.visionMixer.type === VisionMixerDevice.VMix

	const mappings: BlueprintMappings = {
		[CasparCGLayers.CasparCGClipPlayer1]: casparLayerMapping(ledChannel, LedChannelLayers.ClipPlayer),
		[CasparCGLayers.CasparCGLedPodHeadline]: casparLayerMapping(ledChannel, LedChannelLayers.PodHeadline),
		[CasparCGLayers.CasparCGLedTestframe]: casparLayerMapping(ledChannel, LedChannelLayers.TestFrame),
		// PRELOAD (distance 1): while ZAVER+AVIZO is Next — i.e. from the moment the
		// weather GFX starts — `LOADBG 1-115` arms `gfx/ilu-zaver`'s media paused, so
		// the PLAY at the leave-weather cover cut is a hot promote (it previously
		// cold-started and landed after the wipe had already ended). Also pre-cues
		// headline ILUs on the same layer.
		[CasparCGLayers.CasparCGIluPlayer]: casparPreloadMapping(ledChannel, LedChannelLayers.IluPlayer),
		[CasparCGLayers.CasparCGClipPlayerPreview]: casparLayerMapping(ledChannel, LedChannelLayers.ClipPreview),
		[CasparCGLayers.CasparCGEffectsPlayer]: casparLayerMapping(ledChannel, LedChannelLayers.EffectsPlayer),
		[CasparCGLayers.CasparCGGraphicsTicker]: casparLayerMapping(ledChannel, LedChannelLayers.GraphicsTicker),
		[CasparCGLayers.CasparCGGraphicsLowerThird]: casparLayerMapping(ledChannel, LedChannelLayers.GraphicsLowerThird),
		[CasparCGLayers.CasparCGGraphicsStrap]: casparLayerMapping(ledChannel, LedChannelLayers.GraphicsStrap),
		[CasparCGLayers.CasparCGAudioBed]: casparLayerMapping(ledChannel, LedChannelLayers.AudioBed),

		// Dual always-live PGM routes (A=110 route://3, B=111 route://4). Takes never
		// re-PLAY a route producer — they only swap opacity/volume so a one-tick skew
		// cannot leave a black hole on channel 2.
		[CasparCGLayers.CasparCGPgmRouteA]: casparLayerMapping(pgmChannel, PgmChannelLayers.RouteA),
		[CasparCGLayers.CasparCGPgmRoute]: casparLayerMapping(pgmChannel, PgmChannelLayers.RouteB),
		// PRELOAD + explicit hot-PLAY cue on the wipe overlay (playing:false LOADBG,
		// keyframe playing:true at Take). Sofie PRELOAD while Next strips the PLAY
		// keyframe so Caspar LOADBGs the paused sting; Take applies hot PLAY. NONE
		// cold-starts PLAY at Take (~40–60f ffmpeg latency) so the cover-cut lands
		// before the sting is on screen — countup / route:// flip flash under an
		// incomplete wipe. Deep search: classical wipe Takes can sit more than the
		// default 10 objects ahead when headlines / beds intervene.
		//
		// One Sofie mapping (+ physical Caspar layer) **per wipe file**. A single
		// shared 205 meant PRELOAD of `wipe_sjv` destroyed LOADBG'd `wipe.mov`
		// (Caspar log: `wipe_sjv Destroyed` then cold `PLAY 2-205 "wipes/wipe"`
		// Latency:32) while air cut still assumed hot (~0–19f).
		...pgmWipeEffectsMappings(pgmChannel),
		[CasparCGLayers.CasparCGPgmIntroPlayer]: casparLayerMapping(pgmChannel, PgmChannelLayers.IntroOverlay),
		[CasparCGLayers.CasparCGGraphicsLogo]: casparLayerMapping(pgmChannel, PgmChannelLayers.GraphicsLogo),
		[CasparCGLayers.CasparCGAudioBedPgm]: casparLayerMapping(pgmChannel, PgmChannelLayers.AudioBed),

		// Sole DeckLink / dshow open — looks sample via route://camIngestChannel on layer 115.
		[CasparCGLayers.CasparCGPgmCameraIngest]: casparLayerMapping(
			camIngestChannel,
			CamIngestChannelLayers.Camera,
			LookaheadMode.NONE
		),

		...lookStackMappings(bgChannelA, undefined, vmixProgram),
		...lookStackMappingsB(bgChannelB, undefined, vmixProgram),
		[CasparCGLayers.CasparCGGraphicsHeadline]: casparLayerMapping(
			pgmChannel,
			PgmChannelLayers.GraphicsLowerThird,
			LookaheadMode.NONE
		),

		[CasparCGLayers.CasparCGDebugLabelLed]: casparLayerMapping(ledChannel, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelPgm]: casparLayerMapping(pgmChannel, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelDoubleBox]: casparLayerMapping(bgChannelA, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelFull]: casparLayerMapping(bgChannelB, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelCamIngest]: casparLayerMapping(camIngestChannel, DEBUG_CHANNEL_LABEL_LAYER),
	}

	if (vmixProgram) {
		for (const layer of VMIX_RETIRED_CASPAR_LAYERS) {
			delete mappings[layer]
		}
	}

	return mappings
}
