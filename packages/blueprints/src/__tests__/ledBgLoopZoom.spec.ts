import { describe, expect, it } from 'vitest'
import { ICommonContext } from '@sofie-automation/blueprints-integration'
import { segmentUsesLedBgLoopZoom, createLedBgLoopZoomPiece } from '../base/showstyle/helpers/ledBgLoopZoom.js'
import {
	segmentUsesLedPodHeadline,
	createLedPodHeadlinePiece,
	LED_POD_HEADLINE_FILE,
} from '../base/showstyle/helpers/ledPodHeadline.js'
import { LED_BG_LOOP_TEMA_FILL } from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import { CasparCGLayers } from '../base/studio/layers.js'
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
	it('pans ~1.085×50% screen right with matching scale (covers DoubleBox cam cutout)', () => {
		const shift = 1.085 * 0.5
		expect(LED_BG_LOOP_TEMA_FILL).toEqual({
			x: -shift,
			y: -(shift * 0.5),
			xScale: 1 + shift,
			yScale: 1 + shift,
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

describe('LED pod headline', () => {
	it('matches headlines segments only', () => {
		expect(segmentUsesLedPodHeadline({ externalId: 'seg-headlines', name: 'HEADLINES' })).toBe(true)
		expect(segmentUsesLedPodHeadline({ externalId: 'seg-tema-1', name: 'Obchodný register' })).toBe(false)
	})

	it('plays assets/pod_headline on LED layer 112', () => {
		const context = {
			getHashId: (s: string) => s,
		} as unknown as ICommonContext
		const piece = createLedPodHeadlinePiece(context, hybridCasparConfig, 'part-hl-1')
		expect(piece.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGLedPodHeadline)
		expect(piece.content.timelineObjects?.[0]?.content).toMatchObject({
			file: LED_POD_HEADLINE_FILE,
			loop: true,
		})
		// Package Manager needs the real PNG path (extensionless → toPackageManagerPath would append .mov).
		expect(piece.expectedPackages?.[0]?.content).toMatchObject({
			filePath: 'assets/pod_headline.png',
		})
	})
})
