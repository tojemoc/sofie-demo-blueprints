import { describe, expect, it } from 'vitest'
import { fixUpStudioConfig } from '../base/studio/fixUpConfig.js'
import { StudioConfig, PlayoutRouting } from '../base/studio/helpers/config.js'

describe('fixUpStudioConfig', () => {
	it('adds vmixInputs to defaults when registry overrides are invalid', () => {
		const configObject = {
			defaults: {
				playoutRouting: PlayoutRouting.VmixRegistry,
			} satisfies Partial<StudioConfig>,
			overrides: [],
		}

		const context = {
			listInvalidPaths: () => ['vmixInputs.CAMERA', 'vmixInputs.CAMERA.input'],
			configObject,
		}

		fixUpStudioConfig(context as any)

		expect(configObject.defaults.vmixInputs).toEqual({})
	})

	it('does nothing when vmixInputs overrides are already valid', () => {
		const configObject = {
			defaults: {
				playoutRouting: PlayoutRouting.VmixRegistry,
				vmixInputs: {
					CAMERA: { input: '1' },
				},
			} satisfies Partial<StudioConfig>,
			overrides: [],
		}

		const context = {
			listInvalidPaths: () => [],
			configObject,
		}

		fixUpStudioConfig(context as any)

		expect(configObject.defaults.vmixInputs).toEqual({ CAMERA: { input: '1' } })
	})
})
