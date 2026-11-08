import { IBlueprintPiece, IOnTakeContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { beforeAll, describe, expect, it } from 'vitest'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import {
	CALIBRATION_FRAME_FILE,
	LED_TEST_FRAME_FILE,
	createStudioCalibrationClearPiece,
	createVmixRecordingPiece,
} from '../base/showstyle/helpers/studioCalibration.js'
import { PGM_DOUBLEBOX_CAMERA_FILL } from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import { getVMixMappings } from '../base/studio/applyConfig/mappings/vmix.js'
import { getCasparCGMappings } from '../base/studio/applyConfig/mappings/casparcg.js'
import { StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers, VMixLayers } from '../base/studio/layers.js'
import { TimelineBlueprintExt } from '../base/studio/customTypes.js'
import { getBaseline } from '../base/showstyle/rundown/baseline.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

const vmixStudioConfig: StudioConfig = {
	...hybridCasparConfig,
	visionMixer: { type: VisionMixerDevice.VMix, host: '127.0.0.1', port: 8088, deviceId: 'vmix0' },
	casparcg: {
		...hybridCasparConfig.casparcg,
		hypercomposed: { ledChannel: 1, pgmChannel: 4, bgChannelA: 2, bgChannelB: 3 },
	},
	vmixSources: {},
	vmixProgram: {
		cameraInput: 1,
		lookAInput: 2,
		lookBInput: 3,
		lookAFeedInput: 5,
		lookBFeedInput: 6,
		cleanGfxInput: 4,
		bedAInput: 7,
		bedCInput: 8,
	},
}

let baseManifest: typeof import('../base/showstyle/manifest.js').baseManifest

beforeAll(async () => {
	// The manifest is evaluated against rollup-injected globals; stub them for vitest.
	const globals = globalThis as Record<string, unknown>
	globals.__VERSION__ ??= 'test'
	globals.__VERSION_TSR__ ??= 'test'
	globals.__VERSION_INTEGRATION__ ??= 'test'
	baseManifest = (await import('../base/showstyle/manifest.js')).baseManifest
})

function baselineObjects(config: StudioConfig): TimelineBlueprintExt[] {
	const baseline = getBaseline({
		getStudioConfig: () => ({ studio: config }),
		getShowStyleConfig: () => ({ dvePresets: {} }),
		logDebug: () => undefined,
		logInfo: () => undefined,
		logWarning: () => undefined,
		logError: () => undefined,
	} as unknown as Parameters<typeof getBaseline>[0])
	return (baseline.timelineObjects ?? []) as TimelineBlueprintExt[]
}

describe('studio calibration baseline', () => {
	it('LED + look-B carry the calibration frame on hypercomposed Caspar studios', () => {
		const objs = baselineObjects(hybridCasparConfig)
		expect(objs.find((obj) => obj.layer === CasparCGLayers.CasparCGLedTestframe)?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: LED_TEST_FRAME_FILE,
		})
		expect(objs.find((obj) => obj.layer === CasparCGLayers.CasparCGLookCalibFrame)?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: CALIBRATION_FRAME_FILE,
			loop: true,
		})
	})

	it('Caspar-switched studios route the live camera into the DoubleBox window on look B', () => {
		const cam = baselineObjects(hybridCasparConfig).find((obj) => obj.layer === CasparCGLayers.CasparCGLookCalibCam)
		expect((cam?.content as TSR.TimelineContentCCGMedia)?.file).toBe('route://5')
		expect((cam?.content as TSR.TimelineContentCCGMedia)?.mixer?.fill).toMatchObject(PGM_DOUBLEBOX_CAMERA_FILL)
	})

	it('vMix studios keep the calibration frame but move the camera onto look input B', () => {
		const objs = baselineObjects(vmixStudioConfig)
		expect(objs.find((obj) => obj.layer === CasparCGLayers.CasparCGLookCalibFrame)?.content).toMatchObject({
			file: CALIBRATION_FRAME_FILE,
		})
		// No Caspar camera route on vMix studios — the camera is a vMix input.
		expect(objs.find((obj) => obj.layer === CasparCGLayers.CasparCGLookCalibCam)).toBeUndefined()
		const lookB = objs.find((obj) => obj.layer === VMixLayers.VMixLookInputB)
		const layers = (lookB?.content as TSR.TimelineContentVMixInput)?.layers
		expect(layers?.[3]?.input).toBe(vmixStudioConfig.vmixProgram.cameraInput)
		expect(layers?.[2]?.input).toBe(vmixStudioConfig.vmixProgram.lookBFeedInput)
		// Look A carries no camera.
		const lookA = objs.find((obj) => obj.layer === VMixLayers.VMixLookInputA)
		const layersA = (lookA?.content as TSR.TimelineContentVMixInput)?.layers
		expect(layersA?.[3]).toBeUndefined()
		expect(layersA?.[1]).toBeUndefined()
	})

	it('calibration layers are mapped on LED 114 and BG B 117/119', () => {
		const mappings = getCasparCGMappings({ studio: hybridCasparConfig })
		expect(mappings[CasparCGLayers.CasparCGLedTestframe]?.options).toMatchObject({ channel: 1, layer: 114 })
		expect(mappings[CasparCGLayers.CasparCGLookCalibCam]?.options).toMatchObject({ channel: 4, layer: 117 })
		expect(mappings[CasparCGLayers.CasparCGLookCalibFrame]?.options).toMatchObject({ channel: 4, layer: 119 })
	})
})

