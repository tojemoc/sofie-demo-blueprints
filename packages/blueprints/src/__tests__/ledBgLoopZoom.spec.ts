import { describe, expect, it } from 'vitest'
import { segmentUsesLedBgLoopZoom } from '../base/showstyle/helpers/ledBgLoopZoom.js'

describe('segmentUsesLedBgLoopZoom', () => {
	it('matches smoke segment ids and section display-name tokens', () => {
		expect(segmentUsesLedBgLoopZoom({ externalId: 'seg-tema-1', name: 'Obchodný register' })).toBe(true)
		expect(segmentUsesLedBgLoopZoom({ externalId: 'seg-sjv', name: 'SPRÁVY JEDNOU VETOU' })).toBe(true)
		expect(segmentUsesLedBgLoopZoom({ externalId: 'seg-sport', name: 'ŠPORT' })).toBe(true)
		expect(segmentUsesLedBgLoopZoom({ externalId: 'seg-weather', name: 'POČASIE' })).toBe(true)
		expect(segmentUsesLedBgLoopZoom({ name: 'ŠPORT' })).toBe(true)
		expect(segmentUsesLedBgLoopZoom({ name: 'Počasie' })).toBe(true)
		expect(segmentUsesLedBgLoopZoom({ name: 'sport' })).toBe(true)
	})

	it('does not match Transport (sport as an interior substring)', () => {
		expect(segmentUsesLedBgLoopZoom({ externalId: 'seg-transport', name: 'Transport' })).toBe(false)
		expect(segmentUsesLedBgLoopZoom({ name: 'Transport' })).toBe(false)
		expect(segmentUsesLedBgLoopZoom({ name: 'Motorsport' })).toBe(false)
	})

	it('skips outro / tip style segments', () => {
		expect(segmentUsesLedBgLoopZoom({ externalId: 'seg-outro', name: 'ZÁVER + AVIZO' })).toBe(false)
		expect(segmentUsesLedBgLoopZoom({ name: 'HEADLINES' })).toBe(false)
	})
})
