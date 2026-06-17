import { literal } from '../../common/util.js'
import { BlueprintConfigCoreConfig, ICommonContext } from '@sofie-automation/blueprints-integration'
import { BlueprintConfig, StudioConfig, PlayoutRouting } from './helpers/config.js'

export function preprocessConfig(
	_context: ICommonContext,
	config: Partial<StudioConfig>,
	coreConfig: BlueprintConfigCoreConfig
): BlueprintConfig {
	console.log('Core config', coreConfig)
	const processedConfig: BlueprintConfig = {
		studio: literal<Partial<StudioConfig>>({
			playoutRouting: PlayoutRouting.Hybrid,
			vmixInputs: {},
			...config,
		}) as StudioConfig,
	}

	return processedConfig
}