describe('studio calibration clear piece', () => {
	it('EMPTYs all calibration layers, lasting until rundown end', () => {
		const piece = createStudioCalibrationClearPiece('part1')
		expect(piece.lifespan).toBe(PieceLifespan.OutOnRundownEnd)
		const layers = (piece.content.timelineObjects ?? []).map((obj) => String(obj.layer))
		expect(layers.sort()).toEqual(
			[
				CasparCGLayers.CasparCGLedTestframe,
				CasparCGLayers.CasparCGLookCalibCam,
				CasparCGLayers.CasparCGLookCalibFrame,
			].sort()
		)
		for (const obj of piece.content.timelineObjects ?? []) {
			expect((obj.content as TSR.TimelineContentCCGMedia).file).toBe('EMPTY')
		}
	})

	it('every generated part carries the clear piece (any part may be the first Take)', () => {
		const exportData = loadSmokeRundownExport()
		const ctx = {
			...mockSegmentContext(),
			getStudioConfig: () => ({ studio: vmixStudioConfig }),
		} as ReturnType<typeof mockSegmentContext>
		for (const segId of [...new Set(exportData.parts.map((p) => p.segmentId))]) {
			const intermediate = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, segId))
			for (const generated of generateParts(ctx, intermediate).parts) {
				const clears = generated.pieces.filter(
					(piece) => piece.sourceLayerId === (SourceLayer.StudioCalibrationClear as string)
				)
				expect(clears, `part ${generated.part.externalId}`).toHaveLength(1)
				expect(clears[0].lifespan).toBe(PieceLifespan.OutOnRundownEnd)
			}
		}
	})
})

describe('vMix recording', () => {
	it('recording piece is RECORDING on:true until rundown end', () => {
		const piece = createVmixRecordingPiece()
		expect(piece.lifespan).toBe(PieceLifespan.OutOnRundownEnd)
		const obj = (piece.content.timelineObjects ?? [])[0] as TimelineBlueprintExt<TSR.TimelineContentVMixRecording>
		expect(obj.layer).toBe(VMixLayers.VMixRecording)
		expect(obj.enable).toEqual({ while: 1 })
		expect(obj.content).toMatchObject({ type: TSR.TimelineContentTypeVMix.RECORDING, on: true })
	})

	it('maps the recording layer onto the vMix device', () => {
		const mappings = getVMixMappings(vmixStudioConfig.vmixSources, vmixStudioConfig.vmixProgram, 'vmix0')
		expect(mappings[VMixLayers.VMixRecording]?.options).toMatchObject({
			mappingType: TSR.MappingVmixType.Recording,
		})
	})

	it('onTake inserts the recording piece once, only on-air on vMix studios', async () => {
		const store: Record<string, unknown> = {}
		const playoutPersistentState = {
			getAll: () => store,
			getKey: (k: string) => store[k],
			setKey: (k: string, v: unknown) => {
				store[k] = v
			},
			setAll: (obj: Record<string, unknown>) => Object.assign(store, obj),
			getAllPublic: () => ({}),
			getKeyPublic: () => undefined,
			setKeyPublic: () => undefined,
			setAllPublic: () => undefined,
		}
		const makeContext = (config: StudioConfig, isRehearsal: boolean) => {
			const inserted: IBlueprintPiece[] = []
			const context = {
				getStudioConfig: () => ({ studio: config }),
				getShowStyleConfig: () => ({ dvePresets: {} }),
				isRehearsal,
				insertPiece: async (_part: 'current' | 'next', piece: IBlueprintPiece) => {
					inserted.push(piece)
					return {}
				},
			}
			return { context: context as unknown as IOnTakeContext, inserted }
		}

		// On-air take on a vMix studio → recording piece is inserted exactly once.
		const onAir = makeContext(vmixStudioConfig, false)
		await baseManifest.onTake?.(onAir.context, playoutPersistentState as never)
		expect(onAir.inserted).toHaveLength(1)
		await baseManifest.onTake?.(onAir.context, playoutPersistentState as never)
		expect(onAir.inserted).toHaveLength(1)

		// Rehearsal take → no recording.
		const rehearsal = makeContext(vmixStudioConfig, true)
		await baseManifest.onTake?.(rehearsal.context, playoutPersistentState as never)
		expect(rehearsal.inserted).toHaveLength(0)

		// Non-vMix studio → no recording.
		const atem = makeContext(hybridCasparConfig, false)
		await baseManifest.onTake?.(atem.context, playoutPersistentState as never)
		expect(atem.inserted).toHaveLength(0)
	})
})
