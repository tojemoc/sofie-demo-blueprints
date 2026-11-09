import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { CasparCGLayers, VMixLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'

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
export function createStudioCalibrationClearPiece(partExternalId: string): IBlueprintPiece {
	const calibrationLayers: CasparCGLayers[] = [
		CasparCGLayers.CasparCGLedTestframe,
		CasparCGLayers.CasparCGLookCalibCam,
		CasparCGLayers.CasparCGLookCalibFrame,
	]
	return literal<IBlueprintPiece>({
		enable: { start: 0 },
		externalId: `${partExternalId}_calibration_clear`,
		name: 'Studio calibration clear',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.StudioCalibrationClear,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.StudioCalibrationClear),
		content: {
			timelineObjects: calibrationLayers.map((layer) =>
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
