import { describe, expect, it } from 'vitest'
import { HelloVmixAction, PartType } from '../base/showstyle/definitions/index.js'
import { tryParseHelloVmix } from '../base/showstyle/spreadsheet-parsers/helloVmix.js'

const basePart = {
	segmentId: 'seg1',
	externalId: 'part1',
	rank: 0,
	name: 'Part',
	float: false,
	script: '',
	pieces: [],
}

describe('Hello vMix parser', () => {
	it('maps CAMERA to program cut registry key', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'CAMERA',
			name: 'Camera',
		})

		expect(part?.type).toBe(PartType.HelloVmix)
		expect(part?.payload.registryKey).toBe('CAMERA')
		expect(part?.payload.action).toBe(HelloVmixAction.Program)
	})

	it('maps LOWER THIRD with spaces to overlay registry key', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'LOWER THIRD',
			name: 'Lower Third',
		})

		expect(part?.payload.registryKey).toBe('LOWER_THIRD')
		expect(part?.payload.action).toBe(HelloVmixAction.Overlay)
	})

	it('maps CLIP to BG_LOOP input playback', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'CLIP',
			name: 'Background',
		})

		expect(part?.payload.registryKey).toBe('BG_LOOP')
		expect(part?.payload.action).toBe(HelloVmixAction.InputPlayback)
	})

	it('returns undefined for unknown part types', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'cam1',
			name: 'Camera 1',
		})

		expect(part).toBeUndefined()
	})
})
