import { describe, expect, it } from 'vitest'
import { isSportSegmentName } from '../base/showstyle/helpers/backgroundMusic.js'

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
