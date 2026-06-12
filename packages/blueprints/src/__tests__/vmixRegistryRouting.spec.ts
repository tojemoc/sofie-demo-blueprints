import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { ObjectType } from '../common/definitions/objects.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { VMixLayers } from '../base/studio/layers.js'
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
import { generateDVEPart } from '../base/showstyle/part-adapters/dve.js'
import { generateVTPart } from '../base/showstyle/part-adapters/vt.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { resolveGraphicPieceRegistryKey, VMIX_REGISTRY_KEYS } from '../base/showstyle/helpers/vmixRegistryRouting.js'
import { PartInfo, PartType } from '../base/showstyle/definitions/index.js'
import { PartContext } from '../common/context.js'

const helloVmixConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 0,
	visionMixer: {
		type: VisionMixerDevice.VMix,
		host: '127.0.0.1',
		port: 8099,
		deviceId: 'vmix0',
	},
	audioMixer: {
		host: 'localhost',
		port: 1176,
		deviceId: 'sisyfos0',
	},
	casparcg: {
		host: 'localhost',
		port: 5250,
	},
	sisyfosSources: {},
	vmixSources: {},
	vmixInputs: {
		CAMERA: { input: 'CAMERA' },
		LOWER_THIRD: { input: 'LOWER_THIRD', overlay: 1 },
		HEADLINE: { input: 'HEADLINE', overlay: 2 },
		DOUBLEBOX: { input: 'DOUBLEBOX' },
		BG_LOOP: { input: 'BG_LOOP', loop: true },
	},
	atemOutputs: {},
	atemSources: {
		camera1: { input: 1, type: SourceType.Camera },
		camera2: { input: 2, type: SourceType.Camera },
	},
}

function mockPartContext(config: StudioConfig): PartContext {
	return {
		getStudioConfig: () => ({ studio: config }),
		getShowStyleConfig: () => ({ dvePresets: {} }),
		logDebug: () => undefined,
		logInfo: () => undefined,
		logWarning: () => undefined,
		logError: () => undefined,
		notifyUserError: () => undefined,
		getHashId: (id: string) => id,
	} as unknown as PartContext
}

