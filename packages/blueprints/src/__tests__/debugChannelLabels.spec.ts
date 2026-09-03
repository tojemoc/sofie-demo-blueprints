import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { createDebugChannelLabelTimeline } from '../base/showstyle/helpers/debugChannelLabels.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { hybridCasparConfig } from './helpers/smokeRundownIngest.js'

function templateLabels(config = hybridCasparConfig) {
	return createDebugChannelLabelTimeline(config).map((obj) => {
		const content = obj.content as TSR.TimelineContentCCGTemplate
		return {
			layer: obj.layer,
			label: (content.data as { label?: string }).label,
		}
	})
}

describe('createDebugChannelLabelTimeline', () => {
	it('emits nothing when debugChannelLabels is unset', () => {
		expect(createDebugChannelLabelTimeline(hybridCasparConfig)).toEqual([])
	})

	it('uses default hypercomposed channel numbers in burn-in text', () => {
		const hypercomposed = hybridCasparConfig.casparcg.hypercomposed ?? { ledChannel: 1, pgmChannel: 2 }
		expect(
			templateLabels({
				...hybridCasparConfig,
				casparcg: {
					...hybridCasparConfig.casparcg,
					hypercomposed: {
						...hypercomposed,
						debugChannelLabels: true,
					},
				},
			})
		).toEqual([
			{ layer: CasparCGLayers.CasparCGDebugLabelLed, label: '1. LED' },
			{ layer: CasparCGLayers.CasparCGDebugLabelPgm, label: '2. PGM' },
			{ layer: CasparCGLayers.CasparCGDebugLabelDoubleBox, label: '3. DoubleBox' },
			{ layer: CasparCGLayers.CasparCGDebugLabelFull, label: '4. Full' },
		])
	})

	it('uses remapped CasparCG channels in burn-in text', () => {
		expect(
			templateLabels({
				...hybridCasparConfig,
				casparcg: {
					...hybridCasparConfig.casparcg,
					hypercomposed: {
						ledChannel: 4,
						pgmChannel: 5,
						bgChannelA: 6,
						bgChannelB: 7,
						debugChannelLabels: true,
					},
				},
			})
		).toEqual([
			{ layer: CasparCGLayers.CasparCGDebugLabelLed, label: '4. LED' },
			{ layer: CasparCGLayers.CasparCGDebugLabelPgm, label: '5. PGM' },
			{ layer: CasparCGLayers.CasparCGDebugLabelDoubleBox, label: '6. DoubleBox' },
			{ layer: CasparCGLayers.CasparCGDebugLabelFull, label: '7. Full' },
		])
	})
})
