import { BlueprintMappings, BlueprintMapping, TSR, LookaheadMode } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { BlueprintConfig } from '../../helpers/config.js'
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

function lookStackMappings(
	channel: number
): Pick<
	BlueprintMappings,
	| CasparCGLayers.CasparCGLookBgLoop
	| CasparCGLayers.CasparCGClipPlayer2
	| CasparCGLayers.CasparCGPgmIluPlayer
	| CasparCGLayers.CasparCGPgmCamera
	| CasparCGLayers.CasparCGPgmDoubleBoxLoop
	| CasparCGLayers.CasparCGGraphicsPgmLowerThird
> {
	// NONE on compose layers: PRELOAD LOADBGs the *next* clip onto the live layer
	// during InTransition preroll and replaces the on-air producer early — visible as
	// DB→DB ILU cutting under the wipe, Full→Full black blinks, and stray `db_loop`
	// LOADBG during ZAVER while PGM is still `route://4`. Camera was already NONE.
	return {
		[CasparCGLayers.CasparCGLookBgLoop]: casparLayerMapping(channel, BgChannelLayers.BgLoop, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGClipPlayer2]: casparLayerMapping(channel, BgChannelLayers.ClipPlayer, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmIluPlayer]: casparLayerMapping(channel, BgChannelLayers.IluPlayer, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmCamera]: casparLayerMapping(channel, BgChannelLayers.Camera, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmDoubleBoxLoop]: casparLayerMapping(
			channel,
			BgChannelLayers.DoubleBoxLoop,
			LookaheadMode.NONE
		),
		// NONE: PRELOAD of the next L3D on the same CEF layer becomes CG UPDATE
		// (text swap, no in/out animation). Takes must STOP then ADD instead.
		[CasparCGLayers.CasparCGGraphicsPgmLowerThird]: casparLayerMapping(
			channel,
			BgChannelLayers.GraphicsLowerThird,
			LookaheadMode.NONE
		),
	}
}

function lookStackMappingsB(
	channel: number
): Pick<
	BlueprintMappings,
	| CasparCGLayers.CasparCGLookBgLoopB
	| CasparCGLayers.CasparCGClipPlayer2B
	| CasparCGLayers.CasparCGPgmIluPlayerB
	| CasparCGLayers.CasparCGPgmCameraB
	| CasparCGLayers.CasparCGPgmDoubleBoxLoopB
	| CasparCGLayers.CasparCGGraphicsPgmLowerThirdB
> {
	return {
		[CasparCGLayers.CasparCGLookBgLoopB]: casparLayerMapping(channel, BgChannelLayers.BgLoop, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGClipPlayer2B]: casparLayerMapping(channel, BgChannelLayers.ClipPlayer, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmIluPlayerB]: casparLayerMapping(channel, BgChannelLayers.IluPlayer, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmCameraB]: casparLayerMapping(channel, BgChannelLayers.Camera, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmDoubleBoxLoopB]: casparLayerMapping(
			channel,
			BgChannelLayers.DoubleBoxLoop,
			LookaheadMode.NONE
		),
		[CasparCGLayers.CasparCGGraphicsPgmLowerThirdB]: casparLayerMapping(
			channel,
			BgChannelLayers.GraphicsLowerThird,
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

export function getCasparCGMappings(config: BlueprintConfig): BlueprintMappings {
	const { ledChannel, pgmChannel, bgChannelA, bgChannelB, camIngestChannel } = getHypercomposedChannels(config)

	const mappings: BlueprintMappings = {
		[CasparCGLayers.CasparCGClipPlayer1]: casparLayerMapping(ledChannel, LedChannelLayers.ClipPlayer),
		[CasparCGLayers.CasparCGLedPodHeadline]: casparLayerMapping(ledChannel, LedChannelLayers.PodHeadline),
		[CasparCGLayers.CasparCGIluPlayer]: casparLayerMapping(ledChannel, LedChannelLayers.IluPlayer),
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

		...lookStackMappings(bgChannelA),
		...lookStackMappingsB(bgChannelB),

		[CasparCGLayers.CasparCGDebugLabelLed]: casparLayerMapping(ledChannel, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelPgm]: casparLayerMapping(pgmChannel, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelDoubleBox]: casparLayerMapping(bgChannelA, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelFull]: casparLayerMapping(bgChannelB, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelCamIngest]: casparLayerMapping(camIngestChannel, DEBUG_CHANNEL_LABEL_LAYER),
	}

	return mappings
}
