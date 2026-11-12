import { BlueprintMappings, ICommonContext, LookaheadMode, TSR } from '@sofie-automation/blueprints-integration'

import { assertNever } from '../../../../common/util.js'
import { BlueprintConfig, VisionMixerDevice } from '../../helpers/config.js'
import { AbstractLayers } from '../../layers.js'
import { getAtemMappings } from './atem.js'
import { getCasparCGMappings } from './casparcg.js'
import { getSisyfosMappings } from './sisyfos.js'
import { getVMixMappings } from './vmix.js'

export function getMappingsDefaults(context: ICommonContext, config: BlueprintConfig): BlueprintMappings {
	const mappings: BlueprintMappings = {
		[AbstractLayers.CoreAbstract]: {
			device: TSR.DeviceType.ABSTRACT,
			deviceId: 'abstract0',
			lookahead: LookaheadMode.NONE,
			options: {},
		},
		...getSisyfosMappings(config),
		...getCasparCGMappings(config),
	}

	switch (config.studio.visionMixer.type) {
		case VisionMixerDevice.Atem:
			Object.assign(mappings, getAtemMappings(config))
			break
		case VisionMixerDevice.VMix:
			Object.assign(
				mappings,
				getVMixMappings(
					config.studio.vmixSources,
					config.studio.vmixProgram,
					config.studio.visionMixer.deviceId
				)
			)
			break
		default:
			assertNever(config.studio.visionMixer.type)
			context.logError('Unknown vision mixer type: ' + config.studio.visionMixer.type)
			break
	}

	return mappings
}
