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
	IntroProps,
} from '../base/showstyle/definitions/index.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { generateIntroPart } from '../base/showstyle/part-adapters/intro.js'
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
	isDoubleBoxLook,
	lookSlotForKind,
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
				const content = obj.content as { channel?: number; layer?: unknown } | undefined
				return content?.channel
			}
		}
	}
	return undefined
}

function pgmRouteLayer(
	pieces: ReadonlyArray<{ content?: { timelineObjects?: ReadonlyArray<{ layer?: unknown; content?: unknown }> } }>
): unknown {
	for (const piece of pieces) {
		for (const obj of piece.content?.timelineObjects ?? []) {
			if (obj.layer === CasparCGLayers.CasparCGPgmRoute) {
				return (obj.content as { layer?: unknown } | undefined)?.layer
			}
		}
	}
	return undefined
}

describe('pgmLook look-kind channels + route', () => {
	beforeEach(() => {
		resetLookSlotGenerationForTests()
	})

	it('maps DoubleBox → A and Full → B', () => {
		expect(lookSlotForKind('doublebox')).toBe('A')
		expect(lookSlotForKind('full')).toBe('B')
		expect(isDoubleBoxLook('DoubleBox', [])).toBe(true)
		expect(isDoubleBoxLook('Cam', [])).toBe(false)
		expect(
			isDoubleBoxLook('Cam', [
				{
					id: 'ilu',
					objectType: 'graphic',
					objectTime: 0,
					duration: 0,
					clipName: 'gfx/doublebox-ilu',
					attributes: {},
				} as never,
			])
		).toBe(true)
	})

	it('LookSlotSequence claim/peek remembers last look; defaults to Full', () => {
		const sequence = createLookSlotSequence()
		expect(sequence.peek()).toBe('B')
		expect(sequence.claim('B')).toBe('B')
		expect(sequence.peek()).toBe('B')
		expect(sequence.claim('A')).toBe('A')
		expect(sequence.peek()).toBe('A')
	})

	it('maps look A to BG 3 and look B to BG 4', () => {
		expect(getLookCasparChannel(hybridCasparConfig, 'A')).toBe(3)
		expect(getLookCasparChannel(hybridCasparConfig, 'B')).toBe(4)
	})

	it('converts wipe cut-point ms to STING frames at 50fps', () => {
		expect(wipeStingDelayFrames(WIPE_CUT_POINT_MS)).toBe(38)
	})

	it('keeps smoke headlines on Full (ch4) with full-channel route layer null', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-headlines')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())

		expect(generated.parts.map((part) => part.part.externalId)).toEqual(['part-hl-1', 'part-hl-2', 'part-hl-3'])
		expect(pgmRouteChannel(generated.parts[0].pieces)).toBe(4)
		expect(pgmRouteChannel(generated.parts[1].pieces)).toBe(4)
		expect(pgmRouteChannel(generated.parts[2].pieces)).toBe(4)
		expect(pgmRouteLayer(generated.parts[0].pieces)).toBeNull()
		expect(pgmRouteLayer(generated.parts[1].pieces)).toBeNull()
		expect(pgmRouteLayer(generated.parts[2].pieces)).toBeNull()

		const hl2Timeline = generated.parts[1].pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_B_LAYERS.lowerThird)).toBe(true)
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_A_LAYERS.lowerThird)).toBe(false)
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_B_LAYERS.camera)).toBe(true)
	})

	it('hard-cut VO (Full) emits PGM route://4 with no STING and layer null', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.type === PartType.VO)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		const routePiece = result.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmRoute as string))
		const routeObj = routePiece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)

		expect(routePiece).toBeDefined()
		expect(routeObj?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.ROUTE,
			channel: 4,
			layer: null,
		})
		expect((routeObj?.content as TSR.TimelineContentCCGRoute).transitions).toBeUndefined()
	})

	it('remaps Full clips onto channel-4 mappings and routes PGM from 4', () => {
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
			layer: null,
		})
	})

	it('wiped DoubleBox → route://3 STING; wiped SYN (Full) → PGM overlay + delayed route://4', () => {
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
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())
		const dbPart = generated.parts.find((part) => part.part.externalId === 'part-tema-1-db')
		const synPart = generated.parts.find((part) => part.part.externalId === 'part-tema-1-syn-1')
		expect(dbPart).toBeDefined()
		expect(synPart).toBeDefined()
		if (!dbPart || !synPart) return

		expect(pgmRouteChannel(dbPart.pieces)).toBe(3)
		expect(pgmRouteChannel(synPart.pieces)).toBe(4)
		expect(pgmRouteLayer(dbPart.pieces)).toBeNull()
		expect(pgmRouteLayer(synPart.pieces)).toBeNull()

		const dbTimeline = dbPart.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		const synTimeline = synPart.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		expect(dbTimeline.some((obj) => obj.layer === LOOK_A_LAYERS.camera)).toBe(true)
		expect(dbTimeline.some((obj) => obj.layer === LOOK_A_LAYERS.lowerThird)).toBe(true)
		expect(dbTimeline.some((obj) => obj.layer === LOOK_B_LAYERS.camera)).toBe(false)

		const dbRoute = dbTimeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(dbRoute?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.ROUTE,
			channel: 3,
			layer: null,
			transitions: {
				inTransition: { type: TSR.Transition.STING, maskFile: 'wipes/wipe' },
			},
		})
		expect(dbTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(false)

		const synL3d = synTimeline.find(
			(obj) =>
				obj.layer === LOOK_B_LAYERS.lowerThird &&
				(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)
		expect(synL3d, 'SYN L3D must pre-build on Full (ch4), not on DoubleBox').toBeDefined()
		expect(synTimeline.some((obj) => obj.layer === LOOK_A_LAYERS.lowerThird)).toBe(false)

		const synRoute = synTimeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(synRoute?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect(synRoute?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.ROUTE,
			channel: 4,
			layer: null,
		})
		expect((synRoute?.content as TSR.TimelineContentCCGRoute).transitions?.inTransition).toBeUndefined()
		expect(synTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(true)
	})

	it('keeps DoubleBox on ch3 and Full on ch4 across segments (no index ping-pong)', () => {
		const exportData = loadSmokeRundownExport()
		const lookSlots = createLookSlotSequence()

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

		const tema3Syn = tema3.parts.find((part) => part.part.externalId === 'part-tema-3-syn-1')
		const tema3Db = tema3.parts.find((part) => part.part.externalId === 'part-tema-3-syn-2') // ILU Drucker (DoubleBox)
		const tema4Db = tema4.parts[0]
		expect(tema3Syn).toBeDefined()
		expect(tema3Db).toBeDefined()
		expect(tema4Db?.part.externalId).toBe('part-tema-4-db')
		if (!tema3Syn || !tema3Db || !tema4Db) return

		expect(pgmRouteChannel(tema3Syn.pieces)).toBe(4) // SYN Full
		expect(pgmRouteChannel(tema3Db.pieces)).toBe(3) // DoubleBox
		expect(pgmRouteChannel(tema4Db.pieces)).toBe(3) // next DoubleBox still ch3
	})

	it('keeps fullscreen Camera / Remote peeks on Full (ch4)', () => {
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
		expect(pgmRouteChannel(generated.parts[0].pieces)).toBe(4) // fullscreen Cam → Full
		expect(pgmRouteChannel(generated.parts[1].pieces)).toBe(4) // Remote peeks Full
		expect(pgmRouteChannel(generated.parts[2].pieces)).toBe(4)
	})

	it('does not add LED bg zoom for Transport near-match segment names', () => {
		const segment: SegmentProps = {
			type: SegmentType.STORY,
			payload: { name: 'Transport', externalId: 'seg-transport' },
			parts: [
				{
					type: PartType.Camera,
					rawType: 'Cam',
					rawTitle: 'part-transport-cam',
					payload: {
						externalId: 'part-transport-cam',
						name: 'Transport cam',
						script: '',
						input: { id: 1, type: SourceType.Camera },
						duration: 5000,
					},
					objects: [],
				},
			],
		}

		const generated = generateParts(mockSegmentContext(), segment, createCountupRevealClaim(), createLookSlotSequence())
		expect(generated.parts[0].pieces.some((piece) => piece.externalId.endsWith('_led_bg_zoom'))).toBe(false)
	})

	it('Intro holds Full underlay route://4 beneath the PGM overlay', () => {
		const exportData = loadSmokeRundownExport()
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-intro'))
		const introPart = segment.parts.find((part) => part.type === PartType.Intro)
		expect(introPart).toBeDefined()
		if (!introPart) return

		const partContext = new PartContext(mockSegmentContext(), introPart.payload.externalId)
		const result = generateIntroPart(partContext, introPart as PartProps<IntroProps>, 'B')
		expect(pgmRouteChannel(result.pieces)).toBe(4)
		expect(pgmRouteLayer(result.pieces)).toBeNull()
		expect(result.pieces.some((piece) => piece.name.startsWith('Intro |'))).toBe(true)
	})

	it('smoke CSV contract: headlines/privítanie→4, tema ILU↔SYN→3/4, SJV wipe overlay on Full', () => {
		const exportData = loadSmokeRundownExport()
		const lookSlots = createLookSlotSequence()
		const countup = createCountupRevealClaim()

		const gen = (segmentId: string) =>
			generateParts(
				mockSegmentContext(),
				convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, segmentId)),
				countup,
				lookSlots
			)

		const headlines = gen('seg-headlines')
		for (const part of headlines.parts) {
			expect(pgmRouteChannel(part.pieces)).toBe(4)
			expect(part.pieces.some((piece) => piece.externalId.endsWith('_full_bg_loop'))).toBe(true)
		}

		const introSeg = gen('seg-intro')
		const intro = introSeg.parts.find((part) => part.part.externalId === 'part-intro')
		const privitanie = introSeg.parts.find((part) => part.part.externalId === 'part-intro-mod')
		expect(pgmRouteChannel(intro?.pieces ?? [])).toBe(4)
		expect(pgmRouteChannel(privitanie?.pieces ?? [])).toBe(4)
		expect(privitanie?.pieces.some((piece) => piece.externalId.endsWith('_full_bg_loop'))).toBe(true)

		const tema1 = gen('seg-tema-1')
		const db = tema1.parts.find((part) => part.part.externalId === 'part-tema-1-db')
		const syn = tema1.parts.find((part) => part.part.externalId === 'part-tema-1-syn-1')
		expect(pgmRouteChannel(db?.pieces ?? [])).toBe(3)
		expect(pgmRouteChannel(syn?.pieces ?? [])).toBe(4)
		const dbRoute = (db?.pieces ?? [])
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(dbRoute?.content).toMatchObject({
			transitions: { inTransition: { type: TSR.Transition.STING } },
		})
		expect(db?.pieces.some((piece) => piece.externalId.endsWith('_led_bg_zoom'))).toBe(true)
		expect(syn?.pieces.some((piece) => piece.externalId.endsWith('_led_bg_zoom'))).toBe(true)

		const sjv = gen('seg-sjv')
		const sjvOpen = sjv.parts.find((part) => part.part.externalId === 'part-sjv-open')
		expect(pgmRouteChannel(sjvOpen?.pieces ?? [])).toBe(4)
		const sjvTimeline = (sjvOpen?.pieces ?? []).flatMap((piece) => piece.content.timelineObjects ?? [])
		expect(sjvTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(true)
		const sjvRoute = sjvTimeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(sjvRoute?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect((sjvRoute?.content as TSR.TimelineContentCCGRoute).transitions?.inTransition).toBeUndefined()
	})
})
