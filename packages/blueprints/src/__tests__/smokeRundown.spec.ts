import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { CameraProps, GfxProps, PartProps, PartType, SegmentType } from '../base/showstyle/definitions/index.js'
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
import { createCountupRevealClaim } from '../base/showstyle/helpers/countupReveal.js'
import { generateGfxPart } from '../base/showstyle/part-adapters/gfx.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { resolveSegmentType } from '../common/definitions/rundownEditorTypes.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

describe('spravy-v3-smoke-rundown.json (muster)', () => {
	const exportData = loadSmokeRundownExport()

	it('covers the production muster segment spine', () => {
		expect(exportData.segments.map((s) => s.id)).toEqual([
			'seg-headlines',
			'seg-intro',
			'seg-tema-1',
			'seg-tema-2',
			'seg-tema-3',
			'seg-tema-4',
			'seg-tema-5',
			'seg-sjv',
			'seg-sport',
			'seg-weather',
			'seg-outro',
		])
		expect(exportData.parts.length).toBeGreaterThanOrEqual(30)
		expect(exportData.pieces.some((p) => p.pieceType === 'intro')).toBe(true)
		expect(exportData.pieces.some((p) => p.pieceType === 'l3d-predstavovak')).toBe(true)
		expect(exportData.pieces.some((p) => p.pieceType === 'l3d-predstavovak')).toBe(true)
		expect(exportData.pieces.some((p) => p.pieceType === 'l3d-sjv')).toBe(true)
		expect(exportData.pieces.some((p) => p.pieceType === 'l3d-sport')).toBe(true)
		expect(exportData.pieces.some((p) => p.pieceType === 'l3d-odporucanie')).toBe(true)
		expect(exportData.pieces.some((p) => p.pieceType === 'weather')).toBe(true)
		expect(exportData.pieces.some((p) => p.pieceType === 'outro')).toBe(true)
		// SJV body is SYN cluster (not ILU)
		expect(
			exportData.parts.filter((p) => p.segmentId === 'seg-sjv' && p.partType === 'syn').length
		).toBeGreaterThanOrEqual(3)
		// Prompter scripts filled for spoken ILU / headline parts (SYN SOTs stay empty)
		expect(
			exportData.parts.filter((p) => (p.script ?? p.payload.script ?? '').trim().length > 0).length
		).toBeGreaterThanOrEqual(20)
	})

	it('resolves editorial segment types from payload.type', () => {
		expect(resolveSegmentType({ type: 'opening' })).toBe(SegmentType.OPENING)
		expect(resolveSegmentType({ type: 'headlines' })).toBe(SegmentType.HEADLINES)
		expect(resolveSegmentType({ type: 'story' })).toBe(SegmentType.STORY)
	})

	it('parses intro opening with Mod L3D on fullscreen cam', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-intro'))

		expect(segment.type).toBe(SegmentType.OPENING)
		expect(segment.parts.some((part) => part.type === PartType.Intro)).toBe(true)
		const modPart = segment.parts.find((part) => part.payload.name === 'Gabriela Kajtárová')
		expect(modPart?.type).toBe(PartType.Camera)
		expect(modPart?.objects.some((obj) => obj.clipName === 'gfx/l3d-predstavovak')).toBe(true)
		expect(modPart?.objects.some((obj) => obj.clipName === 'gfx/logo-bug')).toBe(false)
		expect(modPart?.payload.script).toBe('Gabriela Kajtárová')
	})

	it('skips logo-bug ingest (baseline assets/countup covers logo + countup)', () => {
		const tema1 = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-tema-1'))
		const firstDb = tema1.parts.find((part) => part.payload.externalId === 'part-tema-1-db')
		expect(firstDb?.objects.some((obj) => obj.clipName === 'gfx/logo-bug')).toBe(false)
	})

	it('does not mark editor graphics without start as adlibs', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-intro'))

		for (const part of segment.parts) {
			const timelineGraphics = part.objects.filter((obj) => obj.objectType === ObjectType.Graphic)
			expect(timelineGraphics.every((obj) => !obj.isAdlib)).toBe(true)
			expect(timelineGraphics.every((obj) => obj.objectTime === 0)).toBe(true)
		}
	})

	it('generates GFX timeline pieces for intro Mod without adlib-only primary graphic', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-intro'))
		const segmentContext = mockSegmentContext()
		const gfxParts = segment.parts.filter((part) => part.type === PartType.GFX)

		for (const rawPart of gfxParts) {
			const partContext = new PartContext(segmentContext, rawPart.payload.externalId)
			const result = generateGfxPart(partContext, rawPart as PartProps<GfxProps>)

			expect(result.pieces.length).toBeGreaterThan(0)
			expect(result.pieces.some((piece) => piece.content.timelineObjects?.length)).toBe(true)
			// Non-ILU GFX (e.g. Mod / téma) keep Sofie AUTO.
			expect(result.part.autoNext).toBe(true)

			const externalIds = result.pieces.map((piece) => piece.externalId)
			expect(new Set(externalIds).size).toBe(externalIds.length)
		}
	})

	it('does not AUTO ILU parts even when adapted as GFX (no camera)', () => {
		const segmentContext = mockSegmentContext()
		const partContext = new PartContext(segmentContext, 'ilu-no-cam')
		const result = generateGfxPart(partContext, {
			type: PartType.GFX,
			rawType: 'ILU',
			rawTitle: 'ILU no cam',
			objects: [
				{
					id: 'g1',
					objectType: ObjectType.Graphic,
					objectTime: 0,
					duration: 8000,
					clipName: 'gfx/l3d-headline',
					attributes: { headline: 'A', subline: 'B' },
				},
			],
			payload: {
				externalId: 'ilu-no-cam',
				name: 'ILU no cam',
				duration: 8000,
				graphic: {
					id: 'g1',
					objectType: ObjectType.Graphic,
					objectTime: 0,
					duration: 8000,
					clipName: 'gfx/l3d-headline',
					attributes: { headline: 'A', subline: 'B' },
				},
			},
		} as PartProps<GfxProps>)

		expect(result.part.expectedDuration).toBe(8000)
		expect(result.part.autoNext).toBe(false)
	})

	it('HEADLINE ILU+cam parts are timed without Sofie AUTO', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-headlines'))
		const segmentContext = mockSegmentContext()
		const headline = segment.parts.find((part) => part.payload.name === 'HEADLINE1')
		expect(headline?.type).toBe(PartType.Camera)
		expect(headline).toBeDefined()
		if (!headline) return

		const partContext = new PartContext(segmentContext, headline.payload.externalId)
		const result = generateCameraPart(partContext, headline as PartProps<CameraProps>, createCountupRevealClaim())

		expect(result.part.expectedDuration).toBe(10000)
		expect(result.part.autoNext).toBeFalsy()

		const pgmCam = result.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmCamera)
		expect(pgmCam?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'dshow://video=OBS Virtual Camera',
			mixer: {
				fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
			},
		})

		const ilu = headline.objects.find((obj) => obj.clipName === 'gfx/headline')
		const l3d = headline.objects.find((obj) => obj.clipName === 'gfx/l3d-headline')
		expect(ilu?.duration).toBe(10000)
		expect(l3d?.duration).toBe(8000)
	})

	it('passes headline L3D fields as headline/subline to Caspar templates', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-headlines'))
		const headlinePart = segment.parts.find((part) => part.payload.name === 'HEADLINE1')
		const headlineObject = headlinePart?.objects.find((obj) => obj.clipName === 'gfx/l3d-headline')

		expect(headlineObject?.attributes).toMatchObject({
			headline: 'Osobné údaje',
			subline: 'v OR SR',
		})

		const graphics = parseGraphicsFromObjects(hybridCasparConfig, headlinePart?.objects ?? [])
		const piece = graphics.pieces.find((p) => p.name.startsWith('gfx/l3d-headline'))
		const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate | undefined
		expect(piece, 'gfx/l3d-headline timeline piece missing from parseGraphicsFromObjects').toBeDefined()
		expect(caspar, 'Caspar template timeline content missing on gfx/l3d-headline piece').toBeDefined()
		if (!piece || !caspar) return

		expect(caspar.data).toEqual({ headline: 'Osobné údaje', subline: 'v OR SR' })
	})

	it('parses HEADLINE ILU parts as camera parts with headline graphics and L3Ds', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-headlines'))

		expect(segment.type).toBe(SegmentType.HEADLINES)
		const iluParts = segment.parts.filter((part) => part.type === PartType.Camera)
		expect(iluParts).toHaveLength(3)

		const firstHeadline = segment.parts[0]?.objects.find((obj) => obj.clipName === 'gfx/headline')
		expect(firstHeadline?.attributes).toMatchObject({
			text: 'Osobné údaje v OR SR',
			iluFile: 'clips/HEADLINE1.mov',
		})
		expect(segment.parts[0]?.payload.script).toContain('obchodného registra')
	})

	it('normalizes legacy iluFile paths and passes through ingest durations unchanged', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-headlines')
		const partPayload = ingest.parts.find((part) => part.externalId === 'part-hl-1')?.payload as {
			duration: number
			pieces: Array<{ objectType: string; duration?: number; attributes: Record<string, unknown> }>
		}
		expect(partPayload).toBeDefined()
		if (!partPayload) return

		for (const piece of partPayload.pieces) {
			if (piece.objectType === 'headline') {
				piece.duration = 8
				piece.attributes.iluFile = 'spravy/spravy-v3-smoke/clips/headline1.mp4'
			}
			if (piece.objectType === 'l3d-headline') {
				piece.duration = 8
			}
		}

		const segment = convertIngestData(mockIngestContext, ingest)
		const headline = segment.parts.find((part) => part.payload.externalId === 'part-hl-1')
		const ilu = headline?.objects.find((obj) => obj.clipName === 'gfx/headline')
		const l3d = headline?.objects.find((obj) => obj.clipName === 'gfx/l3d-headline')

		expect((ilu?.attributes as { iluFile?: string } | undefined)?.iluFile).toBe('clips/headline1.mp4')
		expect(ilu?.duration).toBe(8000)
		expect(l3d?.duration).toBe(8000)
	})

	it('parses tema-1 story as DoubleBox camera + SYN VOs', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-tema-1'))

		expect(segment.type).toBe(SegmentType.STORY)
		expect(segment.parts[0]?.type).toBe(PartType.Camera)
		expect(segment.parts[0]?.rawType).toMatch(/doublebox/i)
		expect(segment.parts.some((part) => part.type === PartType.VO)).toBe(true)
		expect(segment.parts.some((part) => part.objects.some((obj) => obj.clipName === 'gfx/l3d-syn'))).toBe(true)
	})

	it('parses weather + outro sections', () => {
		const weather = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-weather'))
		expect(weather.parts[0]?.type).toBe(PartType.GFX)
		expect(weather.parts[0]?.objects.some((obj) => obj.clipName === 'gfx/pocasie')).toBe(true)

		const outro = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-outro'))
		expect(
			outro.parts.some((part) =>
				part.objects.some((obj) => obj.clipName === 'assets/outro' && obj.objectType === ObjectType.Video)
			)
		).toBe(true)
	})
})
