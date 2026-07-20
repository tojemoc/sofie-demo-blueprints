import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { GfxProps, PartProps, PartType, SegmentType } from '../base/showstyle/definitions/index.js'
import { generateGfxPart } from '../base/showstyle/part-adapters/gfx.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { resolveSegmentType } from '../common/definitions/rundownEditorTypes.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

describe('spravy-v3-smoke-rundown.json', () => {
	const exportData = loadSmokeRundownExport()

	it('resolves editorial segment types from payload.type', () => {
		expect(resolveSegmentType({ type: 'opening' })).toBe(SegmentType.OPENING)
		expect(resolveSegmentType({ type: 'headlines' })).toBe(SegmentType.HEADLINES)
		expect(resolveSegmentType({ type: 'story' })).toBe(SegmentType.STORY)
	})

	it('parses opening GFX parts with Caspar L3D piece types', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-opening'))

		expect(segment.type).toBe(SegmentType.OPENING)
		expect(segment.parts).toHaveLength(3)
		expect(segment.parts.every((part) => part.type === PartType.GFX)).toBe(true)
		expect(segment.parts[0]?.objects[0]?.clipName).toBe('gfx/l3d-tema')
	})

	it('does not mark editor graphics without start as adlibs', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-opening'))

		for (const part of segment.parts) {
			const timelineGraphics = part.objects.filter((obj) => obj.objectType === ObjectType.Graphic)
			expect(timelineGraphics.every((obj) => !obj.isAdlib)).toBe(true)
			expect(timelineGraphics.every((obj) => obj.objectTime === 0)).toBe(true)
		}
	})

	it('generates GFX timeline pieces for opening without adlib-only primary graphic', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-opening'))
		const segmentContext = mockSegmentContext()

		for (const rawPart of segment.parts) {
			const partContext = new PartContext(segmentContext, rawPart.payload.externalId)
			const result = generateGfxPart(partContext, rawPart as PartProps<GfxProps>)

			expect(result.pieces.length).toBeGreaterThan(0)
			expect(result.pieces.some((piece) => piece.content.timelineObjects?.length)).toBe(true)

			const externalIds = result.pieces.map((piece) => piece.externalId)
			expect(new Set(externalIds).size).toBe(externalIds.length)
		}
	})

	it('maps l3d-headline ingest fields to title/subtitle for Caspar templates', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-opening'))
		const headlinePart = segment.parts.find((part) => part.payload.name === 'Headline L3D')
		const headlineObject = headlinePart?.objects.find((obj) => obj.clipName === 'gfx/l3d-headline')

		expect(headlineObject?.attributes).toMatchObject({
			headline: 'Breaking',
			subline: 'Tonight',
		})

		const graphics = parseGraphicsFromObjects(hybridCasparConfig, headlinePart?.objects ?? [])
		const piece = graphics.pieces.find((p) => p.name.startsWith('gfx/l3d-headline'))
		const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate | undefined
		expect(piece, 'gfx/l3d-headline timeline piece missing from parseGraphicsFromObjects').toBeDefined()
		expect(caspar, 'Caspar template timeline content missing on gfx/l3d-headline piece').toBeDefined()
		if (!piece || !caspar) return

		expect(caspar.data).toEqual({ title: 'Breaking', subtitle: 'Tonight' })
		expect(piece.content).toMatchObject({
			templateData: { title: 'Breaking', subtitle: 'Tonight' },
		})
	})

	it('parses ILU headline parts as camera parts with headline graphics and L3Ds', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-headlines'))

		expect(segment.type).toBe(SegmentType.HEADLINES)
		const iluParts = segment.parts.filter((part) => part.type === PartType.Camera)
		expect(iluParts).toHaveLength(3)
		expect(segment.parts.some((part) => part.type === PartType.Intro)).toBe(true)

		const firstHeadline = segment.parts[0]?.objects.find((obj) => obj.clipName === 'gfx/headline')
		expect(firstHeadline?.attributes).toMatchObject({
			text: 'Headline one',
			iluFile: 'spravy/spravy-v3-smoke/clips/headline1.mp4',
			source: 'TASR',
		})

		const firstL3d = segment.parts[0]?.objects.find((obj) => obj.clipName === 'gfx/l3d-headline')
		expect(firstL3d?.attributes).toMatchObject({
			headline: 'fico v bruseli?',
			subline: 'narobil bordel',
		})
	})

	it('parses SYN as VO and Cam as camera in story segment', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-story'))

		expect(segment.type).toBe(SegmentType.STORY)
		expect(segment.parts.map((part) => part.type)).toEqual([PartType.Camera, PartType.VO, PartType.VO])

		const synPart = segment.parts[1]
		expect(synPart?.objects.some((obj) => obj.clipName === 'gfx/l3d-syn')).toBe(true)
	})
})
