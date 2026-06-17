import { describe, expect, it } from 'vitest'
import { StudioConfig, VisionMixerDevice, PlayoutRouting } from '../base/studio/helpers/config.js'
import { validateVmixInputsRegistry } from '../base/studio/helpers/vmixInputs.js'

const baseConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 0,
	playoutRouting: PlayoutRouting.Hybrid,
	visionMixer: {
		type: VisionMixerDevice.VMix,
		host: '127.0.0.1',
		port: 8099,
		deviceId: 'vmix0',
	},
	audioMixer: {
		host: 'localhost',
		port: 1176,
		deviceId: 'sisyfos0',
	},
	casparcg: {
		host: 'localhost',
		port: 5250,
	},
	sisyfosSources: {},
	vmixSources: {},
	atemOutputs: {},
	atemSources: {},
}

describe('validateVmixInputsRegistry', () => {
	it('reports normalized registry key collisions', () => {
		const errors = validateVmixInputsRegistry({
			...baseConfig,
			vmixInputs: {
				'LOWER-THIRD': { input: 'LOWER_THIRD', overlay: 1 },
				LOWER_THIRD: { input: 'LOWER_THIRD', overlay: 1 },
			},
		})

		expect(errors).toContainEqual(
			'vmixInputs registry key collision: "LOWER-THIRD" and "LOWER_THIRD" both map to layer id "lower_third"'
		)
	})

	it('requires vmixInputs when playout routing is vMix registry', () => {
		const errors = validateVmixInputsRegistry({
			...baseConfig,
			playoutRouting: PlayoutRouting.VmixRegistry,
			vmixInputs: {},
		})

		expect(errors).toContainEqual(
			'vmixInputs must contain at least one entry when playout routing is set to vMix registry. If the vMix Input Registry table appears empty after saving, run Config Fix Up on the studio blueprint configuration page.'
		)
	})
})
