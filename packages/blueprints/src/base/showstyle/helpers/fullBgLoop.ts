import { IBlueprintPiece, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { LED_BACKGROUND_LOOP_FILE } from '../rundown/baseline.js'

/** Same media as LED baseline — sticky underlay on look bg_loop layer (ch3/4 · 110). */
export const FULL_BG_LOOP_FILE = LED_BACKGROUND_LOOP_FILE

/**
 * Look companion `loops/bg_loop` on the dedicated bg_loop layer (110), under SYN clips
 * (111) and CAM (115). Uses {@link CasparCGLayers.CasparCGLookBgLoop} so
 * {@link remapLookLayers} sends it to LookBgLoopB on Full. Baseline already PLAYs
 * sticky loops on both looks; this WithinPart piece re-asserts under weather /
 * headlines when a higher-priority EMPTY would otherwise win.
 */
export function createFullBgLoopPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_full_bg_loop`,
		name: 'Full bg_loop',
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.FullBgLoop,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.FullBgLoop),
		content: {
			fileName: FULL_BG_LOOP_FILE,
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: CasparCGLayers.CasparCGLookBgLoop,
					priority: 1,
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						file: FULL_BG_LOOP_FILE,
						loop: true,
					},
				}),
			],
		},
		expectedPackages: [
			createMediaFileExpectedPackage(context, FULL_BG_LOOP_FILE, [CasparCGLayers.CasparCGLookBgLoop], {
				includeSideEffects: true,
			}),
		],
		prerollDuration: config.casparcgLatency,
	})
}
