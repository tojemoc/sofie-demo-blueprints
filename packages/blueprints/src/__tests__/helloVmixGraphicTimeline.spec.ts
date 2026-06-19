import { describe, expect, it } from 'vitest'
import {
	mapGraphicAttributesToVmixText,
	createHelloVmixGraphicTimeline,
} from '../base/showstyle/helpers/helloVmixTimeline.js'
import { PlayoutRouting, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { TSR } from '@sofie-automation/blueprints-integration'

const config: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 0,
	playoutRouting: PlayoutRouting.VmixRegistry,
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
	vmixInputs: {
		LOWER_THIRD: { input: 'LOWER_THIRD', overlay: 1 },
		HEADLINE: { input: 'HEADLINE', overlay: 2 },
	},
	atemOutputs: {},
	atemSources: {},
}

describe('helloVmixGraphicTimeline', () => {
	it('maps l3d attributes to vMix Title field names', () => {
		expect(mapGraphicAttributesToVmixText('LOWER_THIRD', { name: 'A', description: 'B' })).toEqual({
			Name: 'A',
			Description: 'B',
		})
	})

	it('passes through unmapped registry attribute keys', () => {
		expect(mapGraphicAttributesToVmixText('CUSTOM', { line1: 'Hello' })).toEqual({ line1: 'Hello' })
	})

	it('creates INPUT text before OVERLAY on separate layers', () => {
		const timeline = createHelloVmixGraphicTimeline(config, 'LOWER_THIRD', {
			name: 'Guest',
			description: 'Reporter',
		})

		expect(timeline).toHaveLength(2)
		expect(timeline[0]?.layer).toBe('vmix_input_lower_third')
		expect(timeline[0]?.content.type).toBe(TSR.TimelineContentTypeVMix.INPUT)
		expect(timeline[1]?.layer).toBe('vmix_overlay_lower_third')
		expect(timeline[1]?.content.type).toBe(TSR.TimelineContentTypeVMix.OVERLAY)
	})
})
