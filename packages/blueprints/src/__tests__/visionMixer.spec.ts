import { describe, expect, it } from 'vitest'
import { SourceType, StudioConfig, VisionMixerDevice, PlayoutRouting } from '../base/studio/helpers/config.js'
import { createVisionMixerObjects } from '../base/showstyle/helpers/visionMixer.js'

const atemConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 0,
	playoutRouting: PlayoutRouting.Hybrid,
	visionMixer: {
		type: VisionMixerDevice.Atem,
		host: '0.0.0.0',
		port: 9910,
		deviceId: 'atem0',
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
	atemSources: {
		camera1: { input: 1, type: SourceType.Camera },
	},
}

describe('createVisionMixerObjects ATEM input validation', () => {
	it('accepts numeric ATEM inputs', () => {
		expect(() => createVisionMixerObjects(atemConfig, 1)).not.toThrow()
		expect(() => createVisionMixerObjects(atemConfig, '3010')).not.toThrow()
	})

	it('rejects non-numeric ATEM input labels', () => {
		expect(() => createVisionMixerObjects(atemConfig, 'CAMERA')).toThrow('Invalid ATEM program input label: "CAMERA"')
	})
})
