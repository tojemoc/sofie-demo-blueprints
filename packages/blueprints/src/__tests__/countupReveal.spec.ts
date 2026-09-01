import { describe, expect, it } from 'vitest'
import { PartType, CameraProps, PartProps } from '../base/showstyle/definitions/index.js'
import { generateCameraPart, partUsesDoubleBoxCamera } from '../base/showstyle/part-adapters/camera.js'
import { createCountupRevealClaim } from '../base/showstyle/helpers/countupReveal.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { SourceType } from '../base/studio/helpers/config.js'
import { mockSegmentContext } from './helpers/smokeRundownIngest.js'

describe('countupReveal claim', () => {
	it('allows one reveal per generation per rundownId, again after a new generation', () => {
		const rundownId = 'spravy-v3-smoke'

		const generation1 = createCountupRevealClaim()
		expect(generation1.claim(rundownId)).toBe(true)
		expect(generation1.claim(rundownId)).toBe(false)

		const generation2 = createCountupRevealClaim()
		expect(generation2.claim(rundownId)).toBe(true)
		expect(generation2.claim(rundownId)).toBe(false)
	})

	it('adds exactly one reveal piece per generation across two DoubleBox parts', () => {
		const segmentContext = mockSegmentContext()
		const doubleBoxPart = (externalId: string): PartProps<CameraProps> => ({
			type: PartType.Camera,
			rawType: 'DoubleBox',
			rawTitle: externalId,
			payload: {
				externalId,
				name: externalId,
				script: '',
				input: { id: 1, type: SourceType.Camera },
				duration: 8000,
			},
			objects: [
				{
					id: `ilu-${externalId}`,
					objectType: ObjectType.Graphic,
					clipName: 'gfx/doublebox-ilu',
					objectTime: 0,
					duration: 8000,
					isAdlib: false,
					attributes: { iluFile: 'clips/test.mp4' },
				},
			],
		})

		const db1 = doubleBoxPart('part-db-1')
		const db2 = doubleBoxPart('part-db-2')
		expect(partUsesDoubleBoxCamera(db1)).toBe(true)

		const generation1 = createCountupRevealClaim()
		const ctx1 = new PartContext(segmentContext, db1.payload.externalId)
		const first = generateCameraPart(ctx1, db1, generation1)
		const second = generateCameraPart(new PartContext(segmentContext, db2.payload.externalId), db2, generation1)

		const revealPieces = (pieces: { externalId: string }[]) =>
			pieces.filter((piece) => piece.externalId.endsWith('_countup_reveal'))

		expect(revealPieces(first.pieces)).toHaveLength(1)
		expect(revealPieces(second.pieces)).toHaveLength(0)

		const generation2 = createCountupRevealClaim()
		const regen = generateCameraPart(new PartContext(segmentContext, db1.payload.externalId), db1, generation2)
		expect(revealPieces(regen.pieces)).toHaveLength(1)
	})
})