describe('vmixRegistryRouting', () => {
	it('maps graphic piece clip names to registry keys', () => {
		const baseGraphic = {
			id: 'gfx1',
			objectType: ObjectType.Graphic as ObjectType.Graphic,
			objectTime: 0,
			duration: 0,
		}

		expect(resolveGraphicPieceRegistryKey({ ...baseGraphic, clipName: 'gfx/l3d', attributes: {} })).toBe(
			VMIX_REGISTRY_KEYS.LOWER_THIRD
		)
		expect(resolveGraphicPieceRegistryKey({ ...baseGraphic, clipName: 'gfx/head', attributes: {} })).toBe(
			VMIX_REGISTRY_KEYS.HEADLINE
		)
	})

	it('routes cam parts to CAMERA registry program layer', () => {
		const result = generateCameraPart(mockPartContext(helloVmixConfig), {
			type: PartType.Camera,
			rawType: 'cam',
			rawTitle: 'Cam',
			info: PartInfo.NORMAL,
			objects: [],
			payload: {
				externalId: 'cam1',
				name: 'Cam',
				duration: 5000,
				script: '',
				input: { type: SourceType.Camera, id: 2 },
			},
		})

		const timeline = result.pieces[0]?.content.timelineObjects ?? []
		const program = timeline.find((obj) => obj.layer === VMixLayers.VMixMeProgram)

		expect(program?.content.deviceType).toBe(TSR.DeviceType.VMIX)
		expect((program?.content as TSR.TimelineContentVMixProgram).input).toBe('CAMERA')
	})

	it('routes dve parts to DOUBLEBOX without multiview overlay objects', () => {
		const result = generateDVEPart(mockPartContext(helloVmixConfig), {
			type: PartType.DVE,
			rawType: 'dve',
			rawTitle: 'DVE',
			info: PartInfo.NORMAL,
			objects: [],
			payload: {
				externalId: 'dve1',
				name: 'DVE',
				duration: 5000,
				script: '',
				layout: 'TwoBox',
				inputs: [
					{ type: SourceType.Camera, id: 1 },
					{ type: SourceType.Camera, id: 2 },
				],
			},
		})

		const timeline = result.pieces[0]?.content.timelineObjects ?? []
		const program = timeline.find((obj) => obj.layer === VMixLayers.VMixMeProgram)
		const multiview = timeline.find((obj) => obj.layer === VMixLayers.VMixDVEMultiView)

		expect((program?.content as TSR.TimelineContentVMixProgram).input).toBe('DOUBLEBOX')
		expect(multiview).toBeUndefined()
		expect(result.pieces).toHaveLength(1)
	})

	it('routes full parts to BG_LOOP playback without CasparCG objects', () => {
		const result = generateVTPart(mockPartContext(helloVmixConfig), {
			type: PartType.VT,
			rawType: 'full',
			rawTitle: 'Full',
			info: PartInfo.NORMAL,
			objects: [],
			payload: {
				externalId: 'full1',
				name: 'Full',
				duration: 10000,
				script: '',
				clipProps: {
					fileName: 'clips/test.mp4',
					sourceDuration: 10000,
				},
			},
		})

		const timeline = result.pieces[0]?.content.timelineObjects ?? []
		const caspar = timeline.find((obj) => obj.content.deviceType === TSR.DeviceType.CASPARCG)
		const playback = timeline.find(
			(obj): obj is typeof obj & { content: TSR.TimelineContentVMixInput } =>
				obj.content.deviceType === TSR.DeviceType.VMIX &&
				'type' in obj.content &&
				obj.content.type === TSR.TimelineContentTypeVMix.INPUT
		)

		expect(caspar).toBeUndefined()
		expect(playback?.enable).toEqual({ while: 1 })
		expect(result.pieces[0]?.expectedPackages).toBeUndefined()
	})

	it('routes l3d pieces to LOWER_THIRD overlay layer', () => {
		const result = parseGraphicsFromObjects(helloVmixConfig, [
			{
				id: 'l3d1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					name: 'Guest',
					description: 'Reporter',
				},
			},
		])

		const timeline = result.pieces[0]?.content.timelineObjects ?? []
		const overlay = timeline.find((obj) => obj.layer === 'vmix_overlay_lower_third')

		expect(overlay && 'type' in overlay.content && overlay.content.type === TSR.TimelineContentTypeVMix.OVERLAY).toBe(
			true
		)
		expect(overlay?.enable).toEqual({ while: 1 })
	})

	it('falls back to CasparCG timeline when registry key is not configured', () => {
		const config = { ...helloVmixConfig, casparcgLatency: 80 }
		const result = parseGraphicsFromObjects(config, [
			{
				id: 'strap1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/strap',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					location: 'Live',
					text: 'Breaking',
				},
			},
		])

		const timeline = result.pieces[0]?.content.timelineObjects ?? []
		const caspar = timeline.find(
			(obj): obj is typeof obj & { content: TSR.TimelineContentCCGTemplate } =>
				obj.content.deviceType === TSR.DeviceType.CASPARCG &&
				'type' in obj.content &&
				obj.content.type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)

		expect(caspar).toBeDefined()
		expect(result.pieces[0]?.prerollDuration).toBe(80)
	})

	it('uses zero preroll only for registry overlay graphics', () => {
		const config = { ...helloVmixConfig, casparcgLatency: 80 }
		const result = parseGraphicsFromObjects(config, [
			{
				id: 'l3d1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					name: 'Guest',
					description: 'Reporter',
				},
			},
		])

		expect(result.pieces[0]?.prerollDuration).toBe(0)
	})

	it('derives DVE audio from part inputs in registry mode', () => {
		const result = generateDVEPart(mockPartContext(helloVmixConfig), {
			type: PartType.DVE,
			rawType: 'dve',
			rawTitle: 'DVE',
			info: PartInfo.NORMAL,
			objects: [],
			payload: {
				externalId: 'dve-remote',
				name: 'DVE',
				duration: 5000,
				script: '',
				layout: 'TwoBox',
				inputs: [
					{ type: SourceType.Remote, id: 2 },
					{ type: SourceType.Camera, id: 1 },
				],
			},
		})

		expect(result.pieces).toHaveLength(1)
		expect(result.pieces[0]?.content.timelineObjects.length).toBeGreaterThan(1)
	})
})
