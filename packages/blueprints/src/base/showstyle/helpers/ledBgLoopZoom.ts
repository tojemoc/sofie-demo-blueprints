import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { LED_BG_LOOP_TEMA_CROP, LED_BG_LOOP_TEMA_FILL } from '../../studio/applyConfig/mappings/casparcgLayers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { LED_BACKGROUND_LOOP_FILE } from '../rundown/baseline.js'

/**
 * Segments where LED `bg_loop` should be zoomed/cropped (tema + section blocks).
 * Matches smoke ids (`seg-tema-*` / `seg-sjv` / …) and display names (ŠPORT / Počasie).
 * Tip / avízo / outro keep the baseline fullscreen loop.
 */
export function segmentUsesLedBgLoopZoom(segment: { name?: string; externalId?: string }): boolean {
	const haystack = `${segment.externalId ?? ''} ${segment.name ?? ''}`
	if (!haystack.trim()) return false
	return /seg-tema|seg-sjv|seg-sport|seg-weather|\btema\b|sjv|sport|šport|pocasie|počasie|weather/i.test(haystack)
}

/**
 * Re-assert LED baseline `loops/bg_loop` with tema FILL+CROP on ClipPlayer1.
 * WithinPart — baseline fullscreen returns when the part ends (tip/outro/avízo).
 */
export function createLedBgLoopZoomPiece(config: StudioConfig, partExternalId: string): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_led_bg_zoom`,
		name: 'LED bg_loop (tema zoom)',
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.LedBgLoopZoom,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.LedBgLoopZoom),
		content: {
			fileName: LED_BACKGROUND_LOOP_FILE,
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: CasparCGLayers.CasparCGClipPlayer1,
					priority: 1,
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						file: LED_BACKGROUND_LOOP_FILE,
						loop: true,
						mixer: {
							fill: { ...LED_BG_LOOP_TEMA_FILL },
							crop: { ...LED_BG_LOOP_TEMA_CROP },
						},
					},
				}),
			],
		},
		prerollDuration: config.casparcgLatency,
	})
}
