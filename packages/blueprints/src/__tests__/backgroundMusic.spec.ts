import { describe, expect, it } from 'vitest'
import {
	createBackgroundMusicBaselineTimeline,
	isSportSegmentName,
	KOLISKA_BED_VOLUME,
	KOLISKA_HIT_DURATION_MS,
	KOLISKA_HIT_VOLUME,
} from '../base/showstyle/helpers/backgroundMusic.js'
import { TSR } from '@sofie-automation/blueprints-integration'

describe('isSportSegmentName', () => {
	it('matches Šport segment names', () => {
		expect(isSportSegmentName('Šport')).toBe(true)
		expect(isSportSegmentName('Sport NEXT')).toBe(true)
	})

	it('does not match unrelated names containing sport as a substring', () => {
		expect(isSportSegmentName('Transport')).toBe(false)
		expect(isSportSegmentName('Motorsport')).toBe(false)
	})
})

describe('koliska bed envelope', () => {
	it('starts loud then ducks after the hit window', () => {
		const tl = createBackgroundMusicBaselineTimeline()
		const content = tl.content as TSR.TimelineContentCCGMedia
		expect(content.mixer?.volume).toBe(KOLISKA_HIT_VOLUME)
		expect(tl.keyframes?.[0]?.enable).toEqual({ start: KOLISKA_HIT_DURATION_MS })
		expect((tl.keyframes?.[0]?.content as { mixer?: { volume?: number } }).mixer?.volume).toBe(KOLISKA_BED_VOLUME)
	})
})
