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
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-tema-1'))
		const dbPart = segment.parts.find((part) => part.payload.externalId === 'part-ilu-1')

		expect(dbPart?.type).toBe(PartType.Camera)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/doublebox-ilu')).toBe(true)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/headline')).toBe(false)
		expect(dbPart?.objects.some((obj) => obj.clipName === 'gfx/l3d-tema')).toBe(true)

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
