import { IStudioConfigPreset } from '@sofie-automation/blueprints-integration'

import { StudioConfig } from '../../../base/studio/helpers/config.js'
import { Studio360Config } from './studio360.js'

export const studio360ConfigPresets: Record<string, IStudioConfigPreset<StudioConfig>> = {
	studio360: {
		name: 'Studio 360',
		config: Studio360Config,
	},
}

export const StudioConfigPresets: Record<string, IStudioConfigPreset<StudioConfig>> = {
	...studio360ConfigPresets,
}
