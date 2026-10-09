import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
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
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { StudioConfig } from '../base/studio/helpers/config.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { SourceType } from '../base/studio/helpers/config.js'
import { createCountupRevealClaim } from '../base/showstyle/helpers/countupReveal.js'
import {
	LOOK_A_LAYERS,
	LOOK_B_LAYERS,
	L3D_OUT_MS,
	LOOK_MEDIA_POSTROLL_MS,
	LOOK_HARD_CUT_POSTROLL_MS,
	LOOK_HARD_CUT_OVERLAP_MS,
	LOOK_HARD_CUT_INCOMING_DELAY_MS,
	LOOK_HARD_CUT_KEEPALIVE_MS,
	LOOK_HARD_CUT_CASPAR_LATENCY_MS,
	LOOK_HARD_CUT_ROUTE_HEADROOM_MS,
	LEAVE_WEATHER_WIPE_AIR_CUT_LAG_MS,
	LOOK_ILU_HARD_CUT_CLEAR_MS,
	DEFAULT_LOOK_PREROLL_MS,
	createFullChannelRouteContent,
	createLookSlotSequence,
	createPgmRouteTimelineObjects,
	createStingRouteTimelineObjects,
	finalizeHypercomposedPart,
	getLookCasparChannel,
	isDoubleBoxLook,
	lookSlotForKind,
	parseRouteMediaChannel,
	PGM_ROUTE_LAYERS,
	raiseLookMediaPostrollForCrossSegmentWipe,
	raiseLookMediaPostrollForNextKeepalive,
	resetLookSlotGenerationForTests,
	wipeStingDelayFrames,
	wipeUseStingRouteTransition,
	wipeUsesPgmOverlay,
	wipeUsesPgmSting,
} from '../base/showstyle/helpers/pgmLook.js'
import { resolveWipeAirCutMs, resolveWipeDurationMs, WIPE_CUT_POINT_MS } from '../base/showstyle/helpers/clips.js'
import { ObjectType } from '../common/definitions/objects.js'

import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'
import { findLivePgmRouteObj, routeSwitchStartMs } from './helpers/pgmRouteTestUtils.js'

const WIPE_AIR_CUT_MS = resolveWipeAirCutMs()
/** Themed story wipes share classical cover-centre bias (same Resolve cover window). */
const THEMED_WIPE_AIR_CUT_MS = resolveWipeAirCutMs({ cutPoint: WIPE_CUT_POINT_MS }, 2500, 'wipes/wipe_sjv')
/** Leave-weather look/WX-hide cut = air + lag + 2f overlap under cover. */
const LEAVE_WEATHER_HIDE_MS = WIPE_AIR_CUT_MS + LEAVE_WEATHER_WIPE_AIR_CUT_LAG_MS + LOOK_HARD_CUT_OVERLAP_MS

function pgmRouteChannel(
	pieces: ReadonlyArray<{
		content?: {
			timelineObjects?: ReadonlyArray<{ layer?: unknown; content?: unknown; keyframes?: unknown; enable?: unknown }>
		}
	}>
): number | undefined {
	const routeObj = findLivePgmRouteObj(pieces)
	const content = routeObj?.content as { channel?: number; file?: string } | undefined
	if (typeof content?.channel === 'number') return content.channel
	return parseRouteMediaChannel(content?.file)
}

function pgmRouteFile(
	pieces: ReadonlyArray<{
		content?: {
			timelineObjects?: ReadonlyArray<{ layer?: unknown; content?: unknown; keyframes?: unknown; enable?: unknown }>
		}
	}>
): string | undefined {
	const routeObj = findLivePgmRouteObj(pieces)
	return (routeObj?.content as { file?: string } | undefined)?.file
}

