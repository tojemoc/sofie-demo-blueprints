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
import { generateParts, resolveLookSlotForPart } from '../base/showstyle/part-adapters/index.js'
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
	L3D_OUT_MS,
	LOOK_MEDIA_POSTROLL_MS,
	DEFAULT_LOOK_PREROLL_MS,
	createFullChannelRouteContent,
	createLookSlotSequence,
	getLookCasparChannel,
	isDoubleBoxLook,
	lookSlotForKind,
	parseRouteMediaChannel,
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
				const content = obj.content as { channel?: number; file?: string } | undefined
				if (typeof content?.channel === 'number') return content.channel
				return parseRouteMediaChannel(content?.file)
			}
		}
	}
	return undefined
}

function pgmRouteFile(
	pieces: ReadonlyArray<{ content?: { timelineObjects?: ReadonlyArray<{ layer?: unknown; content?: unknown }> } }>
): string | undefined {
	for (const piece of pieces) {
		for (const obj of piece.content?.timelineObjects ?? []) {
			if (obj.layer === CasparCGLayers.CasparCGPgmRoute) {
				return (obj.content as { file?: string } | undefined)?.file
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
		expect(isDoubleBoxLook('ILU-ZAVER', [])).toBe(false)
		expect(isDoubleBoxLook('Záver', [])).toBe(false)
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
		expect(
			isDoubleBoxLook('Cam', [
				{
					id: 'zaver',
					objectType: 'graphic',
					objectTime: 0,
					duration: 0,
					clipName: 'gfx/ilu-zaver',
					attributes: {},
				} as never,
			])
		).toBe(false)
	})

	it('LookSlotSequence claim/peek remembers last look; defaults to Full', () => {
		const sequence = createLookSlotSequence()
		expect(sequence.peek()).toBe('B')
		expect(sequence.claim('B')).toBe('B')
		expect(sequence.peek()).toBe('B')
		expect(sequence.claim('A')).toBe('A')
		expect(sequence.peek()).toBe('A')
	})

	it('resolveLookSlotForPart skips claim when floated or skipped', () => {
		const sequence = createLookSlotSequence()
		expect(resolveLookSlotForPart(PartType.Camera, [], sequence, 'DoubleBox')).toBe('A')
		expect(sequence.peek()).toBe('A')
		// Floated Full must not overwrite A — later DoubleBox still peeks A for DB→DB.
		expect(resolveLookSlotForPart(PartType.Camera, [], sequence, 'Cam', true)).toBe('A')
		expect(sequence.peek()).toBe('A')
		expect(resolveLookSlotForPart(PartType.Camera, [], sequence, 'DoubleBox')).toBe('A')
	})

	it('maps look A to BG 3 and look B to BG 4', () => {
		expect(getLookCasparChannel(hybridCasparConfig, 'A')).toBe(3)
		expect(getLookCasparChannel(hybridCasparConfig, 'B')).toBe(4)
	})

	it('converts wipe cut-point ms to frames at 50fps (docs helper; casparcg-state wants ms)', () => {
		expect(wipeStingDelayFrames(WIPE_CUT_POINT_MS)).toBe(19)
		expect(LOOK_MEDIA_POSTROLL_MS).toBe(WIPE_CUT_POINT_MS)
		expect(WIPE_CUT_POINT_MS).toBe(380)
	})

	it('STING escape hatch passes delay in ms (casparcg-state time2Frames)', () => {
		const content = createFullChannelRouteContent(3, 'wipes/wipe')
		expect(content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://3',
			transitions: {
				inTransition: {
					type: TSR.Transition.STING,
					maskFile: 'wipes/wipe',
					delay: WIPE_CUT_POINT_MS,
				},
			},
		})
		expect(content.transitions?.inTransition).not.toMatchObject({ delay: 38 })
	})

	it('keeps smoke headlines on Full (ch4) with MEDIA route://4', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-headlines')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())

		expect(generated.parts.map((part) => part.part.externalId)).toEqual(['part-hl-1', 'part-hl-2', 'part-hl-3'])
		expect(pgmRouteChannel(generated.parts[0].pieces)).toBe(4)
		expect(pgmRouteChannel(generated.parts[1].pieces)).toBe(4)
		expect(pgmRouteChannel(generated.parts[2].pieces)).toBe(4)
		expect(pgmRouteFile(generated.parts[0].pieces)).toBe('route://4')
		expect(pgmRouteFile(generated.parts[1].pieces)).toBe('route://4')
		expect(pgmRouteFile(generated.parts[2].pieces)).toBe('route://4')

		const hl2Timeline = generated.parts[1].pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_B_LAYERS.lowerThird)).toBe(true)
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_A_LAYERS.lowerThird)).toBe(false)
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_B_LAYERS.camera)).toBe(true)

		expect(generated.parts[1].part.inTransition?.previousPartKeepaliveDuration ?? 0).toBe(0)
		const hl2L3d = hl2Timeline.find(
			(obj) =>
				obj.layer === LOOK_B_LAYERS.lowerThird &&
				(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)
		expect(!Array.isArray(hl2L3d?.enable) && hl2L3d?.enable.start).toBe(L3D_OUT_MS)
		expect((hl2L3d?.content as TSR.TimelineContentCCGTemplate).useStopCommand).toBe(true)
		const l3dClear = generated.parts[1].pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		expect(l3dClear).toBeDefined()
		expect(l3dClear?.sourceLayerId).toBe(SourceLayer.PgmLayerClear)
		const l3dEmpty = l3dClear?.content.timelineObjects?.find(
			(obj) => (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(l3dEmpty?.layer).toBe(LOOK_B_LAYERS.lowerThird)
		expect(l3dEmpty?.enable).toEqual({ start: 0, duration: L3D_OUT_MS })
		// Look ILU CLEAR rides the same piece when the part has no bg_pocasie.
		expect(
			l3dClear?.content.timelineObjects?.some(
				(obj) => obj.layer === LOOK_B_LAYERS.ilu && (obj.content as { file?: string }).file === 'EMPTY'
			)
		).toBe(true)

		const liveCam = hl2Timeline.find((obj) => obj.layer === LOOK_B_LAYERS.camera)
		expect(liveCam?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
			noStarttime: true,
		})
		// Idle look must not open DeckLink — only route from ingest (or nothing).
		expect(
			hl2Timeline.some(
				(obj) =>
					obj.layer === LOOK_A_LAYERS.camera &&
					((obj.content as { file?: string }).file?.startsWith('dshow://') ||
						(obj.content as { inputType?: string }).inputType === 'decklink')
			)
		).toBe(false)
	})

	it('DoubleBox live CAM plays route://5 on look A (no DeckLink on look B)', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())
		const doubleBox = generated.parts.find((part) =>
			part.pieces.some((piece) =>
				(piece.content.timelineObjects ?? []).some((obj) => obj.layer === LOOK_A_LAYERS.doubleBoxLoop)
			)
		)
		expect(doubleBox).toBeDefined()
		if (!doubleBox) return

		const timeline = doubleBox.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		const liveCam = timeline.find((obj) => obj.layer === LOOK_A_LAYERS.camera)
		expect(liveCam?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
		})
		expect(
			timeline.some((obj) => obj.layer === LOOK_B_LAYERS.camera && (obj.content as { file?: string }).file === 'EMPTY')
		).toBe(false)
	})

	it('hard-cut VO (Full) emits PGM MEDIA route://4 with no STING', () => {
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
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://4',
		})
		expect((routeObj?.content as TSR.TimelineContentCCGMedia).transitions).toBeUndefined()
	})

	it('clears Full-look CAM (EMPTY) so SYN on 4-110 is not covered by baseline route://5', () => {
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
		expect(
			timeline.some((obj) => obj.layer === LOOK_B_LAYERS.camera && (obj.content as { file?: string }).file === 'EMPTY')
		).toBe(true)
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
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://4',
		})
	})

	it('wiped DoubleBox → PGM overlay + delayed route://3; wiped SYN (Full) → overlay + delayed route://4', () => {
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
		expect(pgmRouteFile(dbPart.pieces)).toBe('route://3')
		expect(pgmRouteFile(synPart.pieces)).toBe('route://4')

		const dbTimeline = dbPart.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		const synTimeline = synPart.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		expect(dbTimeline.some((obj) => obj.layer === LOOK_A_LAYERS.camera)).toBe(true)
		expect(dbTimeline.some((obj) => obj.layer === LOOK_A_LAYERS.lowerThird)).toBe(true)
		const dbCam = dbTimeline.find((obj) => obj.layer === LOOK_A_LAYERS.camera)
		expect(dbCam?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
		})
		expect(
			dbTimeline.some(
				(obj) =>
					obj.layer === LOOK_B_LAYERS.camera &&
					((obj.content as { file?: string }).file?.startsWith?.('dshow://') ||
						(obj.content as { inputType?: string }).inputType === 'decklink')
			)
		).toBe(false)

		const dbRoute = dbTimeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(dbRoute?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect(dbRoute?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://3',
		})
		expect((dbRoute?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
		expect(dbTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(true)

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
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://4',
		})
		expect((synRoute?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
		expect(synTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(true)
	})

	it('parseRouteMediaChannel reads full-channel MEDIA files', () => {
		expect(parseRouteMediaChannel('route://3')).toBe(3)
		expect(parseRouteMediaChannel('route://4')).toBe(4)
		expect(parseRouteMediaChannel('route://3-0')).toBe(3)
		expect(parseRouteMediaChannel('loops/bg_loop')).toBeUndefined()
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
		const tema3Db = tema3.parts.find((part) => part.part.externalId === 'part-tema-3-syn-2')
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
		expect(pgmRouteFile(result.pieces)).toBe('route://4')
		expect(result.pieces.some((piece) => piece.name.startsWith('Intro |'))).toBe(true)
	})

	it('SYN L3D CLEAR uses pgm_layer_clear so VO is not exclusive-group pruned', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())
		// Pinned smoke uses part-tema-1-syn-*; newer megarepo tip uses …-kolikova / …-taraba.
		const synWithL3d = generated.parts.find(
			(part) =>
				part.pieces.some((piece) => piece.sourceLayerId === (SourceLayer.VO as string)) &&
				part.pieces.some((piece) => piece.sourceLayerId === (SourceLayer.PgmLowerThird as string)) &&
				part.pieces.some((piece) => piece.externalId?.endsWith('_l3d_clear'))
		)
		expect(
			synWithL3d,
			`expected a tema-1 SYN with VO+L3D+CLEAR; got ${generated.parts.map((p) => p.part.externalId).join(',')}`
		).toBeDefined()
		if (!synWithL3d) return

		const vo = synWithL3d.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.VO as string))
		const l3dClear = synWithL3d.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const l3d = synWithL3d.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmLowerThird as string))
		expect(vo).toBeDefined()
		expect(l3d).toBeDefined()
		expect(l3dClear).toBeDefined()
		expect(l3dClear?.sourceLayerId).toBe(SourceLayer.PgmLayerClear)
		expect(l3dClear?.sourceLayerId).not.toBe(SourceLayer.GFX)
		expect(l3dClear?.sourceLayerId).not.toBe(SourceLayer.PgmLowerThird)
	})

	it('SJV / second ŠPORT keep VO beside L3D CLEAR on pgm_layer_clear', () => {
		const exportData = loadSmokeRundownExport()
		const lookSlots = createLookSlotSequence()
		for (const segmentId of ['seg-sjv', 'seg-sport'] as const) {
			const generated = generateParts(
				mockSegmentContext(),
				convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, segmentId)),
				undefined,
				lookSlots
			)
			// Skip open GFX wipe shells (part-sjv-open / part-sport-open) — no VO clip.
			const voParts = generated.parts.filter((part) =>
				part.pieces.some((piece) => piece.sourceLayerId === (SourceLayer.VO as string))
			)
			expect(voParts.length, `${segmentId} should have ≥2 SYN VOs`).toBeGreaterThanOrEqual(2)
			for (const part of voParts) {
				const l3dClear = part.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
				expect(l3dClear, `${part.part.externalId} L3D CLEAR`).toBeDefined()
				expect(l3dClear?.sourceLayerId).toBe(SourceLayer.PgmLayerClear)
				expect(l3dClear?.sourceLayerId).not.toBe(SourceLayer.GFX)
			}
		}
	})

	it('ZAVER + AVIZO compose on Full look B with cam; no db_loop; EMPTYs Full ILU so bg_pocasie dies', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-outro')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(
			mockSegmentContext(),
			intermediate,
			createCountupRevealClaim(),
			createLookSlotSequence()
		)
		const zaver = generated.parts.find((part) =>
			part.pieces.some((piece) =>
				(piece.content.timelineObjects ?? []).some(
					(obj) =>
						obj.layer === CasparCGLayers.CasparCGIluPlayer &&
						String((obj.content as { file?: string }).file || '').length > 0 &&
						(obj.content as { file?: string }).file !== 'EMPTY'
				)
			)
		)
		expect(zaver).toBeDefined()
		if (!zaver) return

		const zaverIngest = intermediate.parts.find((part) => part.payload.externalId === zaver.part.externalId)
		expect(zaverIngest).toBeDefined()
		if (!zaverIngest) return

		expect(isDoubleBoxLook(zaverIngest.rawType, zaverIngest.objects)).toBe(false)

		const timeline = zaver.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		// Full compose: PGM routes to ch4; look B cam keeps route://5 (never EMPTY / no live db_loop).
		const route = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(route?.content).toMatchObject({ file: 'route://4' })
		expect(pgmRouteChannel(zaver.pieces)).toBe(4)
		const liveDbLoop = (layer: CasparCGLayers) =>
			timeline.some(
				(obj) =>
					obj.layer === layer &&
					(obj.content as { type?: string; file?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA &&
					(obj.content as { file?: string }).file !== 'EMPTY' &&
					String((obj.content as { file?: string }).file || '').length > 0
			)
		expect(liveDbLoop(LOOK_A_LAYERS.doubleBoxLoop)).toBe(false)
		expect(liveDbLoop(LOOK_B_LAYERS.doubleBoxLoop)).toBe(false)
		const lookBCam = timeline.find((obj) => obj.layer === LOOK_B_LAYERS.camera)
		expect(lookBCam?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
		})
		expect(
			timeline.some((obj) => obj.layer === LOOK_B_LAYERS.camera && (obj.content as { file?: string }).file === 'EMPTY')
		).toBe(false)

		const clearPiece = zaver.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		expect(clearPiece?.sourceLayerId).toBe(SourceLayer.PgmLayerClear)
		const lookADbEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_A_LAYERS.doubleBoxLoop && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(lookADbEmpty, 'ZAVER must EMPTY look A db_loop (stray DoubleBox)').toBeDefined()
		const lookACamEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_A_LAYERS.camera && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(lookACamEmpty).toBeDefined()
		const iluEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.ilu && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(iluEmpty).toBeDefined()
		// Leave-weather: Full-look ILU EMPTY from Take through wipe end.
		expect(!Array.isArray(iluEmpty?.enable) && iluEmpty?.enable.start).toBe(0)
		const zaverIluClearMs =
			!Array.isArray(iluEmpty?.enable) && typeof iluEmpty?.enable.duration === 'number' ? iluEmpty.enable.duration : 0
		expect(zaverIluClearMs).toBeGreaterThan(0)
		expect(zaverIluClearMs).toBe(2500)
	})

	it('wiped L3D enable is Take-relative (wipe end); CLEAR EMPTY has no preroll', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const syn = ingest.parts.find((part) => {
			const payload = part.payload as { type?: string; pieces?: Array<{ objectType: string }> }
			return payload.type === 'VO' || (payload.pieces ?? []).some((piece) => piece.objectType.toLowerCase() === 'video')
		})
		expect(syn, 'tema-1 should have a SYN/VO part').toBeDefined()
		if (!syn) return
		const payload = syn.payload as {
			pieces: Array<{
				id: string
				objectType: string
				objectTime?: number
				duration?: number
				clipName?: string
				attributes: Record<string, unknown>
			}>
		}
		if (!payload.pieces.some((piece) => piece.objectType.toLowerCase() === 'wipe')) {
			payload.pieces.push({
				id: `${syn.externalId}-wipe`,
				objectType: 'wipe',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { fileName: 'wipes/wipe', transition: 'test' },
			})
		}
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === syn.externalId)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		expect(result.part.inTransition?.previousPartKeepaliveDuration).toBe(WIPE_CUT_POINT_MS)
		expect(result.part.autoNext).toBe(true)
		const l3d = result.pieces
			.flatMap((piece) => (piece.content.timelineObjects ?? []).map((obj) => ({ piece, obj })))
			.find(
				({ obj }) =>
					obj.layer === LOOK_B_LAYERS.lowerThird &&
					(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
			)
		expect(l3d).toBeDefined()
		if (!l3d) return
		// L3D templates must not inherit look preroll — Softie held ADD until Take+preroll+enable.
		// casparcgLatency (~50) on the piece is fine; look preroll (~1500) is not.
		expect(l3d.piece.prerollDuration ?? 0).toBeLessThan(DEFAULT_LOOK_PREROLL_MS)
		const wipeDurationMs = 2500
		// Earliest L3D on this Take (multi-name SYN parts have later timed L3Ds).
		const earliestObjectTimeMs = result.pieces
			.filter((piece) =>
				(piece.content.timelineObjects ?? []).some(
					(obj) =>
						obj.layer === LOOK_B_LAYERS.lowerThird &&
						(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
				)
			)
			.reduce((min, piece) => {
				const start = typeof piece.enable?.start === 'number' ? piece.enable.start : 0
				return Math.min(min, start)
			}, Number.POSITIVE_INFINITY)
		expect(earliestObjectTimeMs).toBeLessThan(Number.POSITIVE_INFINITY)
		const objectTimeMs = typeof l3d.piece.enable?.start === 'number' ? l3d.piece.enable.start : 0
		// start:0 → after wipe; start under sting → land at wipe end (object delay shrinks).
		const expectedObjStart =
			objectTimeMs === 0 ? wipeDurationMs : objectTimeMs < wipeDurationMs ? wipeDurationMs - objectTimeMs : 0
		expect(!Array.isArray(l3d.obj.enable) && l3d.obj.enable.start).toBe(expectedObjStart)

		const lookMedia = result.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find(
				(obj) =>
					obj.layer === LOOK_B_LAYERS.clip &&
					(obj.content as TSR.TimelineContentCCGMedia).type === TSR.TimelineContentTypeCasparCg.MEDIA &&
					(obj.content as TSR.TimelineContentCCGMedia).file !== 'EMPTY'
			)
		expect(!Array.isArray(lookMedia?.enable) && lookMedia?.enable.start).toBe(WIPE_CUT_POINT_MS)

		const clearPiece = result.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		expect(clearPiece?.prerollDuration ?? 0).toBe(0)
		const l3dEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.lowerThird && (obj.content as { file?: string }).file === 'EMPTY'
		)
		const clearUntil = Math.max(wipeDurationMs, earliestObjectTimeMs)
		expect(l3dEmpty?.enable).toEqual({ start: 0, duration: clearUntil })
	})

	it('non-weather Full parts pulse-clear ILU (finite) so keepalive cannot kill next bg_pocasie', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-sport')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())
		const sportVo = generated.parts.find((part) =>
			part.pieces.some((piece) => piece.sourceLayerId === (SourceLayer.VO as string))
		)
		expect(sportVo).toBeDefined()
		if (!sportVo) return

		const clearPiece = sportVo.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const iluEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.ilu && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(iluEmpty).toBeDefined()
		const sportIluClearMs =
			!Array.isArray(iluEmpty?.enable) && typeof iluEmpty?.enable.duration === 'number'
				? iluEmpty.enable.duration
				: Number.POSITIVE_INFINITY
		expect(sportIluClearMs).toBeLessThan(60_000)
	})

	it('first sport L3D CLEAR covers objectTime so previous CG cannot gap-fill before ADD', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-sport')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())
		const sportFirst = generated.parts.find((part) => part.pieces.some((piece) => piece.name === 'BG music C (Šport)'))
		expect(sportFirst).toBeDefined()
		if (!sportFirst) return

		expect(sportFirst.part.autoNext).toBe(true)
		expect(sportFirst.part.inTransition?.previousPartKeepaliveDuration).toBe(WIPE_CUT_POINT_MS)

		// Full→Full: do not EMPTY the live clip (black blink under wipe). Kill stray db_loop on ch3.
		const clearPiece = sportFirst.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const lookBClipEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.clip && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(lookBClipEmpty).toBeUndefined()
		const lookADbEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_A_LAYERS.doubleBoxLoop && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(lookADbEmpty, 'wiped Full must EMPTY look A db_loop').toBeDefined()

		const voPiece = sportFirst.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.VO as string))
		expect(voPiece).toBeDefined()
		// Hold last frame: no piece.enable.duration (loop:false alone is not enough).
		expect(voPiece?.enable).toEqual({ start: 0 })
		expect(
			(voPiece?.content.timelineObjects ?? []).some(
				(obj) => (obj.content as TSR.TimelineContentCCGMedia).loop === false
			)
		).toBe(true)

		const l3d = sportFirst.pieces
			.flatMap((piece) => (piece.content.timelineObjects ?? []).map((obj) => ({ piece, obj })))
			.find(
				({ obj }) =>
					obj.layer === LOOK_B_LAYERS.lowerThird &&
					(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
			)
		expect(l3d).toBeDefined()
		if (!l3d) return
		const objectTimeMs = typeof l3d.piece.enable?.start === 'number' ? l3d.piece.enable.start : 0
		expect(objectTimeMs).toBeGreaterThanOrEqual(1000)
		const wipeDurationMs = 2500
		// start:1s falls under sting → object delay lands ADD at wipe end (Take-relative).
		expect(!Array.isArray(l3d.obj.enable) && l3d.obj.enable.start).toBe(wipeDurationMs - objectTimeMs)

		const l3dEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.lowerThird && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(l3dEmpty?.enable).toEqual({ start: 0, duration: Math.max(wipeDurationMs, objectTimeMs) })

		const sportMusic = sportFirst.pieces.find((piece) => piece.name === 'BG music C (Šport)')
		expect(sportMusic).toBeDefined()
		expect(
			(sportMusic?.content.timelineObjects ?? []).every((obj) =>
				(obj.keyframes ?? []).some((kf) => (kf.content as { mixer?: { volume?: number } })?.mixer?.volume === 0)
			)
		).toBe(true)
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
		expect(dbRoute?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect((dbRoute?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
		expect(
			(db?.pieces ?? [])
				.flatMap((piece) => piece.content.timelineObjects ?? [])
				.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)
		).toBe(true)
		expect(db?.pieces.some((piece) => piece.externalId.endsWith('_led_bg_zoom'))).toBe(true)
		expect(syn?.pieces.some((piece) => piece.externalId.endsWith('_led_bg_zoom'))).toBe(true)

		const sjv = gen('seg-sjv')
		const sjvSyn = sjv.parts.find((part) => part.part.externalId === 'part-sjv-syn-1')
		expect(pgmRouteChannel(sjvSyn?.pieces ?? [])).toBe(4)
		const sjvTimeline = (sjvSyn?.pieces ?? []).flatMap((piece) => piece.content.timelineObjects ?? [])
		expect(sjvTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(true)
		const sjvRoute = sjvTimeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(sjvRoute?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect((sjvRoute?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
	})
})
