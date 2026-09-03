import { TSR } from '@sofie-automation/blueprints-integration'
import { beforeEach, describe, expect, it } from 'vitest'
import {
	PartType,
	SegmentType,
	VOProps,
	CameraProps,
	RemoteProps,
	PartProps,
	SegmentProps,
} from '../base/showstyle/definitions/index.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { SourceType } from '../base/studio/helpers/config.js'
import { createCountupRevealClaim } from '../base/showstyle/helpers/countupReveal.js'
import {
	LOOK_A_LAYERS,
	LOOK_B_LAYERS,
	createLookSlotSequence,
	getLookCasparChannel,
	lookSlotForPartIndex,
	resetLookSlotGenerationForTests,
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

function pgmRouteChannel(
	pieces: ReadonlyArray<{ content?: { timelineObjects?: ReadonlyArray<{ layer?: unknown; content?: unknown }> } }>
): number | undefined {
	for (const piece of pieces) {
		for (const obj of piece.content?.timelineObjects ?? []) {
			if (obj.layer === CasparCGLayers.CasparCGPgmRoute) {
				const content = obj.content as { channel?: number } | undefined
				return content?.channel
			}
		}
	}
	return undefined
}

describe('pgmLook ping-pong + route', () => {
	beforeEach(() => {
		resetLookSlotGenerationForTests()
	})

	it('alternates look slots by allocation index', () => {
		expect(lookSlotForPartIndex(0)).toBe('A')
		expect(lookSlotForPartIndex(1)).toBe('B')
		expect(lookSlotForPartIndex(2)).toBe('A')
	})

	it('LookSlotSequence advances only on allocate; peek reuses last', () => {
		const sequence = createLookSlotSequence()
		expect(sequence.peek()).toBe('A')
		expect(sequence.allocate()).toBe('A')
		expect(sequence.peek()).toBe('A')
		expect(sequence.allocate()).toBe('B')
		expect(sequence.peek()).toBe('B')
		expect(sequence.allocate()).toBe('A')
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
		const dbSlot = lookSlotForPartIndex(0)
		const synSlot = lookSlotForPartIndex(1)
		expect(dbSlot).not.toBe(synSlot)

		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())
		const dbPart = generated.parts.find((part) => part.part.externalId === 'part-tema-1-db')
		const synPart = generated.parts.find((part) => part.part.externalId === 'part-tema-1-syn-1')
		expect(dbPart).toBeDefined()
		expect(synPart).toBeDefined()
		if (!dbPart || !synPart) return

		const dbLayers = dbSlot === 'B' ? LOOK_B_LAYERS : LOOK_A_LAYERS
		const synLayers = synSlot === 'B' ? LOOK_B_LAYERS : LOOK_A_LAYERS
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
			channel: getLookCasparChannel(hybridCasparConfig, synSlot),
			transitions: {
				inTransition: { type: TSR.Transition.STING, maskFile: 'wipes/wipe' },
			},
		})
		expect(synTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(false)
	})

	it('continues look ping-pong across segments so adjacent looks get distinct BG channels', () => {
		const exportData = loadSmokeRundownExport()
		const lookSlots = createLookSlotSequence()

		// tema-3 has 3 look-bearing parts (A,B,A); per-segment reset would make tema-4's first look also A.
		const tema3 = generateParts(
			mockSegmentContext(),
			convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-tema-3')),
			undefined,
			lookSlots
		)
		const tema4 = generateParts(
			mockSegmentContext(),
			convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-tema-4')),
			undefined,
			lookSlots
		)

		const tema3Last = tema3.parts[tema3.parts.length - 1]
		const tema4First = tema4.parts[0]
		expect(tema3Last?.part.externalId).toBe('part-tema-3-syn-2')
		expect(tema4First?.part.externalId).toBe('part-tema-4-db')

		const lastChannel = pgmRouteChannel(tema3Last.pieces)
		const firstChannel = pgmRouteChannel(tema4First.pieces)
		expect(lastChannel).toBe(3) // third look → A
		expect(firstChannel).toBe(4) // continues to B across the segment boundary
		expect(firstChannel).not.toBe(lastChannel)
	})

	it('does not consume a look slot for Remote between look-bearing Camera parts', () => {
		const cameraPart = (externalId: string): PartProps<CameraProps> => ({
			type: PartType.Camera,
			rawType: 'Cam',
			rawTitle: externalId,
			payload: {
				externalId,
				name: externalId,
				script: '',
				input: { id: 1, type: SourceType.Camera },
				duration: 5000,
			},
			objects: [],
		})
		const remotePart: PartProps<RemoteProps> = {
			type: PartType.Remote,
			rawType: 'Remote',
			rawTitle: 'part-remote',
			payload: {
				externalId: 'part-remote',
				name: 'Remote 1',
				script: '',
				input: { id: 1, type: SourceType.Remote },
				duration: 5000,
			},
			objects: [],
		}

		const segment: SegmentProps = {
			type: SegmentType.STORY,
			payload: { name: 'remote-gap', externalId: 'seg-remote-gap' },
			parts: [cameraPart('part-cam-1'), remotePart, cameraPart('part-cam-2')],
		}

		const generated = generateParts(mockSegmentContext(), segment, createCountupRevealClaim(), createLookSlotSequence())
		expect(pgmRouteChannel(generated.parts[0].pieces)).toBe(3) // Camera allocates A
		expect(pgmRouteChannel(generated.parts[1].pieces)).toBe(3) // Remote peeks A (no advance)
		expect(pgmRouteChannel(generated.parts[2].pieces)).toBe(4) // next Camera allocates B
	})
})
