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
	coverCropForFill,
} from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

describe('DoubleBox PGM ILU + CAM crop', () => {
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
		const crop = coverCropForFill({ xScale: 0.34, yScale: 0.72 }, 'from-left')
		expect(crop.top).toBe(0)
		expect(crop.bottom).toBe(0)
		expect(crop.right).toBe(0)
		expect(crop.left).toBeGreaterThan(0.4)
		expect(crop.left).toBeLessThan(0.7)
		expect(crop).toEqual(PGM_DOUBLEBOX_CAMERA_CROP)
	})

	it('plays doublebox-ilu on PGM 115 with FILL+CROP and no headline chrome', () => {
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

	it('tema-1 DoubleBox parts use doublebox-ilu + l3d-tema + CAM crop on Take', () => {
		// CI may still pin an older megarepo smoke without doublebox-ilu — mutate ingest so this
		// case is self-contained: DoubleBox part + camera + doublebox-ilu (iluFile) + l3d-tema.
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const part = ingest.parts.find((p) => p.externalId === 'part-ilu-1')
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
				id: 'piece-part-ilu-1-ilu',
				objectType: 'doublebox-ilu',
				objectTime: 0,
				duration: 8,
				clipName: '',
				attributes: { text: 'Tematický titulok', iluFile: 'clips/ILU bednar.mp4' },
			},
			{
				id: 'piece-part-ilu-1-l3d',
				objectType: 'l3d-tema',
				objectTime: 0,
				duration: 8,
				clipName: '',
				attributes: { headline: 'Tematický titulok' },
			},
			{
				id: 'piece-part-ilu-1-cam',
				objectType: 'camera',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { camNo: 1 },
			},
			{
				id: 'wipe-05-part-ilu-1',
				objectType: 'wipe',
				objectTime: 0,
				duration: 0,
				clipName: '',
				attributes: { fileName: 'wipes/wipe', transition: 'Double Box' },
			},
		]

		const segment = convertIngestData(mockIngestContext, ingest)
		const dbPart = segment.parts.find((p) => p.payload.externalId === 'part-ilu-1')

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
		const result = generateCameraPart(partContext, dbPart as PartProps<CameraProps>)

		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])

		const pgmCam = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmCamera)
		expect(pgmCam?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'dshow://video=OBS Virtual Camera',
			mixer: {
				fill: { ...PGM_DOUBLEBOX_CAMERA_FILL },
				crop: { ...PGM_DOUBLEBOX_CAMERA_CROP },
			},
		})

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
				(obj.content as TSR.TimelineContentCCGTemplate).name === 'gfx/l3d-tema'
		)
		expect(tema, 'l3d-tema must play on PGM lower-third after Take into DoubleBox').toBeDefined()
		expect((tema?.content as TSR.TimelineContentCCGTemplate).data).toMatchObject({
			headline: 'Tematický titulok',
		})

		const headlineChrome = timeline.find(
			(obj) => (obj.content as TSR.TimelineContentCCGTemplate).name === 'gfx/headline-fallback'
		)
		expect(headlineChrome).toBeUndefined()
	})
})
