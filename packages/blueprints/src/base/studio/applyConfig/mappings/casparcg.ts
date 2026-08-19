import { BlueprintMappings, BlueprintMapping, TSR, LookaheadMode } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { BlueprintConfig } from '../../helpers/config.js'
import { CasparCGLayers } from '../../layers.js'
import { LedChannelLayers, PgmChannelLayers } from './casparcgLayers.js'

export function getHypercomposedChannels(config: BlueprintConfig): { ledChannel: number; pgmChannel: number } {
	const hypercomposed = config.studio.casparcg.hypercomposed
	const ledChannel = hypercomposed?.ledChannel ?? 1
	let pgmChannel = hypercomposed?.pgmChannel ?? 2

	if (ledChannel === pgmChannel) {
		pgmChannel = ledChannel + 1
	}

	return { ledChannel, pgmChannel }
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

		[CasparCGLayers.CasparCGIluPlayer]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,

			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: ledChannel,
				layer: LedChannelLayers.IluPlayer,
			},
		}),
		[CasparCGLayers.CasparCGPgmIluPlayer]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,

			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: pgmChannel,
				layer: PgmChannelLayers.IluPlayer,
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
		[CasparCGLayers.CasparCGPgmEffectsPlayer]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: pgmChannel,
				layer: PgmChannelLayers.EffectsPlayer,
			},
		}),
		[CasparCGLayers.CasparCGPgmIntroPlayer]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: pgmChannel,
				layer: PgmChannelLayers.IntroOverlay,
			},
		}),
		[CasparCGLayers.CasparCGPgmCamera]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: pgmChannel,
				layer: PgmChannelLayers.Camera,
			},
		}),
		[CasparCGLayers.CasparCGPgmDoubleBoxLoop]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: pgmChannel,
				layer: PgmChannelLayers.DoubleBoxLoop,
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
		[CasparCGLayers.CasparCGGraphicsPgmLowerThird]: literal<BlueprintMapping<TSR.MappingCasparCGLayer>>({
			device: TSR.DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingCasparCGType.Layer,
				channel: pgmChannel,
				layer: PgmChannelLayers.GraphicsLowerThird,
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
				// 360° sekúnd bug is PGM chrome (DoubleBox), not LED wall content.
				channel: pgmChannel,
				layer: PgmChannelLayers.GraphicsLogo,
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
