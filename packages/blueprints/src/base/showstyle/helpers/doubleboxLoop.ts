import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { ICommonContext } from '@sofie-automation/blueprints-integration'

/** Caspar PLAY path for the DoubleBox compositing frame (alpha loop; bg_loop baked in).
 * Production file may be named `dp_loop.mov` — place/rename as `loops/db_loop` under media-path
 * (or symlink). Studio override can be added later if hosts keep both names.
 */
export const DOUBLEBOX_LOOP_FILE = 'loops/db_loop'

/**
 * Create a piece that plays the DoubleBox compositing frame on the look's
 * DoubleBoxLoop layer (BG A/B layer 118) for this part only (WithinPart).
 * SYN / weather / outro are fullscreen and must not keep the cutout frame.
 * Headlines / post-intro MOD are fullscreen cam — they never call this helper.
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
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.PgmDoubleBoxLoop,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.PgmDoubleBoxLoop),
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
