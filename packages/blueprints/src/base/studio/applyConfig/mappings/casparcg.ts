import { BlueprintMappings, BlueprintMapping, TSR, LookaheadMode } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { BlueprintConfig } from '../../helpers/config.js'
import { CasparCGLayers } from '../../layers.js'
import { LedChannelLayers, PgmChannelLayers } from './casparcgLayers.js'

export function getHypercomposedChannels(config: BlueprintConfig): { ledChannel: number; pgmChannel: number } {
	const hypercomposed = config.studio.casparcg.hypercomposed
	return {
		ledChannel: hypercomposed?.ledChannel ?? 1,
		pgmChannel: hypercomposed?.pgmChannel ?? 2,
	}
}

export function getCasparCGMappings(config: BlueprintConfig): BlueprintMappings {
	const { ledChannel, pgmChannel } = getHypercomposedChannels(config)

	const mappings: BlueprintMappings = {
		[CasparCGLayers.CasparCGClipPlayer1]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,

			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.ClipPlayer,
			},
		}),
		[CasparCGLayers.CasparCGClipPlayer2]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,

			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: pgmChannel,
				layer: PgmChannelLayers.ClipPlayer,
			},
		}),

		[CasparCGLayers.CasparCGClipPlayerPreview]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.ClipPreview,
			},
		}),

		[CasparCGLayers.CasparCGEffectsPlayer]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.EffectsPlayer,
			},
		}),
		[CasparCGLayers.CasparCGGraphicsTicker]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.GraphicsTicker,
			},
		}),
		[CasparCGLayers.CasparCGGraphicsLowerThird]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.GraphicsLowerThird,
			},
		}),
		[CasparCGLayers.CasparCGGraphicsStrap]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.GraphicsStrap,
			},
		}),
		[CasparCGLayers.CasparCGGraphicsLogo]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.GraphicsLogo,
			},
		}),
		[CasparCGLayers.CasparCGAudioBed]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.AudioBed,
			},
		}),
	}

	return mappings
}
