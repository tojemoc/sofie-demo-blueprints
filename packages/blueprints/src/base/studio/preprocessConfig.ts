import { literal } from '../../common/util.js'
import { BlueprintConfigCoreConfig, ICommonContext } from '@sofie-automation/blueprints-integration'
import { BlueprintConfig, StudioConfig } from './helpers/config.js'

export function preprocessConfig(
	_context: ICommonContext,
	config: Partial<StudioConfig>,
	_coreConfig: BlueprintConfigCoreConfig
): BlueprintConfig {
	const processedConfig: BlueprintConfig = {
		studio: literal<Partial<StudioConfig>>({
			...config,
		}) as StudioConfig,
	}

	return processedConfig
}
