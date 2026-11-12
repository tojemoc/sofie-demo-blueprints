import { beforeAll, describe, expect, it } from 'vitest'

import {
	BlueprintPlayoutPersistentStore,
	IBlueprintPiece,
	IOnSetAsNextContext,
	IOnTakeContext,
	PieceLifespan,
	TSR,
} from '@sofie-automation/blueprints-integration'

import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import {
	CALIBRATION_FRAME_FILE,
	createStudioCalibrationClearPiece,
	createVmixRecordingPiece,
	LED_TEST_FRAME_FILE,
} from '../base/showstyle/helpers/studioCalibration.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { getBaseline } from '../base/showstyle/rundown/baseline.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { getCasparCGMappings } from '../base/studio/applyConfig/mappings/casparcg.js'
import { PGM_DOUBLEBOX_CAMERA_FILL } from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import { getVMixMappings } from '../base/studio/applyConfig/mappings/vmix.js'
import { TimelineBlueprintExt } from '../base/studio/customTypes.js'
import { StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers, VMixLayers } from '../base/studio/layers.js'
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

/** Baseline timeline objects for the given studio config. */
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
		// Feed mode: camera on layer 1 + look feed on layer 2 (baseline B keeps the
		// pre-first-Take calibration camera on layer 3).
		expect(layers?.[1]?.input).toBe(vmixStudioConfig.vmixProgram.cameraInput)
		expect(layers?.[2]?.input).toBe(vmixStudioConfig.vmixProgram.lookBFeedInput)
		expect(layers?.[3]?.input).toBe(vmixStudioConfig.vmixProgram.cameraInput)
		const lookA = objs.find((obj) => obj.layer === VMixLayers.VMixLookInputA)
		const layersA = (lookA?.content as TSR.TimelineContentVMixInput)?.layers
		expect(layersA?.[1]?.input).toBe(vmixStudioConfig.vmixProgram.cameraInput)
		expect(layersA?.[2]?.input).toBe(vmixStudioConfig.vmixProgram.lookAFeedInput)
		expect(layersA?.[3]).toBeUndefined()
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
		expect(piece.extendOnHold).not.toBe(true)
		expect(piece.sourceLayerId).not.toBe(VMixLayers.VMixRecording)
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

	/** Persistent-state store stub preloaded with `initial`. */
	const makePersistentState = (initial: Record<string, unknown> = {}) => {
		const store = { ...initial }
		return {
			getKey: (key: string) => store[key],
			setKey: (key: string, value: unknown) => {
				store[key] = value
			},
		} as unknown as BlueprintPlayoutPersistentStore<{ vmixRecordingStarted?: boolean }>
	}

	/** onTake context stub: records inserted pieces and reports next-part source layers. */
	const makeTakeContext = (config: StudioConfig, isRehearsal: boolean, nextSourceLayerIds: string[] = []) => {
		const inserted: IBlueprintPiece[] = []
		const context = {
			getStudioConfig: () => ({ studio: config }),
			getShowStyleConfig: () => ({ dvePresets: {} }),
			isRehearsal,
			getPartInstance: async (_part: 'current' | 'next') => ({ rehearsal: isRehearsal, part: {} }),
			getPieceInstances: async (_part: 'current' | 'next') =>
				nextSourceLayerIds.map((sourceLayerId) => ({
					_id: sourceLayerId,
					piece: { sourceLayerId, content: {} },
				})),
			insertPiece: async (_part: 'current' | 'next', piece: IBlueprintPiece) => {
				inserted.push(piece)
				return {}
			},
			updatePieceInstance: async () => ({}),
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
		/**
		 * onSetAsNext context for a nexted part; `nextSourceLayerIds` / `nextPieces`
		 * pre-seed its piece instances, `inserted`/`removed` capture mutations.
		 */
		const makeContext = (
			config: StudioConfig,
			nextSourceLayerIds: string[] = [],
			nextRehearsal = false,
			nextExpectedDuration?: number,
			nextPieces: Array<Record<string, unknown>> = []
		) => {
			const inserted: IBlueprintPiece[] = []
			const removed: string[] = []
			const context = {
				getStudioConfig: () => ({ studio: config }),
				getShowStyleConfig: () => ({ dvePresets: {} }),
				getPartInstance: async (_part: 'current' | 'next') => ({
					rehearsal: nextRehearsal,
					part: { expectedDuration: nextExpectedDuration },
				}),
				getPieceInstances: async (_part: 'current' | 'next') => [
					...nextSourceLayerIds.map((sourceLayerId) => ({
						_id: sourceLayerId,
						piece: { sourceLayerId, content: {} },
					})),
					...nextPieces,
				],
				insertPiece: async (_part: 'next', piece: IBlueprintPiece) => {
					inserted.push(piece)
					return {}
				},
				removePieceInstances: async (_part: 'current' | 'next', ids: string[]) => {
					removed.push(...ids)
					return ids
				},
			}
			return { context: context as unknown as IOnSetAsNextContext, inserted, removed }
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

		// Legacy `vmix_recording` source layer (part nexted before the layer
		// rename) → removed (its control object shadows the TSR layer) and a
		// fresh copy is inserted.
		const legacy = makeContext(vmixStudioConfig, [VMixLayers.VMixRecording])
		await baseManifest.onSetAsNext?.(legacy.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(legacy.removed).toEqual([VMixLayers.VMixRecording])
		expect(legacy.inserted).toHaveLength(1)

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

	it('caps the outro recording copy at the timed part duration', async () => {
		const outroPiece = {
			_id: 'outro-piece',
			piece: {
				sourceLayerId: SourceLayer.PgmIntro,
				content: {
					timelineObjects: [
						{
							layer: CasparCGLayers.CasparCGPgmIntroPlayer,
							content: { file: 'assets/outro' },
						},
					],
				},
			},
		}
		/**
		 * Context for the timed outro part (expectedDuration 6500); inserted pieces
		 * are appended to `nextPieces` so repeated onTake/onSetAsNext calls see the
		 * armed state, removed ids are spliced back out.
		 */
		const contextFactory = (
			sourceLayerIds: string[] = [],
			pieces: Array<{ _id: string; piece: { name?: string; sourceLayerId: string; content: object } }> = [
				outroPiece,
			]
		) => {
			const inserted: IBlueprintPiece[] = []
			const removed: string[] = []
			const nextPieces: Array<Record<string, unknown>> = [
				...sourceLayerIds.map((sourceLayerId) => ({
					_id: sourceLayerId,
					piece: { sourceLayerId, content: {} },
				})),
				...pieces,
			]
			const context = {
				getStudioConfig: () => ({ studio: vmixStudioConfig }),
				getShowStyleConfig: () => ({ dvePresets: {} }),
				getPartInstance: async () => ({ rehearsal: false, part: { expectedDuration: 6500 } }),
				getPieceInstances: async () => nextPieces,
				/** Records the piece and reflects it in `nextPieces` for later calls. */
				insertPiece: async (_part: 'next', piece: IBlueprintPiece) => {
					nextPieces.push({ _id: piece.externalId ?? `inserted_${nextPieces.length}`, piece })
					inserted.push(piece)
					return {}
				},
				/** Records the removed ids and splices them out of `nextPieces`. */
				removePieceInstances: async (_part: 'current' | 'next', ids: string[]) => {
					removed.push(...ids)
					for (const id of ids) {
						const index = nextPieces.findIndex((instance) => instance._id === id)
						if (index >= 0) nextPieces.splice(index, 1)
					}
					return ids
				},
			}
			return { context: context as unknown as IOnSetAsNextContext, inserted, removed }
		}

		const fresh = contextFactory()
		await baseManifest.onSetAsNext?.(fresh.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(fresh.inserted[0]?.enable).toEqual({ start: 0, duration: 6500 })

		// An existing copy may be a Core-continued infinite that updatePieceInstance
		// cannot touch → capped with a dedicated OFF object at the expected end.
		const continued = contextFactory([SourceLayer.VmixRecording])
		await baseManifest.onSetAsNext?.(continued.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(continued.inserted).toHaveLength(1)
		expect(continued.inserted[0]?.enable).toEqual({ start: 6460 })
		expect((continued.inserted[0]?.content.timelineObjects?.[0]?.content as { on?: boolean } | undefined)?.on).toBe(
			false
		)

		// A repeat ensure on the same part must not stack a second OFF piece —
		// the stop piece shares the recording source layer, so the presence
		// check alone cannot tell it apart from an unbounded copy.
		await baseManifest.onSetAsNext?.(continued.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(continued.inserted).toHaveLength(1)

		// Manual Take after onSetAsNext armed a bounded copy → that copy already
		// ends the recording at the expected duration, so the take must not add
		// a redundant OFF piece.
		const takeAfterArm = contextFactory()
		await baseManifest.onSetAsNext?.(takeAfterArm.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(takeAfterArm.inserted).toHaveLength(1)
		await baseManifest.onTake?.(
			takeAfterArm.context as unknown as IOnTakeContext,
			makePersistentState({ vmixRecordingStarted: true })
		)
		expect(takeAfterArm.inserted).toHaveLength(1)

		// Explicit outro identity survives normalization on the piece name — caps
		// even when the file no longer matches the outro regex.
		const namedOutro = contextFactory(
			[],
			[
				{
					_id: 'named-outro',
					piece: {
						name: 'Outro | assets/custom_close',
						sourceLayerId: SourceLayer.PgmIntro,
						content: { timelineObjects: [] },
					},
				},
			]
		)
		await baseManifest.onSetAsNext?.(namedOutro.context, makePersistentState({ vmixRecordingStarted: true }))
		expect(namedOutro.inserted[0]?.enable).toEqual({ start: 0, duration: 6500 })
	})
})

describe('countup hold on out-of-order navigation', () => {
	/** Persistent-state store stub preloaded with `initial`. */
	const makePersistentState = (initial: Record<string, unknown> = {}) => {
		const store = { ...initial }
		return {
			getKey: (key: string) => store[key],
			setKey: (key: string, value: unknown) => {
				store[key] = value
			},
		} as unknown as BlueprintPlayoutPersistentStore<{ countupPaused?: boolean; expectedNextPartId?: string }>
	}

	/**
	 * onSetAsNext context: `manuallySelected` mirrors Core's user-driven setNext,
	 * `currentPartId`/`nextPartId` are the underlying Part ids (a manual re-pick
	 * makes a new PartInstance over the same Part). `inserted` captures pieces.
	 */
	const makeContext = (
		config: StudioConfig,
		manuallySelected: boolean,
		currentPartId: string | undefined,
		nextPartId: string | undefined,
		nextPieceExternalIds: string[] = []
	) => {
		const inserted: IBlueprintPiece[] = []
		const context = {
			manuallySelected,
			getStudioConfig: () => ({ studio: config }),
			getShowStyleConfig: () => ({ dvePresets: {} }),
			getHashId: (id: string) => id,
			getPartInstance: async (part: 'current' | 'next') => {
				const partId = part === 'current' ? currentPartId : nextPartId
				return partId === undefined
					? undefined
					: { _id: `inst_${part}_${partId}_${Math.random()}`, part: { _id: partId } }
			},
			getPieceInstances: async (_part: 'current' | 'next') =>
				nextPieceExternalIds.map((externalId) => ({ _id: externalId, piece: { externalId, content: {} } })),
			insertPiece: async (_part: 'next', piece: IBlueprintPiece) => {
				inserted.push(piece)
				return {}
			},
		}
		return { context: context as unknown as IOnSetAsNextContext, inserted }
	}

	it('auto-next records the natural next; a manual re-pick of the same Part does not pause', async () => {
		// Auto selection (auto-next after a Take) records the natural next Part id.
		const auto = makeContext(hybridCasparConfig, false, 'cur', 'n1')
		const state = makePersistentState()
		await baseManifest.onSetAsNext?.(auto.context, state)
		expect(state.getKey('expectedNextPartId')).toBe('n1')
		expect(state.getKey('countupPaused')).toBeUndefined()
		expect(auto.inserted).toHaveLength(0)

		// Re-affirming that same next part by hand (new PartInstance, same Part)
		// does not break story order → no pause, no hold piece.
		const reaffirm = makeContext(hybridCasparConfig, true, 'cur', 'n1')
		await baseManifest.onSetAsNext?.(reaffirm.context, state)
		expect(state.getKey('countupPaused')).toBeUndefined()
		expect(reaffirm.inserted).toHaveLength(0)
	})

	it('a manual jump to a different Part while on air latches and arms the hold piece', async () => {
		const state = makePersistentState({ expectedNextPartId: 'n1' })
		const jump = makeContext(hybridCasparConfig, true, 'cur', 'n5')
		await baseManifest.onSetAsNext?.(jump.context, state)
		expect(state.getKey('countupPaused')).toBe(true)
		expect(jump.inserted).toHaveLength(1)
		expect(jump.inserted[0]?.externalId?.endsWith('_countuphold')).toBe(true)
		expect(jump.inserted[0]?.lifespan).toBe(PieceLifespan.OutOnRundownEnd)
		expect(jump.inserted[0]?.sourceLayerId).toBe(SourceLayer.CountupHold)
		const obj = jump.inserted[0]?.content.timelineObjects?.[0]
		expect(obj?.layer).toBe(CasparCGLayers.CasparCGGraphicsLogo)
		expect(obj?.content).toMatchObject({ file: 'assets/countup', playing: false })

		// Later nexts keep the hold armed (pause persists across the rundown),
		// and a part already carrying a hold copy is not armed twice.
		const armedAgain = makeContext(hybridCasparConfig, false, 'n5', 'n6', ['n6_countuphold'])
		await baseManifest.onSetAsNext?.(armedAgain.context, state)
		expect(armedAgain.inserted).toHaveLength(0)
	})

	it('manual selection before the first Take never latches (no current part)', async () => {
		const state = makePersistentState()
		const preshow = makeContext(hybridCasparConfig, true, undefined, 'n1')
		await baseManifest.onSetAsNext?.(preshow.context, state)
		expect(state.getKey('countupPaused')).toBeUndefined()
		expect(preshow.inserted).toHaveLength(0)
	})
})
