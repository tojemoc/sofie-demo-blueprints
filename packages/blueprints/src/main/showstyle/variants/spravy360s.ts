import { IShowStyleVariantConfigPreset } from '@sofie-automation/blueprints-integration'

import { ShowStyleConfig } from '../../../base/showstyle/helpers/config.js'

type VariantsConfig = Pick<ShowStyleConfig, 'dvePresets'>

export const spravy360sVariants: Record<string, IShowStyleVariantConfigPreset<VariantsConfig>> = {
	s360_1: {
		name: 'S360-1',
		config: {
			dvePresets: {},
		},
	},
	s360_2: {
		name: 'S360-2',
		config: {
			dvePresets: {},
		},
	},
	s360_3: {
		name: 'S360-3',
		config: {
			dvePresets: {},
		},
	},
}
