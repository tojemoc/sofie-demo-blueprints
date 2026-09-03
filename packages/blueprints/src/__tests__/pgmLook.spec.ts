import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { PartType, VOProps, PartProps } from '../base/showstyle/definitions/index.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import {
	LOOK_A_LAYERS,
	LOOK_B_LAYERS,
	getLookCasparChannel,
	lookSlotForPartIndex,
	wipeStingDelayFrames,
} from '../base/showstyle/helpers/pgmLook.js'
import { WIPE_CUT_POINT_MS } from '../base/showstyle/helpers/clips.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

describe('pgmLook ping-pong + route', () => {
	it('alternates look slots by part index', () => {
		expect(lookSlotForPartIndex(0)).toBe('A')
		expect(lookSlotForPartIndex(1)).toBe('B')
		expect(lookSlotForPartIndex(2)).toBe('A')
	})

	it('maps look A to BG 3 and look B to BG 4', () => {
		expect(getLookCasparChannel(hybridCasparConfig, 'A')).toBe(3)
		expect(getLookCasparChannel(hybridCasparConfig, 'B')).toBe(4)
	})

	it('converts wipe cut-point ms to STING frames at 50fps', () => {
		expect(wipeStingDelayFrames(WIPE_CUT_POINT_MS)).toBe(38)
	})

	it('hard-cut VO parts still emit a PGM route with no STING', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.type === PartType.VO)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>)
		const routePiece = result.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmRoute as string))
		const routeObj = routePiece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)

		expect(routePiece).toBeDefined()
		expect(routeObj?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.ROUTE,
			channel: 3,
		})
		expect((routeObj?.content as TSR.TimelineContentCCGRoute).transitions).toBeUndefined()
	})

	it('remaps look B clips onto channel-4 mappings and routes PGM from 4', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.type === PartType.VO)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		expect(timeline.some((obj) => obj.layer === LOOK_B_LAYERS.clip)).toBe(true)
		expect(timeline.some((obj) => obj.layer === LOOK_A_LAYERS.clip)).toBe(false)

		const routeObj = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(routeObj?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.ROUTE,
			channel: 4,
		})
	})

	it('ping-pongs tema-1 DoubleBox then SYN onto opposite BG looks; SYN L3D is not on the PGM route', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const synIngest = ingest.parts.find((part) => part.externalId === 'part-tema-1-syn-1')
		const payload = synIngest?.payload as {
			pieces: Array<{ id: string; objectType: string; attributes: Record<string, unknown> }>
		}
		if (payload && !payload.pieces.some((piece) => piece.objectType.toLowerCase() === 'wipe')) {
			payload.pieces.push({
				id: 'part-tema-1-syn-1-wipe',
				objectType: 'wipe',
				attributes: { fileName: 'wipes/wipe', transition: 'ILU TO SYN' },
			})
		}

		const intermediate = convertIngestData(mockIngestContext, ingest)
		const dbIndex = intermediate.parts.findIndex((part) => part.payload.externalId === 'part-tema-1-db')
		const synIndex = intermediate.parts.findIndex((part) => part.payload.externalId === 'part-tema-1-syn-1')
		expect(dbIndex).toBeGreaterThanOrEqual(0)
		expect(synIndex).toBeGreaterThan(dbIndex)
		expect(lookSlotForPartIndex(dbIndex)).not.toBe(lookSlotForPartIndex(synIndex))

		const generated = generateParts(mockSegmentContext(), intermediate)
		const dbPart = generated.parts.find((part) => part.part.externalId === 'part-tema-1-db')
		const synPart = generated.parts.find((part) => part.part.externalId === 'part-tema-1-syn-1')
		expect(dbPart).toBeDefined()
		expect(synPart).toBeDefined()
		if (!dbPart || !synPart) return

		const dbLayers = lookSlotForPartIndex(dbIndex) === 'B' ? LOOK_B_LAYERS : LOOK_A_LAYERS
		const synLayers = lookSlotForPartIndex(synIndex) === 'B' ? LOOK_B_LAYERS : LOOK_A_LAYERS
		const dbTimeline = dbPart.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		const synTimeline = synPart.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		expect(dbTimeline.some((obj) => obj.layer === dbLayers.camera)).toBe(true)
		expect(dbTimeline.some((obj) => obj.layer === dbLayers.lowerThird)).toBe(true)
		expect(dbTimeline.some((obj) => obj.layer === synLayers.camera)).toBe(false)

		const synL3d = synTimeline.find(
			(obj) =>
				obj.layer === synLayers.lowerThird &&
				(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)
		expect(synL3d, 'SYN L3D must pre-build on the idle BG look, not on the PGM route channel').toBeDefined()
		expect(synTimeline.some((obj) => obj.layer === dbLayers.lowerThird)).toBe(false)

		const synRoute = synTimeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(synRoute?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.ROUTE,
			channel: getLookCasparChannel(hybridCasparConfig, lookSlotForPartIndex(synIndex)),
			transitions: {
				inTransition: { type: TSR.Transition.STING, maskFile: 'wipes/wipe' },
			},
		})
		expect(synTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(false)
	})
})
