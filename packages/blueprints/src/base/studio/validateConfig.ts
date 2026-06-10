import { ICommonContext, IConfigMessage, NoteSeverity } from '@sofie-automation/blueprints-integration'
import { StudioConfig } from './helpers/config.js'
import { validateVmixInputsRegistry } from './helpers/vmixInputs.js'
import { t } from '../../common/util.js'

export function validateConfig(_context: ICommonContext, config: StudioConfig): Array<IConfigMessage> {
	const messages: IConfigMessage[] = []

	for (const error of validateVmixInputsRegistry(config)) {
		messages.push({
			level: NoteSeverity.ERROR,
			message: t(error),
		})
	}

	if (config.atemSources) {
		messages.push({
			level: NoteSeverity.INFO,
			message: t('Here in validateConfig you can add check for e.g. Atem/VMix'),
		})
	}
	return messages
}
