import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'

import { literal } from '../../../common/util.js'
import { PGM_FULLSCREEN_CAMERA_FILL } from '../../studio/applyConfig/mappings/casparcgLayers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers, VMixLayers } from '../../studio/layers.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { vmixLayerTransformFromFill } from './pgmCamera.js'
import { getVmixCameraInput, getVmixLookFeedInput } from './visionMixer.js'

/**
 * Caspar PLAY path (no extension) for the pre-first-Take LED calibration frame.
 * Disk: `assets/testframe.png` in the studio CasparCG media folder.
 */
export const LED_TEST_FRAME_FILE = 'assets/testframe'

/**
 * Caspar PLAY path for the calibration DoubleBox frame — same file the show
 * DoubleBox pieces play (the `db_loop` alpha loop).
 */
export const CALIBRATION_FRAME_FILE = 'loops/db_loop'

/**
 * OutOnRundownEnd EMPTYs on the calibration layers so the baseline testframe /
 * look-B db_loop+cam die with the first Take, whichever part is taken first.
 * Emitted into every part — the spare calibration layers (LED 114, BG B 117/119)
 * are never touched by show pieces, so these clears cannot fight them.
 */
export function createStudioCalibrationClearPiece(partExternalId: string, config?: StudioConfig): IBlueprintPiece {
	const calibrationLayers: CasparCGLayers[] = [
		CasparCGLayers.CasparCGLedTestframe,
		CasparCGLayers.CasparCGLookCalibCam,
		CasparCGLayers.CasparCGLookCalibFrame,
	]
	// vMix feed mode: the pre-first-Take calibration camera is look-B input layer 3.
	// The baseline INPUT object is priority 0 while:1, so the first Take on slot B
	// wins by being a piece — but a first Take on slot A would leave layer 3 alive
	// on B (and B is the baseline program input). Re-assert the static baseline
	// layers {1: cam fullscreen, 2: feed} at priority 0: same layers, no layer 3.
	const calibrationInputObjects: TimelineBlueprintExt[] = []
	const feedB = config ? getVmixLookFeedInput(config, 'B') : 0
	const cameraInput = config ? getVmixCameraInput(config) : 0
	if (feedB > 0 && cameraInput > 0) {
		calibrationInputObjects.push(
			literal<TimelineBlueprintExt<TSR.TimelineContentVMixInput>>({
				id: '',
				enable: { while: 1 },
				layer: VMixLayers.VMixLookInputB,
				priority: 0,
				content: {
					deviceType: TSR.DeviceType.VMIX,
					type: TSR.TimelineContentTypeVMix.INPUT,
					layers: {
						1: { input: cameraInput, ...vmixLayerTransformFromFill(PGM_FULLSCREEN_CAMERA_FILL) },
						2: { input: feedB },
					},
				},
			})
		)
	}
	return literal<IBlueprintPiece>({
		enable: { start: 0 },
		externalId: `${partExternalId}_calibration_clear`,
		name: 'Studio calibration clear',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.StudioCalibrationClear,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.StudioCalibrationClear),
		content: {
			timelineObjects: [
				...calibrationLayers.map((layer) =>
					literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
						id: '',
						enable: { while: 1 },
						layer,
						priority: 2,
						content: {
							deviceType: TSR.DeviceType.CASPARCG,
							type: TSR.TimelineContentTypeCasparCg.MEDIA,
							file: 'EMPTY',
						},
					})
				),
				...calibrationInputObjects,
			],
		},
	})
}

/**
 * vMix `RECORDING { on: true }` — inserted into the taken part by `onTake` on
 * the first on-air Take (skipped in rehearsal), and armed into every nexted
 * part by `onSetAsNext` once the show is on air. Auto-next transitions never
 * call `onTake`, so arming at set-next time is what keeps recording alive
 * across them regardless of whether Core continues the previous copy as an
 * infinite — each copy dies at its part boundary while the next one starts at
 * the same instant. The last one leaves the timeline at outro end /
 * deactivate and emits STOP_RECORDING, so one show is one recording.
 */
export function createVmixRecordingPiece(durationMs?: number): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: { start: 0, ...(durationMs !== undefined ? { duration: durationMs } : {}) },
		externalId: 'first_take_vmix_recording',
		name: 'vMix recording',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.VmixRecording,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.VmixRecording),
		content: {
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentVMixRecording>>({
					id: '',
					enable: { while: 1 },
					layer: VMixLayers.VMixRecording,
					priority: 1,
					content: {
						deviceType: TSR.DeviceType.VMIX,
						type: TSR.TimelineContentTypeVMix.RECORDING,
						on: true,
					},
				}),
			],
		},
	})
}

/**
 * vMix `RECORDING { on: false }` scheduled at the outro's expected end. When a
 * recording copy is already armed in the part (e.g. a Core-continued infinite
 * that `updatePieceInstance` refuses to touch), this priority-2 OFF object wins
 * the layer at `startMs` and emits STOP_RECORDING without mutating the existing
 * piece. OutOnRundownEnd so a stray copy cannot re-enable recording afterwards.
 */
export function createVmixRecordingStopPiece(startMs: number): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		// Two frames before expectedDuration so the piece still lands inside the
		// part when auto-next would cut at exactly that instant.
		enable: { start: Math.max(0, startMs - 40) },
		externalId: 'outro_vmix_recording_stop',
		name: 'vMix recording stop',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.VmixRecording,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.VmixRecording),
		content: {
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentVMixRecording>>({
					id: '',
					enable: { while: 1 },
					layer: VMixLayers.VMixRecording,
					priority: 2,
					content: {
						deviceType: TSR.DeviceType.VMIX,
						type: TSR.TimelineContentTypeVMix.RECORDING,
						on: false,
					},
				}),
			],
		},
	})
}
