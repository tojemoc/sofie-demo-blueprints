import { IBlueprintPiece, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage, toCasparPlayPath } from './mediaPackages.js'

/** Caspar PLAY path for the LED headline pod underlay (PNG under ILU movs). */
export const LED_POD_HEADLINE_FILE = 'assets/pod_headline'

/**
 * Segments that show opening headlines on LED (pod under ILU movs).
 */
export function segmentUsesLedPodHeadline(segment: { name?: string; externalId?: string }): boolean {
	const haystack = `${segment.externalId ?? ''} ${segment.name ?? ''}`.trim()
	if (!haystack) return false
	if (/\bseg-headlines?\b/i.test(haystack)) return true
	return /(?<![\p{L}\p{N}])(?:headlines?|titulky)(?![\p{L}\p{N}])/iu.test(haystack)
}

/**
 * LED layer 112 — `assets/pod_headline` above bg_loop (110), under ILU (115).
 * WithinPart for headline block only.
 */
export function createLedPodHeadlinePiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_led_pod_headline`,
		name: 'LED pod headline',
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.LedPodHeadline,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.LedPodHeadline),
		content: {
			fileName: LED_POD_HEADLINE_FILE,
			ignoreMediaObjectStatus: true,
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: CasparCGLayers.CasparCGLedPodHeadline,
					priority: 1,
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						file: toCasparPlayPath(LED_POD_HEADLINE_FILE),
						loop: true,
					},
				}),
			],
		},
		prerollDuration: config.casparcgLatency,
		expectedPackages: [
			createMediaFileExpectedPackage(context, LED_POD_HEADLINE_FILE, [CasparCGLayers.CasparCGLedPodHeadline]),
		],
	})
}
