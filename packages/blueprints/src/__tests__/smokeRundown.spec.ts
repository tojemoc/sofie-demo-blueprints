import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PartType, SegmentType } from '../base/showstyle/definitions/index.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { resolveSegmentType } from '../common/definitions/rundownEditorTypes.js'

type SmokeRundownExport = {
	segments: Array<{ id: string; name: string; payload?: { type?: string } }>
	parts: Array<{
		id: string
		name: string
		segmentId: string
		partType?: string
		duration?: number
		script?: string
		payload: { type: string; duration?: number; script?: string }
	}>
	pieces: Array<{
		id: string
		partId: string
		pieceType: string
		start?: number
		duration?: number
		payload: Record<string, string | number>
	}>
}

function smokeExportToIngestSegment(
	exportData: SmokeRundownExport,
	segmentId: string
): Parameters<typeof convertIngestData>[1] {
	const segment = exportData.segments.find((s) => s.id === segmentId)
	if (!segment) throw new Error(`Missing segment ${segmentId}`)

	const parts = exportData.parts
		.filter((part) => part.segmentId === segmentId)
		.map((part) => ({
			externalId: part.id,
			name: part.name,
			payload: {
				segmentId,
				externalId: part.id,
				rank: 0,
				name: part.name,
				type: part.payload.type,
				float: false,
				script: part.script ?? part.payload.script ?? '',
				duration: part.duration ?? part.payload.duration ?? 0,
				pieces: exportData.pieces
					.filter((piece) => piece.partId === part.id)
					.map((piece) => ({
						id: piece.id,
						objectType: piece.pieceType,
						objectTime: piece.start ?? 0,
						duration: piece.duration ?? 0,
						clipName: '',
						attributes: piece.payload,
					})),
			},
		}))

	return {
		externalId: segment.id,
		name: segment.name,
		payload: {
			rundownId: 'smoke',
			externalId: segment.id,
			rank: 0,
			name: segment.name,
			float: false,
			type: segment.payload?.type ?? 'normal',
		},
		parts,
	} as Parameters<typeof convertIngestData>[1]
}

const mockContext = {
	logError: () => undefined,
	logWarning: () => undefined,
} as never

describe('spravy-v3-smoke-rundown.json', () => {
	const exportData: SmokeRundownExport = JSON.parse(
		readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../../../assets/spravy-v3-smoke-rundown.json'),
			'utf8'
		)
	)

	it('resolves editorial segment types from payload.type', () => {
		expect(resolveSegmentType({ type: 'opening' })).toBe(SegmentType.OPENING)
		expect(resolveSegmentType({ type: 'headlines' })).toBe(SegmentType.HEADLINES)
		expect(resolveSegmentType({ type: 'story' })).toBe(SegmentType.STORY)
	})

	it('parses opening GFX parts with Caspar L3D piece types', () => {
		const segment = convertIngestData(mockContext, smokeExportToIngestSegment(exportData, 'seg-opening'))

		expect(segment.type).toBe(SegmentType.OPENING)
		expect(segment.parts).toHaveLength(3)
		expect(segment.parts.every((part) => part.type === PartType.GFX)).toBe(true)
		expect(segment.parts[0]?.objects[0]?.clipName).toBe('gfx/l3d-tema')
	})

	it('parses ILU headline parts as camera parts with headline graphics', () => {
		const segment = convertIngestData(mockContext, smokeExportToIngestSegment(exportData, 'seg-headlines'))

		expect(segment.type).toBe(SegmentType.HEADLINES)
		expect(segment.parts).toHaveLength(3)
		expect(segment.parts.every((part) => part.type === PartType.Camera)).toBe(true)

		const firstHeadline = segment.parts[0]?.objects.find((obj) => obj.clipName === 'gfx/headline')
		expect(firstHeadline?.attributes).toMatchObject({
			text: 'Headline one',
			iluFile: 'spravy/spravy-v3-smoke/clips/headline1.mp4',
			source: 'TASR',
		})
	})

	it('parses SYN as VO and Cam as camera in story segment', () => {
		const segment = convertIngestData(mockContext, smokeExportToIngestSegment(exportData, 'seg-story'))

		expect(segment.type).toBe(SegmentType.STORY)
		expect(segment.parts.map((part) => part.type)).toEqual([PartType.Camera, PartType.VO, PartType.VO])

		const synPart = segment.parts[1]
		expect(synPart?.objects.some((obj) => obj.clipName === 'gfx/l3d-syn')).toBe(true)
	})
})
