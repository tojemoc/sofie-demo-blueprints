import { describe, expect, it } from 'vitest'
import { TSR } from '@sofie-automation/blueprints-integration'
import {
	createBackgroundMusicBaselineTimeline,
	createSportBackgroundMusicPiece,
	isSportSegmentName,
	KOLISKA_BED_VOLUME,
	KOLISKA_HIT_DURATION_MS,
	KOLISKA_HIT_VOLUME,
} from '../base/showstyle/helpers/backgroundMusic.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { hybridCasparConfig } from './helpers/smokeRundownIngest.js'

const mockContext = {
	getHashId: (origin: string) => `hash_${origin}`,
	unhashId: (hash: string) => hash,
	logDebug: () => undefined,
	logInfo: () => undefined,
	logWarning: () => undefined,
	logError: () => undefined,
}

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
	it('starts loud then ducks after the hit window on LED and PGM', () => {
		const timelines = createBackgroundMusicBaselineTimeline()
		expect(timelines).toHaveLength(2)
		expect(timelines.map((tl) => tl.layer)).toEqual([
			CasparCGLayers.CasparCGAudioBed,
			CasparCGLayers.CasparCGAudioBedPgm,
		])

		for (const tl of timelines) {
			const content = tl.content as TSR.TimelineContentCCGMedia
			expect(content.mixer?.volume).toBe(KOLISKA_HIT_VOLUME)
			expect(tl.keyframes?.[0]?.enable).toEqual({ start: KOLISKA_HIT_DURATION_MS })
			expect((tl.keyframes?.[0]?.content as { mixer?: { volume?: number } }).mixer?.volume).toBe(KOLISKA_BED_VOLUME)
		}
	})

	it('does not apply koliska keyframes to sport background music', () => {
		const piece = createSportBackgroundMusicPiece(mockContext, hybridCasparConfig, 'seg-sport')
		expect(piece.content, 'sport background music piece content missing').toBeDefined()
		const timelines = piece.content?.timelineObjects ?? []
		expect(timelines).toHaveLength(2)
		for (const timeline of timelines) {
			expect((timeline as { keyframes?: unknown[] }).keyframes).toBeUndefined()
		}
	})
})
