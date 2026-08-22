import { ICommonContext, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { PartType, CameraProps, PartProps } from '../base/showstyle/definitions/index.js'
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
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
			mixer: {
				fill: { ...PGM_DOUBLEBOX_ILU_FILL },
				crop: { ...PGM_DOUBLEBOX_ILU_CROP },
			},
		})
		expect(piece?.expectedPackages?.[0]?.layers).toEqual([CasparCGLayers.CasparCGPgmIluPlayer])
	})

	it('tema-1 DoubleBox parts use doublebox-ilu + l3d-predstavovak + CAM FILL (no crop) on Take', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const part = ingest.parts.find((p) => p.externalId === 'part-tema-1-db')
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
				id: 'piece-part-tema-1-db-ilu',
				objectType: 'doublebox-ilu',
				objectTime: 0,
				duration: 8,
				clipName: '',
				attributes: { text: 'Tematický titulok', iluFile: 'clips/ILU bednar.mp4' },
			},
			{
				id: 'piece-part-tema-1-db-l3d',
				objectType: 'l3d-predstavovak',
				objectTime: 0,
				duration: 8,
				clipName: '',
				attributes: { name: 'Tematický titulok', title: '' },
			},
			{
				id: 'piece-part-tema-1-db-cam',
				objectType: 'camera',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { camNo: 1 },
			},
			{
				id: 'wipe-part-tema-1-db',
				objectType: 'wipe',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { fileName: 'wipes/wipe', transition: 'Double Box' },
			},
		]

		const segment = convertIngestData(mockIngestContext, ingest)
		const dbPart = segment.parts.find((p) => p.payload.externalId === 'part-tema-1-db')

		expect(dbPart?.type).toBe(PartType.Camera)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/doublebox-ilu')).toBe(true)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/headline')).toBe(false)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/l3d-predstavovak')).toBe(true)
		expect(
			dbPart?.objects.some(
				(obj) =>
					obj.clipName === 'gfx/doublebox-ilu' && typeof (obj.attributes as { iluFile?: string }).iluFile === 'string'
			)
		).toBe(true)

		expect(dbPart).toBeDefined()
		if (!dbPart) return

		const partContext = new PartContext(mockSegmentContext(), dbPart.payload.externalId)
		const result = generateCameraPart(partContext, dbPart as PartProps<CameraProps>)

		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		const pgmCam = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmCamera)
		expect(pgmCam?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'dshow://video=OBS Virtual Camera',
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

		const tema = timeline.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGGraphicsPgmLowerThird &&
				(obj.content as TSR.TimelineContentCCGTemplate).name === 'gfx/l3d-predstavovak'
		)
		expect(tema, 'l3d-predstavovak must play on PGM lower-third after Take into DoubleBox').toBeDefined()
		expect((tema?.content as TSR.TimelineContentCCGTemplate).data).toMatchObject({
			name: 'Tematický titulok',
		})

		const dbLoop = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmDoubleBoxLoop)
		expect(dbLoop, 'db_loop must start on DoubleBox Take').toBeDefined()

		const wipe = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(wipe, 'wipe must PLAY on PGM layer 200 alongside Camera/ILU/L3D').toBeDefined()
		expect((wipe?.content as TSR.TimelineContentCCGMedia).file).toBe('wipes/wipe')
		expect(result.pieces.some((piece) => piece.name.startsWith('Wipe'))).toBe(true)

		const headlineChrome = timeline.find(
			(obj) => (obj.content as TSR.TimelineContentCCGTemplate).name === 'gfx/headline-fallback'
		)
		expect(headlineChrome).toBeUndefined()
	})

	it('selects DoubleBox camera path when gfx/doublebox-ilu clipName casing differs', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const part = ingest.parts.find((p) => p.externalId === 'part-tema-1-db')
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
		const dbPart = segment.parts.find((p) => p.payload.externalId === 'part-tema-1-db')
		expect(dbPart).toBeDefined()
		if (!dbPart) return

		const iluObj = dbPart.objects.find(
			(obj) => obj.objectType === ObjectType.Graphic && obj.clipName.toLowerCase() === 'gfx/doublebox-ilu'
		)
		expect(iluObj).toBeDefined()
		if (!iluObj) return
		iluObj.clipName = 'gfx/DoubleBox-ILU'

		const partContext = new PartContext(mockSegmentContext(), dbPart.payload.externalId)
		const result = generateCameraPart(partContext, dbPart as PartProps<CameraProps>)
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
})
