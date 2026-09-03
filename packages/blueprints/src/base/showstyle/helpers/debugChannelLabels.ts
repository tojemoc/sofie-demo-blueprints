import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getHypercomposedChannels } from '../../studio/applyConfig/mappings/casparcg.js'

/** Caspar HTML template folder under template-path (copy from megarepo assets). */
export const DEBUG_CHANNEL_LABEL_TEMPLATE = 'gfx/debug-channel-label'

/**
 * Burn-in channel names on layer 990 for playout debugging.
 * Requires `gfx/debug-channel-label` in Caspar template-path and
 * `casparcg.hypercomposed.debugChannelLabels: true`.
 * Numeric prefixes follow the resolved LED / PGM / BG A / BG B channels.
 */
export function createDebugChannelLabelTimeline(config: StudioConfig): TimelineBlueprintExt[] {
	if (!config.casparcg.hypercomposed?.debugChannelLabels) {
		return []
	}

	const channels = getHypercomposedChannels({ studio: config })
	const debugLabels: Array<{ layer: CasparCGLayers; label: string }> = [
		{ layer: CasparCGLayers.CasparCGDebugLabelLed, label: `${channels.ledChannel}. LED` },
		{ layer: CasparCGLayers.CasparCGDebugLabelPgm, label: `${channels.pgmChannel}. PGM` },
		{ layer: CasparCGLayers.CasparCGDebugLabelDoubleBox, label: `${channels.bgChannelA}. DoubleBox` },
		{ layer: CasparCGLayers.CasparCGDebugLabelFull, label: `${channels.bgChannelB}. Full` },
	]

	return debugLabels.map(({ layer, label }) =>
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
