import { describe, expect, it } from 'vitest'
import { PartType } from '../base/showstyle/definitions/index.js'
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import {
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

describe('HEADLINES 1–3 timeline parity', () => {
	const exportData = loadSmokeRundownExport()
	const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-headlines'))
	const segmentContext = mockSegmentContext()

	it('each headline part keeps both LED ILU and PGM L3D (separate Sofie source layers)', () => {
		const headlines = segment.parts.filter((p) => /^HEADLINE\d$/.test(p.payload.name))
		expect(headlines).toHaveLength(3)

		for (const part of headlines) {
			expect(part.type).toBe(PartType.Camera)
			const graphics = part.objects.filter((o) => o.objectType === ObjectType.Graphic)
			const clipNames = graphics.map((g) => g.clipName).sort()
			expect(clipNames).toEqual(expect.arrayContaining(['gfx/headline', 'gfx/l3d-headline']))
			expect(clipNames.filter((n) => n === 'gfx/headline' || n === 'gfx/l3d-headline')).toEqual([
				'gfx/headline',
				'gfx/l3d-headline',
			])

			const partContext = new PartContext(segmentContext, part.payload.externalId)
			const result = generateCameraPart(partContext, part as never)

			const iluPiece = result.pieces.find((p) => p.sourceLayerId === String(SourceLayer.LowerThird))
			const l3dPiece = result.pieces.find((p) => p.sourceLayerId === String(SourceLayer.PgmLowerThird))
			expect(iluPiece, `${part.payload.name} missing LowerThird ILU piece`).toBeTruthy()
			expect(l3dPiece, `${part.payload.name} missing PgmLowerThird L3D piece`).toBeTruthy()
			// GFX output (not flattened PGM) — Caspar mapping is still PGM channel 2.
			expect(iluPiece?.outputLayerId).toBe('gfx')
			expect(l3dPiece?.outputLayerId).toBe('gfx')

			const tl = result.pieces.flatMap((p) => p.content?.timelineObjects ?? [])
			const ilu = tl.find((t) => t.layer === CasparCGLayers.CasparCGIluPlayer && (t.content as { file?: string }).file)
			const l3d = tl.find(
				(t) =>
					t.layer === CasparCGLayers.CasparCGGraphicsPgmLowerThird &&
					(t.content as { name?: string }).name === 'gfx/l3d-headline'
			)
			const fallback = tl.find(
				(t) =>
					t.layer === CasparCGLayers.CasparCGGraphicsLowerThird &&
					(t.content as { name?: string }).name === 'gfx/headline-fallback'
			)

			expect(ilu, `${part.payload.name} missing LED ILU PLAY`).toBeTruthy()
			expect((ilu?.content as { file: string }).file).toMatch(/clips\/HEADLINE\d/)
			expect(l3d, `${part.payload.name} missing PGM l3d-headline`).toBeTruthy()
			expect(fallback, `${part.payload.name} missing LED headline-fallback`).toBeTruthy()
		}
	})
})
