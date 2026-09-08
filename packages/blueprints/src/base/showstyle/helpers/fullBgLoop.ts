import { IBlueprintPiece, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { LED_BACKGROUND_LOOP_FILE } from '../rundown/baseline.js'

/** Same media as LED baseline — companion underlay on the Full look clip layer (ch4 / 110). */
export const FULL_BG_LOOP_FILE = LED_BACKGROUND_LOOP_FILE

/**
 * Full-look (BG B) companion `loops/bg_loop` under fullscreen cam (headlines / Privítanie).
 * Uses look clip layer {@link CasparCGLayers.CasparCGClipPlayer2} so
 * {@link remapLookLayers} sends it to ClipPlayer2B on Full. WithinPart so SYN/VT
 * can take the same clip layer for story media without fighting an OutOnRundownEnd loop.
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
					layer: CasparCGLayers.CasparCGClipPlayer2,
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
			createMediaFileExpectedPackage(context, FULL_BG_LOOP_FILE, [CasparCGLayers.CasparCGClipPlayer2], {
				includeSideEffects: true,
			}),
		],
		prerollDuration: config.casparcgLatency,
	})
}
