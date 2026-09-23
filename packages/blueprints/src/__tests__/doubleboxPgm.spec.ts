import { IBlueprintPieceType, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { PartType, CameraProps, PartProps } from '../base/showstyle/definitions/index.js'
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import {
	PGM_DOUBLEBOX_CAMERA_CROP,
	PGM_DOUBLEBOX_CAMERA_FILL,
	PGM_DOUBLEBOX_ILU_CROP,
	PGM_DOUBLEBOX_ILU_FILL,
	PGM_FULLSCREEN_CAMERA_FILL,
	PgmChannelLayers,
	coverCropForFill,
} from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'
import { createCountupRevealClaim } from '../base/showstyle/helpers/countupReveal.js'
import { createLookSlotSequence, isDoubleBoxLook } from '../base/showstyle/helpers/pgmLook.js'
import { WIPE_CUT_POINT_MS } from '../base/showstyle/helpers/clips.js'

describe('DoubleBox PGM ILU above CAM', () => {
	const exportData = loadSmokeRundownExport()
	const context: ICommonContext = {
		getHashId: (origin) => `hash_${origin}`,
		unhashId: (hash) => hash,
		logDebug: () => undefined,
		logInfo: () => undefined,
		logWarning: () => undefined,
		logError: () => undefined,
	}

	it('coverCropForFill from-left keeps aspect and cuts from the left', () => {
		const crop = coverCropForFill(PGM_DOUBLEBOX_CAMERA_FILL, 'from-left')
		expect(crop.top).toBe(0)
		expect(crop.bottom).toBe(0)
		expect(crop.right).toBe(0)
		expect(crop.left).toBeGreaterThanOrEqual(0)
		expect(crop.left).toBeLessThan(0.2)
		expect(crop).toEqual(PGM_DOUBLEBOX_CAMERA_CROP)
	})

	it('stacks PGM ILU above CAM so left overhang is covered without CAM crop', () => {
		expect(PgmChannelLayers.IluPlayer).toBeGreaterThan(PgmChannelLayers.Camera)
		expect(PgmChannelLayers.DoubleBoxLoop).toBeGreaterThan(PgmChannelLayers.IluPlayer)
	})

	it('plays mixed-case gfx/doublebox-ilu on PGM ILU (not HTML headline)', () => {
		const result = parseGraphicsFromObjects(
			hybridCasparConfig,
			[
				{
					id: 'db-mixed',
					objectType: ObjectType.Graphic,
					clipName: 'GFX/DOUBLEBOX-ILU',
					objectTime: 0,
					duration: 5000,
					isAdlib: false,
					attributes: {
						iluFile: 'clips/ILU bednar.mp4',
						text: 'Tematický titulok',
					},
				},
			],
			context
		)

		const piece = result.pieces[0]
		expect(piece?.content.timelineObjects).toHaveLength(1)
		const media = piece?.content.timelineObjects?.[0]
		expect(media?.layer).toBe(CasparCGLayers.CasparCGPgmIluPlayer)
		expect(media?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'clips/ILU bednar',
		})
		expect(
			piece?.content.timelineObjects?.some(
				(obj) =>
					obj.content.deviceType === TSR.DeviceType.CASPARCG &&
					'type' in obj.content &&
					obj.content.type === TSR.TimelineContentTypeCasparCg.TEMPLATE
			)
		).toBe(false)
	})

	it('plays doublebox-ilu on PGM ILU layer with FILL+CROP and no headline chrome', () => {
		const result = parseGraphicsFromObjects(
			hybridCasparConfig,
			[
				{
					id: 'db1',
					objectType: ObjectType.Graphic,
					clipName: 'gfx/doublebox-ilu',
					objectTime: 0,
					duration: 5000,
					isAdlib: false,
					attributes: {
						iluFile: 'clips/ILU bednar.mp4',
						text: 'Tematický titulok',
					},
				},
			],
			context
		)

		const piece = result.pieces[0]
		expect(piece?.content.timelineObjects).toHaveLength(1)

		const media = piece?.content.timelineObjects?.[0]
		expect(media?.layer).toBe(CasparCGLayers.CasparCGPgmIluPlayer)
		expect(media?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'clips/ILU bednar',
			// Hold last frame when the clip is shorter than the part — never CLEAR to blank.
			loop: false,
			mixer: {
				fill: { ...PGM_DOUBLEBOX_ILU_FILL },
				crop: { ...PGM_DOUBLEBOX_ILU_CROP },
			},
		})
		expect(piece?.expectedPackages?.[0]?.layers).toEqual([CasparCGLayers.CasparCGPgmIluPlayer])
	})

	it('tema-1 DoubleBox parts use doublebox-ilu + l3d-tema + CAM FILL (no crop) on Take', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const part = ingest.parts.find((p) => p.externalId === 'part-tema-1-1-ilu-fico-tarabu')
		expect(part).toBeDefined()
		if (!part) return

		const payload = part.payload as {
			type: string
			pieces: Array<{
				id: string
				objectType: string
				objectTime?: number
				duration?: number
				clipName?: string
				attributes: Record<string, unknown>
			}>
		}
		payload.type = 'DoubleBox'
		payload.pieces = [
			{
				id: 'piece-part-tema-1-1-ilu-fico-tarabu-ilu',
				objectType: 'doublebox-ilu',
				objectTime: 0,
				duration: 8,
				clipName: '',
				attributes: { text: 'Tematický titulok', iluFile: 'clips/ILU bednar.mp4' },
			},
			{
				id: 'piece-part-tema-1-1-ilu-fico-tarabu-l3d',
				objectType: 'l3d-tema',
				objectTime: 0,
				duration: 8,
				clipName: '',
				attributes: { headline: 'Tematický titulok' },
			},
			{
				id: 'piece-part-tema-1-1-ilu-fico-tarabu-cam',
				objectType: 'camera',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { camNo: 1 },
			},
			{
				id: 'wipe-part-tema-1-1-ilu-fico-tarabu',
				objectType: 'wipe',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { fileName: 'wipes/wipe', transition: 'Double Box' },
			},
		]

		const segment = convertIngestData(mockIngestContext, ingest)
		const dbPart = segment.parts.find((p) => p.payload.externalId === 'part-tema-1-1-ilu-fico-tarabu')

		expect(dbPart?.type).toBe(PartType.Camera)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/doublebox-ilu')).toBe(true)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/headline')).toBe(false)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/l3d-tema')).toBe(true)
		expect(
			dbPart?.objects.some(
				(obj) =>
					obj.clipName === 'gfx/doublebox-ilu' && typeof (obj.attributes as { iluFile?: string }).iluFile === 'string'
			)
		).toBe(true)

		expect(dbPart).toBeDefined()
		if (!dbPart) return

		const partContext = new PartContext(mockSegmentContext(), dbPart.payload.externalId)
		const result = generateCameraPart(partContext, dbPart as PartProps<CameraProps>, createCountupRevealClaim())

		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		const pgmCam = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmCamera)
		expect(pgmCam?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
			noStarttime: true,
			mixer: {
				fill: { ...PGM_DOUBLEBOX_CAMERA_FILL },
			},
		})
		expect((pgmCam?.content as TSR.TimelineContentCCGMedia).mixer?.crop).toBeUndefined()

		const pgmIlu = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmIluPlayer)
		expect(pgmIlu?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			mixer: {
				fill: { ...PGM_DOUBLEBOX_ILU_FILL },
			},
		})
		// Single DoubleBox (previous look is not A): ch3 is off-air, so freeze frame 0 from Take.
		// DB→DB must NOT do this — see the following test.
		expect(pgmIlu?.enable).toEqual({ start: 0 })
		expect((pgmIlu?.content as TSR.TimelineContentCCGMedia).playing).toBe(false)
		expect((pgmIlu?.content as TSR.TimelineContentCCGMedia).seek).toBe(0)
		const unfreeze = pgmIlu?.keyframes?.find(
			(kf) => (kf.content as { playing?: boolean } | undefined)?.playing === true
		)
		expect(unfreeze?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect(unfreeze?.content).toMatchObject({ playing: true })

		const tema = timeline.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGGraphicsPgmLowerThird &&
				(obj.content as TSR.TimelineContentCCGTemplate).name === 'gfx/l3d-tema'
		)
		expect(tema, 'l3d-tema must play on PGM lower-third after Take into DoubleBox').toBeDefined()
		expect((tema?.content as TSR.TimelineContentCCGTemplate).data).toMatchObject({
			headline: 'Tematický titulok',
		})

		const dbLoop = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmDoubleBoxLoop)
		expect(dbLoop, 'db_loop must start on DoubleBox Take').toBeDefined()
		expect(dbLoop?.enable).toEqual({ start: 0 })
		const dbLoopPiece = result.pieces.find((piece) => piece.externalId === 'part-tema-1-1-ilu-fico-tarabu_db_loop')
		expect(dbLoopPiece?.lifespan).toBe(PieceLifespan.OutOnRundownEnd)
		expect(dbLoopPiece?.prerollDuration ?? 0).toBeLessThan(1500)
		// Never EMPTY look A clip/CAM/db_loop on wiped DoubleBox Takes.
		const clearPiece = result.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const lookAClears = (clearPiece?.content.timelineObjects ?? []).filter(
			(obj) =>
				(obj.content as { file?: string }).file === 'EMPTY' &&
				(obj.layer === CasparCGLayers.CasparCGClipPlayer2 ||
					obj.layer === CasparCGLayers.CasparCGPgmCamera ||
					obj.layer === CasparCGLayers.CasparCGPgmDoubleBoxLoop)
		)
		expect(lookAClears).toHaveLength(0)

		const countupReveal = result.pieces.find((piece) => piece.externalId === 'part-tema-1-1-ilu-fico-tarabu_countup_reveal')
		expect(countupReveal?.lifespan).toBe(PieceLifespan.OutOnRundownEnd)
		// Wiped first DoubleBox: countup PLAY at cover cut (with route://), not at Take.
		expect(countupReveal?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		const countupTl = countupReveal?.content.timelineObjects?.[0]
		expect(countupTl?.layer).toBe(CasparCGLayers.CasparCGGraphicsLogo)
		expect(countupTl?.content).toMatchObject({
			mixer: { opacity: 0, volume: 0 },
		})
		expect(countupTl?.keyframes?.[0]?.content).toMatchObject({
			mixer: { opacity: 1, volume: 1 },
		})
		expect(result.pieces.some((piece) => piece.externalId.endsWith('_led_pod_headline_clear'))).toBe(true)

		const wipe = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(wipe, 'wipe must hard-cut MEDIA route://3 under the PGM overlay').toBeDefined()
		expect(wipe?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		const wipeOverlay = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(wipeOverlay?.enable).toEqual({ start: 0, duration: expect.any(Number) })
		// Overlay before cut; countup + route share the cover instant.
		expect(countupReveal?.enable.start).toBe(wipe?.enable && !Array.isArray(wipe.enable) ? wipe.enable.start : undefined)
		expect(wipe?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://3',
		})
		expect((wipe?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
		expect(timeline.some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)).toBe(true)
		expect(result.pieces.some((piece) => piece.name.startsWith('Wipe'))).toBe(true)

		const headlineChrome = timeline.find(
			(obj) => (obj.content as TSR.TimelineContentCCGTemplate).name === 'gfx/headline-fallback'
		)
		expect(headlineChrome).toBeUndefined()
	})

	it('DB→DB wipe holds outgoing ILU until wipeCutPointMs and PLAYs incoming then', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const template = ingest.parts.find((p) => p.externalId === 'part-tema-1-1-ilu-fico-tarabu')
		expect(template).toBeDefined()
		if (!template) return

		type IngestPiece = {
			id: string
			objectType: string
			objectTime?: number
			duration?: number
			clipName?: string
			attributes: Record<string, unknown>
		}
		const asPayload = (part: typeof template) =>
			part.payload as {
				externalId?: string
				type: string
				pieces: IngestPiece[]
			}

		const makeDb = (externalId: string, iluFile: string) => {
			const part = JSON.parse(JSON.stringify(template)) as typeof template
			part.externalId = externalId
			const payload = asPayload(part)
			payload.externalId = externalId
			payload.type = 'DoubleBox'
			payload.pieces = [
				{
					id: `${externalId}-ilu`,
					objectType: 'doublebox-ilu',
					objectTime: 0,
					duration: 8,
					clipName: '',
					attributes: { text: externalId, iluFile },
				},
				{
					id: `${externalId}-l3d`,
					objectType: 'l3d-tema',
					objectTime: 0,
					duration: 8,
					clipName: '',
					attributes: { headline: externalId },
				},
				{
					id: `${externalId}-cam`,
					objectType: 'camera',
					objectTime: 0,
					duration: 0,
					clipName: '',
					attributes: { camNo: 1 },
				},
				{
					id: `${externalId}-wipe`,
					objectType: 'wipe',
					objectTime: 0,
					duration: 0,
					clipName: '',
					attributes: { fileName: 'wipes/wipe', transition: 'Double Box' },
				},
			]
			return part
		}

		ingest.parts = [makeDb('part-db-a', 'clips/ILU outgoing.mp4'), makeDb('part-db-b', 'clips/ILU incoming.mp4')]

		const segment = convertIngestData(mockIngestContext, ingest)
		const generated = generateParts(mockSegmentContext(), segment, undefined, createLookSlotSequence())
		const outgoing = generated.parts.find((part) => part.part.externalId === 'part-db-a')
		const incoming = generated.parts.find((part) => part.part.externalId === 'part-db-b')
		expect(outgoing).toBeDefined()
		expect(incoming).toBeDefined()
		if (!outgoing || !incoming) return

		const iluOf = (pieces: typeof outgoing.pieces, file: string) =>
			pieces
				.flatMap((piece) => piece.content.timelineObjects ?? [])
				.find(
					(obj) => obj.layer === CasparCGLayers.CasparCGPgmIluPlayer && (obj.content as { file?: string }).file === file
				)

		// First DB is off-air ch3 (baseline route://4) — prebuild may freeze. It must still
		// postroll through the next cut so the clip is the outgoing picture for DB→DB.
		const outgoingIlu = iluOf(outgoing.pieces, 'clips/ILU outgoing')
		expect(outgoingIlu).toBeDefined()
		const outgoingIluPiece = outgoing.pieces.find((piece) =>
			(piece.content.timelineObjects ?? []).some((obj) => obj === outgoingIlu)
		)
		expect(outgoingIluPiece?.postrollDuration ?? 0).toBeGreaterThanOrEqual(WIPE_CUT_POINT_MS)

		// Incoming DB→DB: nothing on 3-116 until the cut. No pause, no seek-0, no EMPTY.
		expect(incoming.part.inTransition?.previousPartKeepaliveDuration).toBe(WIPE_CUT_POINT_MS)
		const incomingIlu = iluOf(incoming.pieces, 'clips/ILU incoming')
		expect(incomingIlu?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		const incomingContent = incomingIlu?.content as TSR.TimelineContentCCGMedia
		expect(incomingContent.playing).not.toBe(false)
		expect(incomingContent.seek).toBeUndefined()
		expect(
			(incomingIlu?.keyframes ?? []).some((kf) => (kf.content as { playing?: boolean } | undefined)?.playing === false)
		).toBe(false)

		const earlyIluEmpty = incoming.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.filter((obj) => {
				if (obj.layer !== CasparCGLayers.CasparCGPgmIluPlayer) return false
				if ((obj.content as { file?: string }).file !== 'EMPTY') return false
				const enable = obj.enable
				if (!enable || Array.isArray(enable)) return true
				return typeof enable.start !== 'number' || enable.start < WIPE_CUT_POINT_MS
			})
		expect(earlyIluEmpty).toHaveLength(0)

		const incomingCam = incoming.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmCamera)
		expect(incomingCam?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect(incomingCam?.content).toMatchObject({ file: 'route://5' })

		const route = incoming.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(route?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect(route?.content).toMatchObject({ file: 'route://3' })

		const wipeOverlay = incoming.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(wipeOverlay?.enable).toMatchObject({ start: 0 })
		const wipePiece = incoming.pieces.find((piece) =>
			(piece.content.timelineObjects ?? []).some((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)
		)
		expect(wipePiece?.pieceType).toBe(IBlueprintPieceType.InTransition)

		// Same-file frame must not be EMPTIED on look A (that would black the box at Take).
		const dbLoopEmpty = incoming.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.filter(
				(obj) =>
					obj.layer === CasparCGLayers.CasparCGPgmDoubleBoxLoop && (obj.content as { file?: string }).file === 'EMPTY'
			)
		expect(dbLoopEmpty).toHaveLength(0)
	})

	it('floated Full between DoubleBoxes does not break DB→DB look-slot peek', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const template = ingest.parts.find((p) => p.externalId === 'part-tema-1-1-ilu-fico-tarabu')
		expect(template).toBeDefined()
		if (!template) return

		type IngestPiece = {
			id: string
			objectType: string
			objectTime?: number
			duration?: number
			clipName?: string
			attributes: Record<string, unknown>
		}
		const asPayload = (part: typeof template) =>
			part.payload as {
				externalId?: string
				type: string
				float?: boolean
				skip?: boolean
				pieces: IngestPiece[]
			}

		const makeDb = (externalId: string, iluFile: string) => {
			const part = JSON.parse(JSON.stringify(template)) as typeof template
			part.externalId = externalId
			const payload = asPayload(part)
			payload.externalId = externalId
			payload.type = 'DoubleBox'
			payload.pieces = [
				{
					id: `${externalId}-ilu`,
					objectType: 'doublebox-ilu',
					objectTime: 0,
					duration: 8,
					clipName: '',
					attributes: { text: externalId, iluFile },
				},
				{
					id: `${externalId}-l3d`,
					objectType: 'l3d-tema',
					objectTime: 0,
					duration: 8,
					clipName: '',
					attributes: { headline: externalId },
				},
				{
					id: `${externalId}-cam`,
					objectType: 'camera',
					objectTime: 0,
					duration: 0,
					clipName: '',
					attributes: { camNo: 1 },
				},
				{
					id: `${externalId}-wipe`,
					objectType: 'wipe',
					objectTime: 0,
					duration: 0,
					clipName: '',
					attributes: { fileName: 'wipes/wipe', transition: 'Double Box' },
				},
			]
			return part
		}

		const floatedFull = JSON.parse(JSON.stringify(template)) as typeof template
		floatedFull.externalId = 'part-floated-full'
		const floatedPayload = asPayload(floatedFull)
		floatedPayload.externalId = 'part-floated-full'
		floatedPayload.type = 'Camera'
		floatedPayload.float = true
		floatedPayload.pieces = [
			{
				id: 'part-floated-full-cam',
				objectType: 'camera',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { camNo: 1 },
			},
		]

		ingest.parts = [
			makeDb('part-db-a', 'clips/ILU outgoing.mp4'),
			floatedFull,
			makeDb('part-db-b', 'clips/ILU incoming.mp4'),
		]

		const segment = convertIngestData(mockIngestContext, ingest)
		const floatedIntermediate = segment.parts.find((part) => part.payload.externalId === 'part-floated-full')
		expect(floatedIntermediate?.payload.float || floatedIntermediate?.payload.skip).toBeTruthy()

		const generated = generateParts(mockSegmentContext(), segment, undefined, createLookSlotSequence())
		const floated = generated.parts.find((part) => part.part.externalId === 'part-floated-full')
		const incoming = generated.parts.find((part) => part.part.externalId === 'part-db-b')
		expect(floated?.part.floated).toBe(true)
		expect(incoming).toBeDefined()
		if (!incoming) return

		// Without the fix, floated Full would claim look B and this Take would freeze ILU from 0
		// (Full→DB). Last eligible look is still A → DB→DB hold until wipe cut.
		const incomingIlu = incoming.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find(
				(obj) =>
					obj.layer === CasparCGLayers.CasparCGPgmIluPlayer &&
					(obj.content as { file?: string }).file === 'clips/ILU incoming'
			)
		expect(incomingIlu?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		const incomingContent = incomingIlu?.content as TSR.TimelineContentCCGMedia
		expect(incomingContent.playing).not.toBe(false)
		expect(incomingContent.seek).toBeUndefined()
	})

	it('selects DoubleBox camera path when gfx/doublebox-ilu clipName casing differs', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const part = ingest.parts.find((p) => p.externalId === 'part-tema-1-1-ilu-fico-tarabu')
		expect(part).toBeDefined()
		if (!part) return

		const payload = part.payload as {
			type: string
			pieces: Array<{
				id: string
				objectType: string
				objectTime?: number
				duration?: number
				clipName?: string
				attributes: Record<string, unknown>
			}>
		}
		// Use a non-DoubleBox raw type so partUsesDoubleBoxCamera must classify via clipName.
		payload.type = 'Camera'
		payload.pieces = [
			{
				id: 'piece-db-ilu-mixed',
				objectType: 'doublebox-ilu',
				objectTime: 0,
				duration: 8,
				clipName: '',
				attributes: { text: 'Mixed case', iluFile: 'clips/ILU bednar.mp4' },
			},
			{
				id: 'piece-db-cam-mixed',
				objectType: 'camera',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { camNo: 1 },
			},
		]

		const segment = convertIngestData(mockIngestContext, ingest)
		const dbPart = segment.parts.find((p) => p.payload.externalId === 'part-tema-1-1-ilu-fico-tarabu')
		expect(dbPart).toBeDefined()
		if (!dbPart) return

		const iluObj = dbPart.objects.find(
			(obj) => obj.objectType === ObjectType.Graphic && obj.clipName.toLowerCase() === 'gfx/doublebox-ilu'
		)
		expect(iluObj).toBeDefined()
		if (!iluObj) return
		iluObj.clipName = 'gfx/DoubleBox-ILU'

		const partContext = new PartContext(mockSegmentContext(), dbPart.payload.externalId)
		const result = generateCameraPart(partContext, dbPart as PartProps<CameraProps>, createCountupRevealClaim())
		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		const pgmCam = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmCamera)
		expect(pgmCam?.content).toMatchObject({
			mixer: {
				fill: { ...PGM_DOUBLEBOX_CAMERA_FILL },
			},
		})
		expect((pgmCam?.content as TSR.TimelineContentCCGMedia).mixer?.crop).toBeUndefined()

		const dbLoop = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmDoubleBoxLoop)
		expect(dbLoop, 'mixed-case doublebox-ilu must still include db_loop').toBeDefined()
	})

	it('coerces stale headline+bypass ILU on a DoubleBox part to doublebox-ilu window FILL', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const part = ingest.parts.find((p) => p.externalId === 'part-tema-1-1-ilu-fico-tarabu')
		expect(part).toBeDefined()
		if (!part) return

		const payload = part.payload as {
			type: string
			pieces: Array<{
				id: string
				objectType: string
				objectTime?: number
				duration?: number
				clipName?: string
				attributes: Record<string, unknown>
			}>
		}
		payload.type = 'doublebox'
		// Simulate pre-migration piece still typed as headline with bypass ON.
		payload.pieces = payload.pieces.map((piece) =>
			piece.objectType === 'doublebox-ilu'
				? {
						...piece,
						objectType: 'headline',
						attributes: {
							...piece.attributes,
							iluPrerendered: true,
							bypass: true,
						},
					}
				: piece
		)

		const segment = convertIngestData(mockIngestContext, ingest)
		const dbPart = segment.parts.find((p) => p.payload.externalId === 'part-tema-1-1-ilu-fico-tarabu')
		expect(dbPart).toBeDefined()
		if (!dbPart) return
		expect(dbPart.objects.some((obj) => obj.clipName === 'gfx/doublebox-ilu')).toBe(true)

		const partContext = new PartContext(mockSegmentContext(), dbPart.payload.externalId)
		const result = generateCameraPart(partContext, dbPart as PartProps<CameraProps>, createCountupRevealClaim())
		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		const ilu = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmIluPlayer)
		expect(ilu?.content).toMatchObject({
			mixer: {
				fill: { ...PGM_DOUBLEBOX_ILU_FILL },
				crop: { ...PGM_DOUBLEBOX_ILU_CROP },
			},
		})
	})

	it('ZAVER uses Full look B: LED ilu-zaver + fullscreen cam route://5; no db_loop; PGM route://4', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-outro'))
		const zaver = segment.parts.find((p) => p.objects.some((obj) => obj.clipName === 'gfx/ilu-zaver'))
		expect(zaver).toBeDefined()
		if (!zaver) return
		expect(zaver.objects.some((obj) => obj.clipName === 'gfx/ilu-zaver')).toBe(true)
		expect(isDoubleBoxLook(zaver.rawType, zaver.objects)).toBe(false)

		const partContext = new PartContext(mockSegmentContext(), zaver.payload.externalId)
		const result = generateCameraPart(partContext, zaver as PartProps<CameraProps>, createCountupRevealClaim(), 'B')
		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		const ledIlu = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGIluPlayer)
		expect(ledIlu?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			mixer: {
				fill: { ...PGM_DOUBLEBOX_ILU_FILL },
				crop: { ...PGM_DOUBLEBOX_ILU_CROP },
			},
		})
		expect(
			timeline.some(
				(obj) =>
					obj.layer === CasparCGLayers.CasparCGPgmIluPlayer && (obj.content as { file?: string }).file !== 'EMPTY'
			)
		).toBe(false)
		const liveDbLoop = (layer: CasparCGLayers) =>
			timeline.some(
				(obj) =>
					obj.layer === layer &&
					(obj.content as { type?: string; file?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA &&
					(obj.content as { file?: string }).file !== 'EMPTY' &&
					String((obj.content as { file?: string }).file || '').length > 0
			)
		expect(liveDbLoop(CasparCGLayers.CasparCGPgmDoubleBoxLoop)).toBe(false)
		expect(liveDbLoop(CasparCGLayers.CasparCGPgmDoubleBoxLoopB)).toBe(false)
		const cam = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmCameraB)
		expect(cam?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
			mixer: { fill: { ...PGM_FULLSCREEN_CAMERA_FILL } },
		})
		expect(
			timeline.some(
				(obj) => obj.layer === CasparCGLayers.CasparCGPgmCameraB && (obj.content as { file?: string }).file === 'EMPTY'
			)
		).toBe(false)
		expect(
			timeline.some(
				(obj) =>
					obj.layer === CasparCGLayers.CasparCGGraphicsPgmLowerThirdB &&
					(obj.content as TSR.TimelineContentCCGTemplate).name === 'gfx/l3d-odporucanie'
			)
		).toBe(true)
		const route = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(route?.content).toMatchObject({ file: 'route://4' })
	})
})
