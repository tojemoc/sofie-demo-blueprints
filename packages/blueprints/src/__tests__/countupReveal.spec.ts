import { describe, beforeEach, expect, it } from 'vitest'
import { PartType, CameraProps, PartProps, VOProps } from '../base/showstyle/definitions/index.js'
import { generateCameraPart, partUsesDoubleBoxCamera } from '../base/showstyle/part-adapters/camera.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import {
	appendCountupSustainIfRevealed,
	beginCountupRevealGeneration,
	createCountupRevealClaim,
	getCountupRevealClaimForGeneration,
	resetCountupRevealGenerationForTests,
} from '../base/showstyle/helpers/countupReveal.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { SourceType } from '../base/studio/helpers/config.js'
import { hybridCasparConfig, mockSegmentContext } from './helpers/smokeRundownIngest.js'

describe('countupReveal claim', () => {
	beforeEach(() => {
		resetCountupRevealGenerationForTests()
	})

	it('allows one reveal per generation per rundownId, again after a new generation', () => {
		const rundownId = 'spravy-v3-smoke'

		const generation1 = createCountupRevealClaim()
		expect(generation1.claim(rundownId)).toBe(true)
		expect(generation1.isRevealed(rundownId)).toBe(true)
		expect(generation1.claim(rundownId)).toBe(false)

		const generation2 = createCountupRevealClaim()
		expect(generation2.claim(rundownId)).toBe(true)
		expect(generation2.claim(rundownId)).toBe(false)
	})

	it('reuses one claim instance across segments in the same rundown generation', () => {
		const rundownId = 'spravy-v3-smoke'
		beginCountupRevealGeneration(rundownId)

		const claimFromSeg1 = getCountupRevealClaimForGeneration(rundownId)
		const claimFromSeg2 = getCountupRevealClaimForGeneration(rundownId)

		expect(claimFromSeg1).toBe(claimFromSeg2)
		expect(claimFromSeg1.claim(rundownId)).toBe(true)
		expect(claimFromSeg2.claim(rundownId)).toBe(false)
	})

	it('adds exactly one reveal piece per generation across two DoubleBox parts in one segment', () => {
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

		beginCountupRevealGeneration('spravy-v3-smoke')
		const generation1 = getCountupRevealClaimForGeneration('spravy-v3-smoke')
		const ctx1 = new PartContext(segmentContext, db1.payload.externalId)
		const first = generateCameraPart(ctx1, db1, generation1)
		const second = generateCameraPart(new PartContext(segmentContext, db2.payload.externalId), db2, generation1)

		const revealPieces = (pieces: { externalId: string }[]) =>
			pieces.filter((piece) => piece.externalId.endsWith('_countup_reveal'))

		expect(revealPieces(first.pieces)).toHaveLength(1)
		expect(revealPieces(second.pieces)).toHaveLength(0)

		beginCountupRevealGeneration('spravy-v3-smoke')
		const generation2 = getCountupRevealClaimForGeneration('spravy-v3-smoke')
		const regen = generateCameraPart(new PartContext(segmentContext, db1.payload.externalId), db1, generation2)
		expect(revealPieces(regen.pieces)).toHaveLength(1)
	})

	it('adds exactly one reveal across DoubleBox parts in separate segments', () => {
		const rundownId = 'spravy-v3-smoke'
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

		beginCountupRevealGeneration(rundownId)
		const sharedClaim = getCountupRevealClaimForGeneration(rundownId)

		const seg1Db = doubleBoxPart('part-seg-1-db')
		const seg2Db = doubleBoxPart('part-seg-2-db')

		const revealPieces = (pieces: { externalId: string }[]) =>
			pieces.filter((piece) => piece.externalId.endsWith('_countup_reveal'))

		const firstSegment = generateCameraPart(
			new PartContext(segmentContext, seg1Db.payload.externalId),
			seg1Db,
			sharedClaim
		)
		const secondSegmentClaim = getCountupRevealClaimForGeneration(rundownId)
		const secondSegment = generateCameraPart(
			new PartContext(segmentContext, seg2Db.payload.externalId),
			seg2Db,
			secondSegmentClaim
		)

		expect(secondSegmentClaim).toBe(sharedClaim)
		expect(revealPieces(firstSegment.pieces)).toHaveLength(1)
		expect(revealPieces(secondSegment.pieces)).toHaveLength(0)

		beginCountupRevealGeneration(rundownId)
		const regenClaim = getCountupRevealClaimForGeneration(rundownId)
		const regen = generateCameraPart(new PartContext(segmentContext, seg1Db.payload.externalId), seg1Db, regenClaim)
		expect(revealPieces(regen.pieces)).toHaveLength(1)
	})

	it('adds sustain pieces on later parts after reveal', () => {
		const rundownId = 'spravy-v3-smoke'
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

		beginCountupRevealGeneration(rundownId)
		const claim = getCountupRevealClaimForGeneration(rundownId)
		const first = generateCameraPart(new PartContext(segmentContext, 'part-db-1'), doubleBoxPart('part-db-1'), claim)
		expect(first.pieces.some((piece) => piece.externalId === 'part-db-1_countup_reveal')).toBe(true)

		const synPart: PartProps<VOProps> = {
			type: PartType.VO,
			rawType: 'SYN',
			rawTitle: 'SYN',
			payload: {
				externalId: 'part-syn-1',
				name: 'SYN',
				script: '',
				duration: 5000,
				clipProps: { fileName: 'clips/SYN TEST.mp4' },
			},
			objects: [],
		}
		const synResult = generateVOPart(new PartContext(segmentContext, 'part-syn-1'), synPart)
		appendCountupSustainIfRevealed(
			new PartContext(segmentContext, 'part-syn-1'),
			hybridCasparConfig,
			'part-syn-1',
			synResult.pieces,
			claim
		)
		expect(synResult.pieces.some((piece) => piece.externalId === 'part-syn-1_countup_sustain')).toBe(true)
	})
})
