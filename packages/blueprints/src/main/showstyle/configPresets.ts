import { IShowStyleConfigPreset, IShowStyleVariantConfigPreset } from '@sofie-automation/blueprints-integration'

import { ShowStyleConfig } from '../../base/showstyle/helpers/config.js'
import { spravy360sShowStyleConfigDefaults } from './configs/spravy360s.js'
import { spravy360sVariants } from './variants/spravy360s.js'

export const ShowStyleConfigPreset: Record<string, IShowStyleConfigPreset<ShowStyleConfig>> = {
	spravy360s: {
		name: 'Správy 360',
		config: spravy360sShowStyleConfigDefaults,
		variants: spravy360sVariants,
	},
}

export function getShowStyleConfigPreset(): Record<string, IShowStyleConfigPreset<ShowStyleConfig>> {
	const result: Record<string, IShowStyleConfigPreset<ShowStyleConfig>> = {}

	for (const [id, entry] of Object.entries<IShowStyleConfigPreset<ShowStyleConfig>>(ShowStyleConfigPreset)) {
		const newEntry = { ...entry }
		for (const [variantId, variant] of Object.entries<IShowStyleVariantConfigPreset<ShowStyleConfig>>(
			entry.variants
		)) {
			newEntry.variants[variantId] = {
				...entry.config,
				...variant,
			}
		}

		result[id] = newEntry
	}

	return result
}
