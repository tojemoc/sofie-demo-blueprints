import { BlueprintMappings, BlueprintMapping, TSR, LookaheadMode } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { BlueprintConfig } from '../../helpers/config.js'
import { CasparCGLayers } from '../../layers.js'
import { BgChannelLayers, LedChannelLayers, PgmChannelLayers, DEBUG_CHANNEL_LABEL_LAYER } from './casparcgLayers.js'

export interface HypercomposedChannelMap {
	ledChannel: number
	pgmChannel: number
	bgChannelA: number
	bgChannelB: number
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
	| CasparCGLayers.CasparCGClipPlayer2
	| CasparCGLayers.CasparCGPgmIluPlayer
	| CasparCGLayers.CasparCGPgmCamera
	| CasparCGLayers.CasparCGPgmDoubleBoxLoop
	| CasparCGLayers.CasparCGGraphicsPgmLowerThird
> {
	return {
		[CasparCGLayers.CasparCGClipPlayer2]: casparLayerMapping(
			channel,
			BgChannelLayers.ClipPlayer,
			LookaheadMode.PRELOAD
		),
		[CasparCGLayers.CasparCGPgmIluPlayer]: casparLayerMapping(
			channel,
			BgChannelLayers.IluPlayer,
			LookaheadMode.PRELOAD
		),
		[CasparCGLayers.CasparCGPgmCamera]: casparLayerMapping(channel, BgChannelLayers.Camera, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmDoubleBoxLoop]: casparLayerMapping(
			channel,
			BgChannelLayers.DoubleBoxLoop,
			LookaheadMode.PRELOAD
		),
		[CasparCGLayers.CasparCGGraphicsPgmLowerThird]: casparLayerMapping(
			channel,
			BgChannelLayers.GraphicsLowerThird,
			LookaheadMode.PRELOAD
		),
	}
}

function lookStackMappingsB(
	channel: number
): Pick<
	BlueprintMappings,
	| CasparCGLayers.CasparCGClipPlayer2B
	| CasparCGLayers.CasparCGPgmIluPlayerB
	| CasparCGLayers.CasparCGPgmCameraB
	| CasparCGLayers.CasparCGPgmDoubleBoxLoopB
	| CasparCGLayers.CasparCGGraphicsPgmLowerThirdB
> {
	return {
		[CasparCGLayers.CasparCGClipPlayer2B]: casparLayerMapping(
			channel,
			BgChannelLayers.ClipPlayer,
			LookaheadMode.PRELOAD
		),
		[CasparCGLayers.CasparCGPgmIluPlayerB]: casparLayerMapping(
			channel,
			BgChannelLayers.IluPlayer,
			LookaheadMode.PRELOAD
		),
		[CasparCGLayers.CasparCGPgmCameraB]: casparLayerMapping(channel, BgChannelLayers.Camera, LookaheadMode.NONE),
		[CasparCGLayers.CasparCGPgmDoubleBoxLoopB]: casparLayerMapping(
			channel,
			BgChannelLayers.DoubleBoxLoop,
			LookaheadMode.PRELOAD
		),
		[CasparCGLayers.CasparCGGraphicsPgmLowerThirdB]: casparLayerMapping(
			channel,
			BgChannelLayers.GraphicsLowerThird,
			LookaheadMode.PRELOAD
		),
	}
}

export function getCasparCGMappings(config: BlueprintConfig): BlueprintMappings {
	const { ledChannel, pgmChannel, bgChannelA, bgChannelB } = getHypercomposedChannels(config)

	const mappings: BlueprintMappings = {
		[CasparCGLayers.CasparCGClipPlayer1]: casparLayerMapping(ledChannel, LedChannelLayers.ClipPlayer),
		[CasparCGLayers.CasparCGIluPlayer]: casparLayerMapping(ledChannel, LedChannelLayers.IluPlayer),
		[CasparCGLayers.CasparCGClipPlayerPreview]: casparLayerMapping(ledChannel, LedChannelLayers.ClipPreview),
		[CasparCGLayers.CasparCGEffectsPlayer]: casparLayerMapping(ledChannel, LedChannelLayers.EffectsPlayer),
		[CasparCGLayers.CasparCGGraphicsTicker]: casparLayerMapping(ledChannel, LedChannelLayers.GraphicsTicker),
		[CasparCGLayers.CasparCGGraphicsLowerThird]: casparLayerMapping(ledChannel, LedChannelLayers.GraphicsLowerThird),
		[CasparCGLayers.CasparCGGraphicsStrap]: casparLayerMapping(ledChannel, LedChannelLayers.GraphicsStrap),
		[CasparCGLayers.CasparCGAudioBed]: casparLayerMapping(ledChannel, LedChannelLayers.AudioBed),

		[CasparCGLayers.CasparCGPgmRoute]: casparLayerMapping(pgmChannel, PgmChannelLayers.Route),
		[CasparCGLayers.CasparCGPgmEffectsPlayer]: casparLayerMapping(pgmChannel, PgmChannelLayers.EffectsPlayer),
		[CasparCGLayers.CasparCGPgmIntroPlayer]: casparLayerMapping(pgmChannel, PgmChannelLayers.IntroOverlay),
		[CasparCGLayers.CasparCGGraphicsLogo]: casparLayerMapping(pgmChannel, PgmChannelLayers.GraphicsLogo),
		[CasparCGLayers.CasparCGAudioBedPgm]: casparLayerMapping(pgmChannel, PgmChannelLayers.AudioBed),

		...lookStackMappings(bgChannelA),
		...lookStackMappingsB(bgChannelB),

		[CasparCGLayers.CasparCGDebugLabelLed]: casparLayerMapping(ledChannel, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelPgm]: casparLayerMapping(pgmChannel, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelDoubleBox]: casparLayerMapping(bgChannelA, DEBUG_CHANNEL_LABEL_LAYER),
		[CasparCGLayers.CasparCGDebugLabelFull]: casparLayerMapping(bgChannelB, DEBUG_CHANNEL_LABEL_LAYER),
	}

	return mappings
}
