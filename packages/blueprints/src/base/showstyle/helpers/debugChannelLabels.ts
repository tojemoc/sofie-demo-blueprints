import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'

/** Caspar HTML template folder under template-path (copy from megarepo assets). */
export const DEBUG_CHANNEL_LABEL_TEMPLATE = 'gfx/debug-channel-label'

const DEBUG_LABELS: Array<{ layer: CasparCGLayers; label: string }> = [
	{ layer: CasparCGLayers.CasparCGDebugLabelLed, label: '1. LED' },
	{ layer: CasparCGLayers.CasparCGDebugLabelPgm, label: '2. PGM' },
	{ layer: CasparCGLayers.CasparCGDebugLabelDoubleBox, label: '3. DoubleBox' },
	{ layer: CasparCGLayers.CasparCGDebugLabelFull, label: '4. Full' },
]

/**
 * Burn-in channel names on layer 990 for playout debugging.
 * Requires `gfx/debug-channel-label` in Caspar template-path and
 * `casparcg.hypercomposed.debugChannelLabels: true`.
 */
export function createDebugChannelLabelTimeline(config: StudioConfig): TimelineBlueprintExt[] {
	if (!config.casparcg.hypercomposed?.debugChannelLabels) {
		return []
	}

	return DEBUG_LABELS.map(({ layer, label }) =>
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGTemplate>>({
			id: '',
			enable: { while: 1 },
			priority: 0,
			layer,
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.TEMPLATE,
				templateType: 'html',
				name: DEBUG_CHANNEL_LABEL_TEMPLATE,
				data: { label },
				useStopCommand: false,
			},
		})
	)
}
