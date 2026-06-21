import { ICommonContext, IConfigMessage, NoteSeverity } from '@sofie-automation/blueprints-integration'
import { StudioConfig, VisionMixerDevice } from './helpers/config.js'
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

	if (config.visionMixer.type === VisionMixerDevice.VMix) {
		const sourceCount = Object.keys(config.vmixSources ?? {}).length
		if (sourceCount === 0) {
			messages.push({
				level: NoteSeverity.WARNING,
				message: t(
					'vMix is selected but no vmixSources are configured. Add entries for each vMix input you want on the Sofie shelf.'
				),
			})
		} else {
			messages.push({
				level: NoteSeverity.INFO,
				message: t(`vMix studio configured with ${sourceCount} mapped source(s).`),
			})
		}

		const macroCount = Object.keys(config.vmixAutomationMacros ?? {}).length
		if (macroCount > 0) {
			messages.push({
				level: NoteSeverity.INFO,
				message: t(`${macroCount} vMix automation macro(s) configured (Companion-style sequences).`),
			})
		}

		if (config.visionMixer.port === 9910) {
			messages.push({
				level: NoteSeverity.WARNING,
				message: t('vMix port is set to 9910 (ATEM default). vMix Web Controller usually uses port 8088.'),
			})
		}
	}

	return messages
}
