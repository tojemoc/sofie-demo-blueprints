import { describe, expect, it } from 'vitest'
import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import {
	createBackgroundMusicBaselineTimeline,
	createSportBackgroundMusicPiece,
	createWipeBackgroundMusicMutePiece,
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

	it('does apply koliska keyframes to sport background music', () => {
		const piece = createSportBackgroundMusicPiece(mockContext, hybridCasparConfig, 'seg-sport')
		expect(piece.content, 'sport background music piece content missing').toBeDefined()
		const timelines = piece.content?.timelineObjects ?? []
		expect(timelines).toHaveLength(2)
		for (const timeline of timelines) {
			expect((timeline as { keyframes?: unknown[] }).keyframes?.[0]).toMatchObject({
				enable: { start: KOLISKA_HIT_DURATION_MS },
			})
		}
	})

	it('uses a 2s koliska hit window', () => {
		expect(KOLISKA_HIT_DURATION_MS).toBe(2000)
	})

	it('mutes LED+PGM beds for the wipe SFX window', () => {
		const piece = createWipeBackgroundMusicMutePiece(hybridCasparConfig, 'part-sport-1', 2500)
		expect(piece.name).toBe('BG music mute (Wipe)')
		expect(piece.enable).toEqual({ start: 0, duration: 2500 })
		expect(piece.lifespan).toBe(PieceLifespan.WithinPart)
		for (const tl of piece.content?.timelineObjects ?? []) {
			expect(tl.enable).toEqual({ start: 0, duration: 2500 })
			expect((tl.content as TSR.TimelineContentCCGMedia).mixer?.volume).toBe(0)
			expect(tl.priority).toBe(2)
		}
	})
})
