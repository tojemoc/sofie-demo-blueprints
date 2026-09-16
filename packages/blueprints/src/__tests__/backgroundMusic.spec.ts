import { describe, expect, it } from 'vitest'
import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import {
	createBackgroundMusicBaselineTimeline,
	createSportBackgroundMusicPiece,
	createWipeBackgroundMusicMutePiece,
	duckAudioBedPieceDuringWipe,
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
		const preroll = hybridCasparConfig.casparcgLatency
		// Piece duration includes preroll so Softie does not truncate the Take-relative mute.
		expect(piece.enable).toEqual({ start: 0, duration: preroll + 2500 })
		expect(piece.lifespan).toBe(PieceLifespan.WithinPart)
		expect(piece.prerollDuration).toBe(preroll)
		for (const tl of piece.content?.timelineObjects ?? []) {
			// Take-relative: object start offsets piece preroll so mute covers the full sting.
			expect(tl.enable).toEqual({ start: preroll, duration: 2500 })
			expect((tl.content as TSR.TimelineContentCCGMedia).mixer?.volume).toBe(0)
			expect(tl.priority).toBe(2)
		}
	})

	it('ducks sport C during wipe then restores the koliska bed volume', () => {
		const piece = createSportBackgroundMusicPiece(mockContext, hybridCasparConfig, 'seg-sport')
		const preroll = hybridCasparConfig.casparcgLatency
		const wipeMs = 2500
		duckAudioBedPieceDuringWipe(piece, wipeMs, preroll)
		for (const tl of piece.content?.timelineObjects ?? []) {
			const keyframes =
				(tl as { keyframes?: Array<{ enable?: { start?: number }; content?: unknown }> }).keyframes ?? []
			const muteKf = keyframes.find((kf) => kf.enable?.start === preroll)
			const restoreKf = keyframes.find((kf) => kf.enable?.start === preroll + wipeMs)
			expect((muteKf?.content as { mixer?: { volume?: number } })?.mixer?.volume).toBe(0)
			// Koliska duck at 2s is before wipe end (~2.55s) — restore must not jump back to hit volume.
			expect((restoreKf?.content as { mixer?: { volume?: number } })?.mixer?.volume).toBe(KOLISKA_BED_VOLUME)
			expect(keyframes.some((kf) => kf.enable?.start === KOLISKA_HIT_DURATION_MS)).toBe(false)
		}
	})
})
