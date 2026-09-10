import { describe, expect, it } from 'vitest'
import { segmentUsesLedBgLoopZoom, createLedBgLoopZoomPiece } from '../base/showstyle/helpers/ledBgLoopZoom.js'
import { LED_BG_LOOP_TEMA_FILL } from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import { hybridCasparConfig } from './helpers/smokeRundownIngest.js'

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

describe('LED_BG_LOOP_TEMA_FILL', () => {
	it('is 120% zoom pinned to the right edge', () => {
		expect(LED_BG_LOOP_TEMA_FILL).toEqual({
			x: -0.2,
			y: -0.1,
			xScale: 1.2,
			yScale: 1.2,
		})
	})

	it('createLedBgLoopZoomPiece applies that FILL on ClipPlayer1', () => {
		const piece = createLedBgLoopZoomPiece(hybridCasparConfig, 'part-tema-1')
		const media = piece.content.timelineObjects?.[0]
		expect(media?.content).toMatchObject({
			file: 'loops/bg_loop',
			mixer: {
				fill: { ...LED_BG_LOOP_TEMA_FILL },
			},
		})
	})
})
