import {
	BlueprintPlayoutPersistentStore,
	IBlueprintPiece,
	IOnSetAsNextContext,
	IOnTakeContext,
	PieceLifespan,
	TSR,
} from '@sofie-automation/blueprints-integration'
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

	const makePersistentState = (initial: Record<string, unknown> = {}) => {
		const store = { ...initial }
		return {
			getKey: (key: string) => store[key],
			setKey: (key: string, value: unknown) => {
				store[key] = value
			},
		} as unknown as BlueprintPlayoutPersistentStore<{ vmixRecordingStarted?: boolean }>
	}

	const makeTakeContext = (config: StudioConfig, isRehearsal: boolean, nextSourceLayerIds: string[] = []) => {
		const inserted: IBlueprintPiece[] = []
		const context = {
			getStudioConfig: () => ({ studio: config }),
			getShowStyleConfig: () => ({ dvePresets: {} }),
			isRehearsal,
			getPieceInstances: async (_part: 'current' | 'next') =>
				nextSourceLayerIds.map((sourceLayerId) => ({ piece: { sourceLayerId } })),
			insertPiece: async (_part: 'current' | 'next', piece: IBlueprintPiece) => {
				inserted.push(piece)
				return {}
			},
		}
		return { context: context as unknown as IOnTakeContext, inserted }
	}

	it('onTake inserts the recording piece on the first on-air Take and flags the show as recording', async () => {
		// First on-air take on a vMix studio → recording piece is inserted and
		// the persistent flag is set so onSetAsNext keeps arming parts.
		const playoutPersistentState = makePersistentState()
		const onAir = makeTakeContext(vmixStudioConfig, false)
		await baseManifest.onTake?.(onAir.context, playoutPersistentState)
		expect(onAir.inserted).toHaveLength(1)
		expect(playoutPersistentState.getKey('vmixRecordingStarted')).toBe(true)

		// Next take: still inserts if the taken part lacks one (auto-next can
		// land on a part that was nexted before the flag existed).
		const secondTake = makeTakeContext(vmixStudioConfig, false)
		await baseManifest.onTake?.(secondTake.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(secondTake.inserted).toHaveLength(1)

		// If the taken part already carries a recording piece (e.g. armed by
		// onSetAsNext or continued as an infinite), nothing is inserted — but
		// the flag still refreshes.
		const freshState = makePersistentState()
		const continued = makeTakeContext(vmixStudioConfig, false, [SourceLayer.VmixRecording])
		await baseManifest.onTake?.(continued.context, freshState)
		expect(continued.inserted).toHaveLength(0)
		expect(freshState.getKey('vmixRecordingStarted')).toBe(true)

		// Rehearsal take → no recording, no flag.
		const rehearsal = makeTakeContext(vmixStudioConfig, true)
		const rehearsalState = makePersistentState()
		await baseManifest.onTake?.(rehearsal.context, rehearsalState)
		expect(rehearsal.inserted).toHaveLength(0)
		expect(rehearsalState.getKey('vmixRecordingStarted')).toBeUndefined()

		// Non-vMix studio → no recording.
		const atem = makeTakeContext(hybridCasparConfig, false)
		await baseManifest.onTake?.(atem.context, makePersistentState())
		expect(atem.inserted).toHaveLength(0)
	})

	it('onSetAsNext arms nexted parts with the recording piece once the show is on air', async () => {
		const makeContext = (config: StudioConfig, nextSourceLayerIds: string[] = [], nextRehearsal = false) => {
			const inserted: IBlueprintPiece[] = []
			const context = {
				getStudioConfig: () => ({ studio: config }),
				getShowStyleConfig: () => ({ dvePresets: {} }),
				getPartInstance: async (_part: 'current' | 'next') => ({ rehearsal: nextRehearsal }),
				getPieceInstances: async (_part: 'current' | 'next') =>
					nextSourceLayerIds.map((sourceLayerId) => ({ piece: { sourceLayerId } })),
				insertPiece: async (_part: 'next', piece: IBlueprintPiece) => {
					inserted.push(piece)
					return {}
				},
			}
			return { context: context as unknown as IOnSetAsNextContext, inserted }
		}

		// Auto-next lands on a part armed while it was next → its own recording
		// piece starts at the boundary, so the intro's dying copy cannot stop it.
		const armed = makeContext(vmixStudioConfig)
		await baseManifest.onSetAsNext?.(armed.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(armed.inserted).toHaveLength(1)

		// Before the first on-air take (flag unset — e.g. activation, or a
		// rehearsal activation) → nothing is armed.
		const beforeFirstTake = makeContext(vmixStudioConfig)
		await baseManifest.onSetAsNext?.(beforeFirstTake.context, makePersistentState())
		expect(beforeFirstTake.inserted).toHaveLength(0)

		// Already armed (or continued as an infinite) → no duplicate.
		const already = makeContext(vmixStudioConfig, [SourceLayer.VmixRecording])
		await baseManifest.onSetAsNext?.(already.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(already.inserted).toHaveLength(0)

		// Playlist flipped to rehearsal while active (persistent flag left set)
		// → part instances created in rehearsal are not armed.
		const rehearsalPart = makeContext(vmixStudioConfig, [], true)
		await baseManifest.onSetAsNext?.(rehearsalPart.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(rehearsalPart.inserted).toHaveLength(0)

		// Non-vMix studio → no recording.
		const atem = makeContext(hybridCasparConfig)
		await baseManifest.onSetAsNext?.(atem.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(atem.inserted).toHaveLength(0)
	})
})
