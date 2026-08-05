import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { PartType, VOProps, VTProps, PartProps } from '../base/showstyle/definitions/index.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import { generateVTPart } from '../base/showstyle/part-adapters/vt.js'
import { generateLayeredVideoPart } from '../base/showstyle/part-adapters/layeredVideo.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import {
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

describe('wipe piece type → PGM effects player', () => {
	const exportData = loadSmokeRundownExport()

	it('normalizes lowercase wipe onto PGM layer 200 for SYN (VO) parts', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-tema-1'))
		const synPart = segment.parts.find((part) => part.payload.externalId === 'part-syn-1')

		expect(synPart?.type).toBe(PartType.VO)
		const wipe = synPart?.objects.find(
			(obj) => obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'wipe'
		)
		expect(wipe?.clipName).toBe('wipes/360_wipe')
		expect((wipe?.attributes as { transition?: string }).transition).toBe('ILU TO SYN CLUSTER')

		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>)
		const wipePiece = result.pieces.find((piece) => piece.name.startsWith('Wipe'))

		expect(wipePiece?.lifespan).toBe(PieceLifespan.WithinPart)
		expect(wipePiece?.enable.duration).toBe(2500)
		expect(wipePiece?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect((wipePiece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGMedia).file).toBe(
			'wipes/360_wipe'
		)
		// Main VO clip must stay the story video, not the wipe.
		expect(result.pieces[0]?.name).toContain('clips/')
		expect(result.pieces[0]?.name).not.toContain('wipe')
	})

	it('accepts uppercase WIPE piece type ids from ingest', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const synPayload = ingest.parts.find((part) => part.externalId === 'part-syn-1')?.payload as {
			pieces: Array<{ objectType: string; attributes: Record<string, unknown> }>
		}
		const wipePiece = synPayload.pieces.find((piece) => piece.objectType === 'wipe')
		expect(wipePiece).toBeDefined()
		if (!wipePiece) return
		wipePiece.objectType = 'WIPE'

		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === 'part-syn-1')
		const wipe = synPart?.objects.find(
			(obj) => obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'wipe'
		)

		expect(wipe?.clipName).toBe('wipes/360_wipe')
	})

	it('does not steal the main VT clip when wipe is listed first', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const syn = ingest.parts.find((part) => part.externalId === 'part-syn-1')
		expect(syn).toBeDefined()
		if (!syn) return

		const payload = syn.payload as {
			type: string
			pieces: Array<{ id: string; objectType: string; attributes: Record<string, unknown> }>
		}
		payload.type = 'VT'
		const wipeIdx = payload.pieces.findIndex((piece) => piece.objectType === 'wipe')
		const videoIdx = payload.pieces.findIndex((piece) => piece.objectType === 'video')
		expect(wipeIdx).toBeGreaterThanOrEqual(0)
		expect(videoIdx).toBeGreaterThanOrEqual(0)
		const [wipe] = payload.pieces.splice(wipeIdx, 1)
		payload.pieces.unshift(wipe)

		const segment = convertIngestData(mockIngestContext, ingest)
		const vtPart = segment.parts.find((part) => part.payload.externalId === 'part-syn-1')
		expect(vtPart?.type).toBe(PartType.VT)
		expect((vtPart as PartProps<VTProps>)?.payload.clipProps.fileName).toMatch(/clips\//)

		if (!vtPart || vtPart.type !== PartType.VT) return
		const partContext = new PartContext(mockSegmentContext(), vtPart.payload.externalId)
		const result = generateVTPart(partContext, vtPart as PartProps<VTProps>)
		expect(result.pieces.some((piece) => piece.name.startsWith('Wipe'))).toBe(true)
		expect(
			result.pieces[0]?.content.timelineObjects?.some((obj) => obj.layer === CasparCGLayers.CasparCGClipPlayer2)
		).toBe(true)
	})

	it('routes wipe-only GFX parts to LayeredVideo (not Invalid GFX)', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		ingest.parts.push({
			externalId: 'part-wipe-only',
			name: 'Wipe only',
			payload: {
				segmentId: 'seg-tema-1',
				externalId: 'part-wipe-only',
				rank: 99,
				name: 'Wipe only',
				type: 'GFX',
				float: false,
				script: '',
				duration: 0,
				pieces: [
					{
						id: 'wipe-only-1',
						objectType: 'wipe',
						objectTime: 0,
						duration: 0,
						clipName: '',
						attributes: { fileName: 'wipes/360_wipe', transition: 'Test' },
					},
				],
			},
		} as (typeof ingest.parts)[number])

		const segment = convertIngestData(mockIngestContext, ingest)
		const wipeOnly = segment.parts.find((part) => part.payload.externalId === 'part-wipe-only')
		expect(wipeOnly?.type).toBe(PartType.LayeredVideo)

		if (!wipeOnly || wipeOnly.type !== PartType.LayeredVideo) return
		const partContext = new PartContext(mockSegmentContext(), wipeOnly.payload.externalId)
		const result = generateLayeredVideoPart(partContext, wipeOnly)
		expect(result.pieces).toHaveLength(1)
		expect(result.pieces[0]?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGPgmEffectsPlayer)
	})
})
