import { IBlueprintPiece, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage, toCasparPlayPath } from './mediaPackages.js'

/** Caspar PLAY path (no extension) — disk: `sofie-demo-media/assets/headline_sfx.wav`. */
export const HEADLINE_SFX_FILE = 'assets/headline_sfx'
/** Package Manager path must include the real `.wav` (extensionless assets/* default to `.mov`). */
const HEADLINE_SFX_PACKAGE_FILE = 'assets/headline_sfx.wav'

/**
 * One-shot SFX under each headline Take (PGM + LED audio beds).
 * WithinPart so each of the three HEADLINE parts fires a fresh PLAY.
 */
export function createHeadlineSfxPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	const file = toCasparPlayPath(HEADLINE_SFX_FILE)
	const timelineObjects: TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] = [
		CasparCGLayers.CasparCGAudioBedPgm,
		CasparCGLayers.CasparCGAudioBed,
	].map((layer) =>
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
			id: '',
			enable: { start: 0 },
			layer,
			priority: 2,
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				file,
				loop: false,
			},
		})
	)

	return literal<IBlueprintPiece>({
		enable: { start: 0 },
		externalId: `${partExternalId}_headline_sfx`,
		name: 'Headline SFX',
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.AudioBed,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.AudioBed),
		content: {
			fileName: HEADLINE_SFX_FILE,
			ignoreMediaObjectStatus: true,
			timelineObjects,
		},
		expectedPackages: [
			createMediaFileExpectedPackage(
				context,
				HEADLINE_SFX_PACKAGE_FILE,
				[CasparCGLayers.CasparCGAudioBedPgm, CasparCGLayers.CasparCGAudioBed],
				{ includeSideEffects: false }
			),
		],
		prerollDuration: config.casparcgLatency,
	})
}
