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

	it('maps L3D alias to lower third overlay', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'L3D',
			name: 'Lower Third',
		})

		expect(part?.payload.registryKey).toBe('LOWER_THIRD')
		expect(part?.payload.action).toBe(HelloVmixAction.Overlay)
	})

	it('maps HEADLINE to overlay registry key', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'HEADLINE',
			name: 'Headline',
		})

		expect(part?.payload.registryKey).toBe('HEADLINE')
		expect(part?.payload.action).toBe(HelloVmixAction.Overlay)
	})

	it('maps DOUBLEBOX to program cut registry key', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'DOUBLEBOX',
			name: 'Double Box',
		})

		expect(part?.payload.registryKey).toBe('DOUBLEBOX')
		expect(part?.payload.action).toBe(HelloVmixAction.Program)
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

	it('maps BG_LOOP alias to input playback', () => {
		const part = tryParseHelloVmix({
			...basePart,
			type: 'BG_LOOP',
			name: 'Background',
		})

		expect(part?.payload.registryKey).toBe('BG_LOOP')
		expect(part?.payload.action).toBe(HelloVmixAction.InputPlayback)
	})

	it('maps MIX3 and MIX3_FEED to mix program registry key', () => {
		for (const type of ['MIX3', 'MIX3_FEED', 'mix3_feed']) {
			const part = tryParseHelloVmix({
				...basePart,
				type,
				name: 'Mix 3 Feed',
			})

			expect(part?.payload.registryKey).toBe('MIX3_FEED')
			expect(part?.payload.action).toBe(HelloVmixAction.MixProgram)
		}
	})

	it('returns undefined for spaced mix aliases that are not registered', () => {
		for (const type of ['MIX 3', 'Mix 3 Feed', 'cam1']) {
			const part = tryParseHelloVmix({
				...basePart,
				type,
				name: 'Unknown',
			})

			expect(part).toBeUndefined()
		}
	})
})
