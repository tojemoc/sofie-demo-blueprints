import { IStudioConfigPreset } from '@sofie-automation/blueprints-integration'
import { StudioConfig } from '../../../base/studio/helpers/config.js'
import { DemoStudioConfig } from './demo.js'
import { HelloVmixStudioConfig } from './hello-vmix.js'

export const demoStudioConfigPresets: Record<string, IStudioConfigPreset<StudioConfig>> = {
	demo: {
		name: 'Demo Main Studio',
		config: DemoStudioConfig,
	},
	helloVmix: {
		name: 'vMix Registry (vMix only)',
		config: HelloVmixStudioConfig,
	},
}

export const StudioConfigPresets: Record<string, IStudioConfigPreset<StudioConfig>> = {
	...demoStudioConfigPresets,
}