describe('pgmLook look-kind channels + route', () => {
	beforeEach(() => {
		resetLookSlotGenerationForTests()
	})

	it('maps preferred DoubleBox → A and Full → B (kind hint; Takes ping-pong idle)', () => {
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

	it('LookSlotSequence claimIdle ping-pongs; defaults peek to B', () => {
		const sequence = createLookSlotSequence()
		expect(sequence.peek()).toBe('B')
		expect(sequence.hasClaimed()).toBe(false)
		expect(sequence.claimIdle()).toBe('A')
		expect(sequence.hasClaimed()).toBe(true)
		expect(sequence.peek()).toBe('A')
		expect(sequence.claimIdle()).toBe('B')
		expect(sequence.peek()).toBe('B')
		expect(sequence.claim('A')).toBe('A')
		expect(sequence.peek()).toBe('A')
	})

	it('resolveLookSlotForPart claims idle; skips claim when floated or skipped', () => {
		const sequence = createLookSlotSequence()
		expect(resolveLookSlotForPart(PartType.Camera, [], sequence, 'DoubleBox')).toBe('A')
		expect(sequence.peek()).toBe('A')
		// Floated Full must not overwrite A — later Take still peeks A then claims idle B.
		expect(resolveLookSlotForPart(PartType.Camera, [], sequence, 'Cam', true)).toBe('A')
		expect(sequence.peek()).toBe('A')
		expect(resolveLookSlotForPart(PartType.Camera, [], sequence, 'DoubleBox')).toBe('B')
		expect(sequence.peek()).toBe('B')
	})

	it('maps look A to BG 3 and look B to BG 4', () => {
		expect(getLookCasparChannel(hybridCasparConfig, 'A')).toBe(3)
		expect(getLookCasparChannel(hybridCasparConfig, 'B')).toBe(4)
	})

	it('converts wipe cut-point ms to frames at 50fps (docs helper; casparcg-state wants ms)', () => {
		expect(wipeStingDelayFrames(WIPE_CUT_POINT_MS)).toBe(19)
		// Postroll reserves a full default sting so the *next* wipe's editorial cutPoint can hold.
		expect(LOOK_MEDIA_POSTROLL_MS).toBe(2500)
		expect(WIPE_CUT_POINT_MS).toBe(380)
	})

	it('raises previous look postroll when the next on-air wipe cutPoint exceeds 2500 ms', () => {
		const lookClipPiece = {
			postrollDuration: LOOK_MEDIA_POSTROLL_MS,
			content: {
				timelineObjects: [
					{
						layer: LOOK_B_LAYERS.clip,
						content: {
							type: TSR.TimelineContentTypeCasparCg.MEDIA,
							file: 'clips/syn.mp4',
						},
					},
				],
			},
		}
		const parts = [
			{
				part: { externalId: 'hard-cut', title: 'Hard cut' },
				pieces: [lookClipPiece as never],
			},
			{
				part: {
					externalId: 'wiped',
					title: 'Wiped',
					inTransition: {
						previousPartKeepaliveDuration: 3000,
						blockTakeDuration: 4000,
						partContentDelayDuration: 0,
					},
				},
				pieces: [],
			},
		]
		raiseLookMediaPostrollForNextKeepalive(parts)
		expect(lookClipPiece.postrollDuration).toBeGreaterThanOrEqual(3000)
	})

	it('raises last on-air part postroll for cross-segment wipe keepalive', () => {
		const lookClipPiece = {
			postrollDuration: LOOK_HARD_CUT_POSTROLL_MS,
			content: {
				timelineObjects: [
					{
						layer: LOOK_B_LAYERS.clip,
						content: {
							type: TSR.TimelineContentTypeCasparCg.MEDIA,
							file: 'clips/syn.mp4',
						},
					},
				],
			},
		}
		const parts = [
			{
				part: { externalId: 'seg-end', title: 'Last hard-cut' },
				pieces: [lookClipPiece as never],
			},
		]
		raiseLookMediaPostrollForCrossSegmentWipe(parts)
		expect(lookClipPiece.postrollDuration).toBeGreaterThanOrEqual(LOOK_MEDIA_POSTROLL_MS)
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
					delay: WIPE_AIR_CUT_MS,
				},
			},
		})
		expect(content.transitions?.inTransition).not.toMatchObject({ delay: 38 })
	})

	function stingTrialConfig(): StudioConfig {
		// Cloning hypercomposed via spread widens required fields to `| undefined`, so
		// re-declare them explicitly from the fixture via a locally-typed reference.
		const hyper = hybridCasparConfig.casparcg.hypercomposed as NonNullable<StudioConfig['casparcg']['hypercomposed']>
		return {
			...hybridCasparConfig,
			casparcg: {
				...hybridCasparConfig.casparcg,
				hypercomposed: {
					...hyper,
					wipeUseStingRouteTransition: true,
				},
			},
		}
	}

	it('wipeUseStingRouteTransition reflects the trial config flag (off by default)', () => {
		expect(wipeUseStingRouteTransition(hybridCasparConfig)).toBe(false)
		expect(wipeUseStingRouteTransition(stingTrialConfig())).toBe(true)
	})

	it('STING-route trial emits a single canonical-layer route re-PLAYed with a STING inTransition', () => {
		const on = stingTrialConfig()
		// Slot A → bgChannelA (3); single canonical route layer + STING delay = air cut.
		const objs = createStingRouteTimelineObjects(on, 'A', { routeStartMs: WIPE_AIR_CUT_MS, stingFile: 'wipes/wipe' })

		expect(objs).toHaveLength(1)
		const route = objs[0]
		expect(route.layer).toBe(PGM_ROUTE_LAYERS.B)
		expect(route.enable).toEqual({ start: 0 })
		expect(route.keyframes).toBeUndefined() // re-PLAY path carries no mixer-opacity keyframe swap
		const content = route.content as TSR.TimelineContentCCGMedia
		expect(content.file).toBe('route://3')
		expect(content.transitions?.inTransition).toMatchObject({
			type: TSR.Transition.STING,
			maskFile: 'wipes/wipe',
			overlayFile: 'wipes/wipe',
			delay: WIPE_AIR_CUT_MS,
		})
		// casparcg-state maps delay (ms) → STING frames; never the stale 38-frame value.
		expect(content.transitions?.inTransition).not.toMatchObject({ delay: 38 })
	})

	it('STING-route trial hard-cut re-PLAYs start at the keepalive cut (no STING hold)', () => {
		// Cross-slot hard cut under the trial flag: no stingFile, nonzero routeStartMs.
		// Without a STING transition there is nothing to hold the cover, so the plain
		// re-PLAY must switch at routeStartMs (keepalive cut), not at Take (0).
		const on = stingTrialConfig()
		const objs = createStingRouteTimelineObjects(on, 'A', {
			routeStartMs: LOOK_HARD_CUT_KEEPALIVE_MS,
		})
		expect(objs).toHaveLength(1)
		const route = objs[0]
		expect(route.enable).toEqual({ start: LOOK_HARD_CUT_KEEPALIVE_MS })
		expect((route.content as TSR.TimelineContentCCGMedia).transitions).toBeUndefined()
	})

	it('STING-route trial is scoped to the classical wipes/wipe only', () => {
		const on = stingTrialConfig()
		const off = hybridCasparConfig
		// Under the flag only the stringer uses STING; themed wipes / hard cuts stay overlay.
		expect(wipeUsesPgmSting(on, 'wipes/wipe')).toBe(true)
		expect(wipeUsesPgmSting(on, 'wipes/wipe_sjv')).toBe(false)
		expect(wipeUsesPgmSting(on, 'wipes/wipe_sport')).toBe(false)
		expect(wipeUsesPgmSting(on, 'wipes/wipe_pocasie')).toBe(false)
		expect(wipeUsesPgmSting(on, undefined)).toBe(false) // hard cut
		// Flag off: never STING, always overlay.
		expect(wipeUsesPgmSting(off, 'wipes/wipe')).toBe(false)
		expect(wipeUsesPgmOverlay(off, 'wipes/wipe')).toBe(true)
		// Overlay is the complement: themed + hard cuts overlay even under the flag.
		expect(wipeUsesPgmOverlay(on, 'wipes/wipe')).toBe(false)
		expect(wipeUsesPgmOverlay(on, 'wipes/wipe_sjv')).toBe(true)
		expect(wipeUsesPgmOverlay(on, 'wipes/wipe_pocasie')).toBe(true)
		expect(wipeUsesPgmOverlay(on, undefined)).toBe(true)
	})

	it('STING-route trial: themed wipes fall back to the dual-route default (not STING)', () => {
		const on = stingTrialConfig()
		const objs = createPgmRouteTimelineObjects(on, 'A', {
			routeStartMs: THEMED_WIPE_AIR_CUT_MS,
			wipeFile: 'wipes/wipe_sjv',
		})
		// Themed wipe → default dual-route path: two layers, mixer-opacity keyframes.
		expect(objs).toHaveLength(2)
		for (const obj of objs) {
			expect((obj.content as TSR.TimelineContentCCGMedia).transitions).toBeUndefined()
		}
	})

	it('STING-route trial: classical wipes/wipe dispatch to the STING single-layer route', () => {
		const on = stingTrialConfig()
		const objs = createPgmRouteTimelineObjects(on, 'A', {
			routeStartMs: WIPE_AIR_CUT_MS,
			wipeFile: 'wipes/wipe',
			stingFile: 'wipes/wipe',
		})
		// Classical stringer → single canonical-layer STING route (dual-route is bypassed).
		expect(objs).toHaveLength(1)
		expect(objs[0].layer).toBe(PGM_ROUTE_LAYERS.B)
		const content = objs[0].content as TSR.TimelineContentCCGMedia
		expect(content.transitions?.inTransition).toMatchObject({
			type: TSR.Transition.STING,
			maskFile: 'wipes/wipe',
			overlayFile: 'wipes/wipe',
		})
	})

	it('ping-pongs smoke headlines across idle look channels (3→4→3)', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-headlines')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), intermediate, undefined, createLookSlotSequence())

		expect(generated.parts.map((part) => part.part.externalId)).toEqual(['part-hl-1', 'part-hl-2', 'part-hl-3'])
		// Baseline peek B → first idle A (ch3); then B (ch4); then A (ch3).
		expect(pgmRouteChannel(generated.parts[0].pieces)).toBe(3)
		expect(pgmRouteChannel(generated.parts[1].pieces)).toBe(4)
		expect(pgmRouteChannel(generated.parts[2].pieces)).toBe(3)
		expect(pgmRouteFile(generated.parts[0].pieces)).toBe('route://3')
		expect(pgmRouteFile(generated.parts[1].pieces)).toBe('route://4')
		expect(pgmRouteFile(generated.parts[2].pieces)).toBe('route://3')

		const hl2Timeline = generated.parts[1].pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_B_LAYERS.lowerThird)).toBe(true)
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_A_LAYERS.lowerThird)).toBe(false)
		expect(hl2Timeline.some((obj) => obj.layer === LOOK_B_LAYERS.camera)).toBe(true)

		expect(generated.parts[1].part.inTransition?.previousPartKeepaliveDuration ?? 0).toBe(LOOK_HARD_CUT_KEEPALIVE_MS)
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
		const routeObj = findLivePgmRouteObj(result.pieces)

		expect(routePiece).toBeDefined()
		expect(routeObj?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://4',
		})
		expect((routeObj?.content as TSR.TimelineContentCCGMedia).transitions).toBeUndefined()
		expect(routePiece?.postrollDuration).toBe(LOOK_HARD_CUT_POSTROLL_MS)
	})

	it('same-slot hard-cut keepalive covers Caspar cold-PLAY latency (no bg_loop seam)', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.type === PartType.VO)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		// Previous look was also Full (B) — SYN→SYN style same-slot hard cut.
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B', 'B')
		expect(result.part.inTransition?.previousPartKeepaliveDuration).toBe(LOOK_HARD_CUT_KEEPALIVE_MS)

		const lookClip = result.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find(
				(obj) =>
					obj.layer === LOOK_B_LAYERS.clip &&
					(obj.content as { type?: string; file?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA &&
					(obj.content as { file?: string }).file !== 'EMPTY'
			)
		expect(lookClip).toBeDefined()
		expect(!Array.isArray(lookClip?.enable) && lookClip?.enable.start).toBe(LOOK_HARD_CUT_INCOMING_DELAY_MS)
		expect(LOOK_HARD_CUT_KEEPALIVE_MS).toBeGreaterThan(LOOK_HARD_CUT_INCOMING_DELAY_MS)
		expect(LOOK_HARD_CUT_KEEPALIVE_MS).toBe(
			LOOK_HARD_CUT_INCOMING_DELAY_MS + LOOK_HARD_CUT_CASPAR_LATENCY_MS + LOOK_HARD_CUT_ROUTE_HEADROOM_MS
		)
		expect(LOOK_HARD_CUT_POSTROLL_MS).toBeGreaterThanOrEqual(LOOK_HARD_CUT_KEEPALIVE_MS)
		expect(LOOK_HARD_CUT_POSTROLL_MS).toBe(LOOK_ILU_HARD_CUT_CLEAR_MS + LOOK_HARD_CUT_KEEPALIVE_MS)
		expect(LOOK_HARD_CUT_OVERLAP_MS).toBe(LOOK_HARD_CUT_INCOMING_DELAY_MS)
	})

	it('hard-cut Full→DoubleBox cross-slot LOADBGs idle look CAM/ILU from Take', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const dbIngest = ingest.parts.find((part) => part.externalId === 'part-tema-1-db')
		expect(dbIngest).toBeDefined()
		if (!dbIngest) return
		const payload = dbIngest.payload as { pieces: Array<{ objectType: string }> }
		payload.pieces = payload.pieces.filter((piece) => piece.objectType.toLowerCase() !== 'wipe')

		const segment = convertIngestData(mockIngestContext, ingest)
		const dbPart = segment.parts.find((part) => part.payload.externalId === 'part-tema-1-db')
		expect(dbPart).toBeDefined()
		if (!dbPart) return

		const partContext = new PartContext(mockSegmentContext(), dbPart.payload.externalId)
		const result = generateCameraPart(
			partContext,
			dbPart as PartProps<CameraProps>,
			createCountupRevealClaim(),
			'A',
			'B'
		)
		expect(result.part.inTransition?.previousPartKeepaliveDuration).toBe(LOOK_HARD_CUT_KEEPALIVE_MS)
		const camPiece = result.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.Camera as string))
		// No look preroll on hard cuts — Sofie toPartDelay would hold Camera/ILU past
		// keepalive (~1.5s black / bg_loop hole). Idle LOADBG is Take-relative.
		expect(camPiece?.prerollDuration ?? 0).toBeLessThan(DEFAULT_LOOK_PREROLL_MS)
		const iluObj = result.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find((obj) => obj.layer === LOOK_A_LAYERS.ilu && (obj.content as { file?: string }).file !== 'EMPTY')
		expect(iluObj).toBeDefined()
		const iluHost = result.pieces.find((piece) => (piece.content.timelineObjects ?? []).some((obj) => obj === iluObj))
		expect(iluHost?.prerollDuration ?? 0).toBeLessThan(DEFAULT_LOOK_PREROLL_MS)
		// Idle look: LOAD from Take (enable 0), hot PLAY before route:// flips.
		expect(!Array.isArray(iluObj?.enable) && iluObj?.enable.start).toBe(0)
		expect((iluObj?.content as TSR.TimelineContentCCGMedia).playing).toBe(false)
		expect(
			(iluObj?.keyframes ?? []).some(
				(kf) =>
					!Array.isArray(kf.enable) &&
					kf.enable?.start === LOOK_HARD_CUT_INCOMING_DELAY_MS &&
					(kf.content as { playing?: boolean } | undefined)?.playing === true
			)
		).toBe(true)
		const route = findLivePgmRouteObj(result.pieces)
		// Dual-route opacity swap waits for keepalive so idle LOADBG→PLAY has Caspar latency headroom.
		expect(routeSwitchStartMs(route ?? {})).toBe(LOOK_HARD_CUT_KEEPALIVE_MS)
		expect(LOOK_HARD_CUT_KEEPALIVE_MS).toBeGreaterThan(LOOK_HARD_CUT_INCOMING_DELAY_MS)
		expect(
			result.pieces
				.flatMap((piece) => piece.content.timelineObjects ?? [])
				.filter((obj) => obj.layer === LOOK_A_LAYERS.doubleBoxLoop)
				.every((obj) => !Array.isArray(obj.enable) && (obj.enable?.start ?? 0) === 0)
		).toBe(true)
	})

	it('hard-cut DoubleBox→Full VO LOADBGs SYN so baseline bg_loop cannot flash on route://4', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.type === PartType.VO)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B', 'A')
		expect(result.part.inTransition?.previousPartKeepaliveDuration).toBe(LOOK_HARD_CUT_KEEPALIVE_MS)

		const lookClip = result.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find(
				(obj) =>
					obj.layer === LOOK_B_LAYERS.clip &&
					(obj.content as { type?: string; file?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA &&
					(obj.content as { file?: string }).file !== 'EMPTY'
			)
		expect(lookClip).toBeDefined()
		expect(!Array.isArray(lookClip?.enable) && lookClip?.enable.start).toBe(0)
		expect((lookClip?.content as TSR.TimelineContentCCGMedia).playing).toBe(false)
		expect(
			(lookClip?.keyframes ?? []).some(
				(kf) =>
					!Array.isArray(kf.enable) &&
					kf.enable?.start === LOOK_HARD_CUT_INCOMING_DELAY_MS &&
					(kf.content as { playing?: boolean } | undefined)?.playing === true
			)
		).toBe(true)
		const route = findLivePgmRouteObj(result.pieces)
		expect(routeSwitchStartMs(route ?? {})).toBe(LOOK_HARD_CUT_KEEPALIVE_MS)
	})

	it('clears Full-look CAM (EMPTY) so SYN on 4-111 is not covered by baseline route://5', () => {
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

		const routeObj = findLivePgmRouteObj(result.pieces)
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

		const dbRoute = findLivePgmRouteObj([{ content: { timelineObjects: dbTimeline } }])
		expect(routeSwitchStartMs(dbRoute ?? {})).toBe(WIPE_AIR_CUT_MS)
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

		const synRoute = findLivePgmRouteObj([{ content: { timelineObjects: synTimeline } }])
		expect(routeSwitchStartMs(synRoute ?? {})).toBe(WIPE_AIR_CUT_MS)
		expect(synRoute?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://4',
		})
		expect((synRoute?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
		expect(synTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(true)

		// DB→Full: ch3 still on PGM until the route cut — hold db_loop until then.
		const synClear = synPart.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const dbLoopEmpty = synClear?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_A_LAYERS.doubleBoxLoop && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(dbLoopEmpty?.enable).toEqual({ start: WIPE_AIR_CUT_MS })
	})

	it('parseRouteMediaChannel reads full-channel MEDIA files', () => {
		expect(parseRouteMediaChannel('route://3')).toBe(3)
		expect(parseRouteMediaChannel('route://4')).toBe(4)
		expect(parseRouteMediaChannel('route://3-0')).toBe(3)
		expect(parseRouteMediaChannel('loops/bg_loop')).toBeUndefined()
	})

	it('ping-pongs look channels across segments (idle LOADBG every Take)', () => {
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

		const chSyn = pgmRouteChannel(tema3Syn.pieces)
		const chDb = pgmRouteChannel(tema3Db.pieces)
		const chTema4 = pgmRouteChannel(tema4Db.pieces)
		expect(chSyn).toBeDefined()
		expect(chDb).toBeDefined()
		expect(chTema4).toBeDefined()
		// Consecutive look-bearing Takes always flip physical channel.
		expect(chSyn).not.toBe(chDb)
		expect(chDb).not.toBe(chTema4)
		expect([3, 4]).toContain(chSyn)
		expect([3, 4]).toContain(chDb)
		expect([3, 4]).toContain(chTema4)
	})

	it('fullscreen Camera / Remote peeks idle look; next Cam claims opposite', () => {
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
		// Baseline peek B → cam-1 idle A (ch3); Remote peeks A; cam-2 claims idle B (ch4).
		expect(pgmRouteChannel(generated.parts[0].pieces)).toBe(3)
		expect(pgmRouteChannel(generated.parts[1].pieces)).toBe(3)
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

	it('ZAVER + AVIZO compose Full kind on idle look; no db_loop; EMPTYs look ILU so bg_pocasie dies', () => {
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
		// Fresh sequence: first look-bearing claims idle A → route://3. Full FILL + cam.
		const routeChannel = pgmRouteChannel(zaver.pieces)
		expect(routeChannel).toBe(3)
		expect(pgmRouteFile(zaver.pieces)).toBe('route://3')
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
		const lookACam = timeline.find((obj) => obj.layer === LOOK_A_LAYERS.camera)
		expect(lookACam?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
		})
		expect(
			timeline.some((obj) => obj.layer === LOOK_A_LAYERS.camera && (obj.content as { file?: string }).file === 'EMPTY')
		).toBe(false)

		const clearPiece = zaver.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		expect(clearPiece?.sourceLayerId).toBe(SourceLayer.PgmLayerClear)
		// Other slot (B) db_loop cleared — stray DoubleBox cannot survive into závěr.
		const lookBDbEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.doubleBoxLoop && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(lookBDbEmpty, 'ZAVER must EMPTY other-slot db_loop (stray DoubleBox)').toBeDefined()
		expect(lookBDbEmpty?.enable).toEqual({ start: 0 })
		const lookBCamEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.camera && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(lookBCamEmpty).toBeDefined()
		const iluEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_A_LAYERS.ilu && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(iluEmpty).toBeDefined()
		const leaveWeatherHideMs = LEAVE_WEATHER_HIDE_MS
		expect(!Array.isArray(iluEmpty?.enable) && iluEmpty?.enable.start).toBe(leaveWeatherHideMs)
		expect(!Array.isArray(iluEmpty?.enable) && iluEmpty?.enable.duration).toBeUndefined()
		const l3dEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_A_LAYERS.lowerThird && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(!Array.isArray(l3dEmpty?.enable) && l3dEmpty?.enable.start).toBe(leaveWeatherHideMs)
		const ledZaver = timeline.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGIluPlayer &&
				(obj.content as { file?: string }).file !== 'EMPTY' &&
				String((obj.content as { file?: string }).file || '').length > 0
		)
		expect(!Array.isArray(ledZaver?.enable) && ledZaver?.enable.start).toBe(leaveWeatherHideMs)
		const wipeOverlay = timeline.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer &&
				String((obj.content as { file?: string }).file || '').includes('wipe')
		)
		expect(!Array.isArray(wipeOverlay?.enable) && wipeOverlay?.enable.start).toBe(0)
	})

	it('ad-lib-only gfx/ilu-zaver does not delay other LED ILU on wiped Takes', () => {
		const context = mockSegmentContext()
		const part = { externalId: 'gfx-wiped', title: 'GFX wipe shell' }
		const headlineIlu = {
			enable: { start: 0 },
			externalId: 'headline-ilu',
			name: 'gfx/l3d-headline | Tarabovo',
			lifespan: PieceLifespan.WithinPart,
			sourceLayerId: SourceLayer.IluMedia,
			outputLayerId: 'pgm',
			content: {
				fileName: 'clips/HEADLINE1.mov',
				timelineObjects: [
					{
						id: '',
						enable: { start: 0 },
						layer: CasparCGLayers.CasparCGIluPlayer,
						content: {
							deviceType: TSR.DeviceType.CASPARCG,
							type: TSR.TimelineContentTypeCasparCg.MEDIA,
							file: 'clips/HEADLINE1.mov',
						},
					},
				],
			},
		}
		const objects = [
			{
				id: 'wipe',
				objectType: ObjectType.Video,
				clipName: 'wipes/wipe',
				objectTime: 0,
				duration: 2500,
				attributes: { fileName: 'wipes/wipe.mov', playLayer: 'wipe', cutPoint: 380 },
			},
			{
				id: 'zaver-adlib',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/ilu-zaver',
				objectTime: 0,
				duration: 0,
				isAdlib: true,
				attributes: { iluFile: 'clips/ILU AVIZO.mp4' },
			},
		]
		const pieces = [headlineIlu] as never as Parameters<typeof finalizeHypercomposedPart>[5]
		finalizeHypercomposedPart(context, hybridCasparConfig, part as never, 'gfx-wiped', objects as never, pieces, 'B')
		const led = pieces[0].content.timelineObjects?.[0]
		// Headline ILU stays at Take — ad-lib zaver must not trigger LED delay.
		expect(!Array.isArray(led?.enable) && led?.enable.start).toBe(0)
	})

	it('active gfx/ilu-zaver LED MEDIA delays to wipe air cut', () => {
		const context = mockSegmentContext()
		const part = { externalId: 'zaver-wiped', title: 'ZAVER' }
		const zaverIlu = {
			enable: { start: 0 },
			externalId: 'zaver-ilu',
			// Leading space mirrors parseGraphic keeping raw clipName while isIluZaver trims.
			name: ' gfx/ilu-zaver | ILU AVIZO',
			lifespan: PieceLifespan.OutOnRundownEnd,
			sourceLayerId: SourceLayer.LowerThird,
			outputLayerId: 'pgm',
			content: {
				fileName: 'clips/ILU AVIZO.mp4',
				timelineObjects: [
					{
						id: '',
						enable: { start: 0 },
						layer: CasparCGLayers.CasparCGIluPlayer,
						content: {
							deviceType: TSR.DeviceType.CASPARCG,
							type: TSR.TimelineContentTypeCasparCg.MEDIA,
							file: 'clips/ILU AVIZO.mp4',
						},
					},
				],
			},
		}
		const objects = [
			{
				id: 'wipe',
				objectType: ObjectType.Video,
				clipName: 'wipes/wipe',
				objectTime: 0,
				duration: 2500,
				attributes: { fileName: 'wipes/wipe.mov', playLayer: 'wipe', cutPoint: 380 },
			},
			{
				id: 'zaver',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/ilu-zaver',
				objectTime: 0,
				duration: 19000,
				isAdlib: false,
				attributes: { iluFile: 'clips/ILU AVIZO.mp4' },
			},
		]
		const pieces = [zaverIlu] as never as Parameters<typeof finalizeHypercomposedPart>[5]
		finalizeHypercomposedPart(context, hybridCasparConfig, part as never, 'zaver-wiped', objects as never, pieces, 'B')
		const led = pieces[0].content.timelineObjects?.[0]
		expect(!Array.isArray(led?.enable) && led?.enable.start).toBe(LEAVE_WEATHER_HIDE_MS)
	})

	it('wiped ZAVER after DoubleBox holds other-slot clears + route until cover (no early clear)', () => {
		const exportData = loadSmokeRundownExport()
		const ingest = smokeExportToIngestSegment(exportData, 'seg-outro')
		const intermediate = convertIngestData(mockIngestContext, ingest)
		// Previous look was DoubleBox (ch3 on PGM) — claim A before generating ZAVER.
		const lookSlots = createLookSlotSequence()
		lookSlots.claim('A')
		const generated = generateParts(mockSegmentContext(), intermediate, createCountupRevealClaim(), lookSlots)
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
		expect(zaver.part.inTransition?.previousPartKeepaliveDuration).toBe(LEAVE_WEATHER_HIDE_MS)

		// Leave-weather ZAVER holds the outgoing (other-slot) picture under solid cover:
		// the PGM route switch and the other-slot clears both land at LEAVE_WEATHER_HIDE_MS,
		// not the bare air cut — otherwise the outgoing frame is cut a frame before the
		// wipe fully covers.
		const routeFlip = (findLivePgmRouteObj(zaver.pieces)?.keyframes?.[0]?.enable as { start?: number } | undefined)
			?.start
		expect(routeFlip).toBe(LEAVE_WEATHER_HIDE_MS)

		const clearPiece = zaver.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const otherSlotLayers = [
			LOOK_A_LAYERS.doubleBoxLoop,
			LOOK_A_LAYERS.camera,
			LOOK_A_LAYERS.ilu,
			LOOK_A_LAYERS.lowerThird,
		]
		for (const layer of otherSlotLayers) {
			const empties = (clearPiece?.content.timelineObjects ?? []).filter(
				(obj) => obj.layer === layer && (obj.content as { file?: string }).file === 'EMPTY'
			)
			expect(empties.length, `${layer} EMPTY`).toBeGreaterThanOrEqual(1)
			for (const obj of empties) {
				const enable = obj.enable
				expect(Array.isArray(enable)).toBe(false)
				if (Array.isArray(enable) || !enable) continue
				expect(typeof enable.start).toBe('number')
				expect(enable.start, `no ${layer} EMPTY before cover cut`).toBeGreaterThanOrEqual(WIPE_AIR_CUT_MS)
			}
			// Held under solid cover with the route — none may still clear at the bare air cut.
			expect(empties.some((obj) => !Array.isArray(obj.enable) && obj.enable?.start === WIPE_AIR_CUT_MS)).toBe(false)
			expect(
				empties.length > 0 &&
					empties.every((obj) => !Array.isArray(obj.enable) && obj.enable?.start === LEAVE_WEATHER_HIDE_MS)
			).toBe(true)
		}
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
		expect(result.part.inTransition?.previousPartKeepaliveDuration).toBe(WIPE_AIR_CUT_MS)
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
		// L3D templates must not inherit look preroll — Sofie held ADD until Take+preroll+enable.
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
		expect(lookMedia).toBeDefined()
		// No previousLookSlot → idle Full channel: LOAD from Take, hot PLAY at air cut.
		expect(!Array.isArray(lookMedia?.enable) && lookMedia?.enable.start).toBe(0)
		expect((lookMedia?.content as TSR.TimelineContentCCGMedia).playing).toBe(false)
		expect(
			(lookMedia?.keyframes ?? []).some(
				(kf) =>
					!Array.isArray(kf.enable) &&
					kf.enable?.start === WIPE_AIR_CUT_MS &&
					(kf.content as { playing?: boolean } | undefined)?.playing === true
			)
		).toBe(true)

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
			(obj) =>
				(obj.layer === LOOK_A_LAYERS.ilu || obj.layer === LOOK_B_LAYERS.ilu) &&
				(obj.content as { file?: string }).file === 'EMPTY'
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
		// Ping-pong idle channel: keepalive at full air cut (not same-slot lead).
		expect(sportFirst.part.inTransition?.previousPartKeepaliveDuration).toBe(THEMED_WIPE_AIR_CUT_MS)

		// Full wipe: do not EMPTY the live clip (black blink under wipe). Kill stray db_loop on other slot.
		const clearPiece = sportFirst.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const lookClipEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) =>
				(obj.layer === LOOK_A_LAYERS.clip || obj.layer === LOOK_B_LAYERS.clip) &&
				(obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(lookClipEmpty).toBeUndefined()
		const otherDbEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) =>
				(obj.layer === LOOK_A_LAYERS.doubleBoxLoop || obj.layer === LOOK_B_LAYERS.doubleBoxLoop) &&
				(obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(otherDbEmpty, 'wiped Full must EMPTY other-slot db_loop').toBeDefined()
		expect(otherDbEmpty?.enable).toEqual({ start: 0 })

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
					(obj.layer === LOOK_A_LAYERS.lowerThird || obj.layer === LOOK_B_LAYERS.lowerThird) &&
					(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
			)
		expect(l3d).toBeDefined()
		if (!l3d) return
		const objectTimeMs = typeof l3d.piece.enable?.start === 'number' ? l3d.piece.enable.start : 0
		expect(objectTimeMs).toBeGreaterThanOrEqual(1000)
		const wipeDurationMs = resolveWipeDurationMs(2500, 'wipes/wipe_sport')
		// start:1s falls under sting → object delay lands ADD at wipe end (Take-relative).
		expect(!Array.isArray(l3d.obj.enable) && l3d.obj.enable.start).toBe(wipeDurationMs - objectTimeMs)

		const l3dEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) =>
				(obj.layer === LOOK_A_LAYERS.lowerThird || obj.layer === LOOK_B_LAYERS.lowerThird) &&
				(obj.content as { file?: string }).file === 'EMPTY'
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

	it('smoke CSV contract: look ping-pong, tema wipe overlay, SJV themed EffectsPlayer', () => {
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
		const hlChannels = headlines.parts.map((part) => pgmRouteChannel(part.pieces))
		expect(hlChannels).toEqual([3, 4, 3])
		for (const part of headlines.parts) {
			expect(part.pieces.some((piece) => piece.externalId.endsWith('_full_bg_loop'))).toBe(true)
		}

		const introSeg = gen('seg-intro')
		const intro = introSeg.parts.find((part) => part.part.externalId === 'part-intro')
		const privitanie = introSeg.parts.find((part) => part.part.externalId === 'part-intro-mod')
		// After headlines ended on A: Intro claims idle B; Privítanie claims idle A.
		expect(pgmRouteChannel(intro?.pieces ?? [])).toBe(4)
		expect(pgmRouteChannel(privitanie?.pieces ?? [])).toBe(3)
		expect(privitanie?.pieces.some((piece) => piece.externalId.endsWith('_full_bg_loop'))).toBe(true)

		const tema1 = gen('seg-tema-1')
		const db = tema1.parts.find((part) => part.part.externalId === 'part-tema-1-db')
		const syn = tema1.parts.find((part) => part.part.externalId === 'part-tema-1-syn-1')
		const dbCh = pgmRouteChannel(db?.pieces ?? [])
		const synCh = pgmRouteChannel(syn?.pieces ?? [])
		expect(dbCh).toBeDefined()
		expect(synCh).toBeDefined()
		expect(dbCh).not.toBe(synCh)
		const dbRoute = findLivePgmRouteObj(db?.pieces ?? [])
		expect(routeSwitchStartMs(dbRoute ?? {})).toBe(WIPE_AIR_CUT_MS)
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
		expect([3, 4]).toContain(pgmRouteChannel(sjvSyn?.pieces ?? []))
		const sjvTimeline = (sjvSyn?.pieces ?? []).flatMap((piece) => piece.content.timelineObjects ?? [])
		expect(sjvTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayerSjv)).toBe(true)
		expect(sjvTimeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(false)
		const sjvRoute = findLivePgmRouteObj(sjvSyn?.pieces ?? [])
		expect(routeSwitchStartMs(sjvRoute ?? {})).toBe(THEMED_WIPE_AIR_CUT_MS)
		expect((sjvRoute?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
	})
})
