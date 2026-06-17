import { IFixUpConfigContext } from '@sofie-automation/blueprints-integration'
import { StudioConfig } from './helpers/config.js'

interface FixUpConfigContextWithDefaults extends IFixUpConfigContext<StudioConfig> {
	configObject?: {
		defaults: Partial<StudioConfig>
	}
}

/**
 * Sofie's override system rejects nested paths when the parent key is missing from
 * config defaults. The Demo preset historically omitted `vmixInputs`, so registry
 * rows saved in the UI were stored as overrides but never applied to the resolved
 * config (breaking validation and the table summary).
 */
export function fixUpStudioConfig(context: IFixUpConfigContext<StudioConfig>): void {
	const hasInvalidVmixInputPaths = context.listInvalidPaths().some((path) => path.startsWith('vmixInputs.'))
	if (!hasInvalidVmixInputPaths) return

	const ctx = context as FixUpConfigContextWithDefaults
	if (!ctx.configObject) return

	if (ctx.configObject.defaults.vmixInputs === undefined) {
		ctx.configObject.defaults = {
			...ctx.configObject.defaults,
			vmixInputs: {},
		}
	}
}
