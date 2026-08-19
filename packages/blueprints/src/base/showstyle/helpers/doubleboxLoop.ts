import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { ICommonContext } from '@sofie-automation/blueprints-integration'

/** Caspar PLAY path for the DoubleBox compositing frame (alpha loop, 32s, bg_loop baked in). */
export const DOUBLEBOX_LOOP_FILE = 'loops/db_loop'

/**
 * Create a piece that starts the DoubleBox compositing frame on PGM layer 118.
 * Placed on the Intro part so it fires on Take into intro and persists for the
 * rest of the rundown (OutOnRundownEnd). The alpha loop sits above ILU/CAM
 * (115/116) and below L3D (121), providing the blue animated border with cutouts.
 */
export function createDoubleBoxLoopPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_db_loop`,
		name: 'DoubleBox frame',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.VT,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.VT),
		content: {
			fileName: DOUBLEBOX_LOOP_FILE,
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: CasparCGLayers.CasparCGPgmDoubleBoxLoop,
					priority: 1,
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						file: DOUBLEBOX_LOOP_FILE,
						loop: true,
					},
				}),
			],
		},
		expectedPackages: [
			createMediaFileExpectedPackage(context, DOUBLEBOX_LOOP_FILE, [CasparCGLayers.CasparCGPgmDoubleBoxLoop], {
				includeSideEffects: true,
			}),
		],
		prerollDuration: config.casparcgLatency,
	})
}
