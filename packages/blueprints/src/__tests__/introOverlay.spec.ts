import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { IntroProps, PartProps, PartType } from '../base/showstyle/definitions/index.js'
import { generateIntroPart } from '../base/showstyle/part-adapters/intro.js'
import { parseLayeredVideosFromObjects } from '../base/showstyle/helpers/clips.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

describe('intro overlay + bg-loop layered videos', () => {
	const exportData = loadSmokeRundownExport()

	it('parses Intro part with overlay on PGM IntroOverlay (not LED)', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-intro'))
		const introPart = segment.parts.find((part) => part.payload.name === 'Intro')

		expect(introPart?.type).toBe(PartType.Intro)

		const overlay = introPart?.objects.find(
			(obj) => obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'effects'
		)
		const bgLoop = introPart?.objects.find(
			(obj) =>
				obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'background'
		)

		expect(overlay?.clipName).toContain('360s_ZNELKA')
		// Smoke Intro relies on baseline LED loop — no explicit bg-loop piece.
		expect(bgLoop).toBeUndefined()
		expect(introPart).toBeDefined()
		if (!introPart) return

		const partContext = new PartContext(mockSegmentContext(), introPart.payload.externalId)
		const result = generateIntroPart(partContext, introPart as PartProps<IntroProps>)

		const introPiece = result.pieces.find((p) => p.name.startsWith('Intro |'))
		const bgPiece = result.pieces.find((p) => p.name.startsWith('BG loop |'))

		expect(introPiece?.lifespan).toBe(PieceLifespan.WithinPart)
		expect(bgPiece).toBeUndefined()

		const introTl = introPiece?.content.timelineObjects?.[0]

		expect(introTl?.layer).toBe(CasparCGLayers.CasparCGPgmIntroPlayer)
	})

	it('recovers GFX parts that only have a video as Intro overlay', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-intro')
		ingest.parts.push({
			externalId: 'part-gfx-intro-mistake',
			name: 'Intro mistake',
			payload: {
				segmentId: 'seg-intro',
				externalId: 'part-gfx-intro-mistake',
				rank: 9,
				name: 'Intro mistake',
				type: 'GFX',
				float: false,
				script: '',
				duration: 0,
				pieces: [
					{
						id: 'piece-gfx-video-only',
						objectType: 'video',
						objectTime: 0,
						duration: 0,
						clipName: '',
						attributes: { fileName: 'clips/introMichal.mov' },
					},
				],
			},
		} as (typeof ingest.parts)[number])

		const segment = convertIngestData(mockIngestContext, ingest)
		const recovered = segment.parts.find((part) => part.payload.name === 'Intro mistake')
		expect(recovered?.type).toBe(PartType.Intro)
		expect(
			recovered?.objects.some(
				(obj) =>
					obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'effects'
			)
		).toBe(true)
	})

	it('does not turn layered videos into adlibs', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-intro'))
		const introPart = segment.parts.find((part) => part.payload.name === 'Intro')
		const layered = parseLayeredVideosFromObjects(
			{ getHashId: (s: string) => s } as never,
			hybridCasparConfig,
			introPart?.objects ?? []
		)
		// Smoke Intro: overlay only (no bg-loop / wipe on this part).
		expect(layered.length).toBe(1)
		expect(layered.map((piece) => piece.name)).toEqual([expect.stringMatching(/^Intro \|/)])
	})
})
