import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { SourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { getCasparCGMappings, getHypercomposedChannels } from '../base/studio/applyConfig/mappings/casparcg.js'
import { LedChannelLayers, PgmChannelLayers } from '../base/studio/applyConfig/mappings/casparcgLayers.js'

const baseStudioConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 0,
	visionMixer: {
		type: VisionMixerDevice.Atem,
		host: '127.0.0.1',
		port: 9910,
		deviceId: 'atem0',
	},
	audioMixer: {
		host: 'localhost',
		port: 1176,
		deviceId: 'sisyfos0',
	},
	casparcg: {
		host: 'localhost',
		port: 5250,
	},
	sisyfosSources: {},
	vmixSources: {},
	atemOutputs: {},
	atemSources: {
		camera1: { input: 1, type: SourceType.Camera },
	},
}

function getMappingOptions(layer: CasparCGLayers, studioConfig: StudioConfig = baseStudioConfig) {
	const mappings = getCasparCGMappings({ studio: studioConfig })
	const mapping = mappings[layer]
	if (!mapping || mapping.options.mappingType !== TSR.MappingCasparCGType.Layer) {
		throw new Error(`Expected CasparCG layer mapping for ${layer}`)
	}
	return mapping.options
}

describe('casparcgMappings', () => {
	it('defaults hypercomposed channels to LED=1 and PGM=2', () => {
		expect(getHypercomposedChannels({ studio: baseStudioConfig })).toEqual({
			ledChannel: 1,
			pgmChannel: 2,
		})
	})

	it('uses configured hypercomposed channels when present', () => {
		const overrideConfig: StudioConfig = {
			...baseStudioConfig,
			casparcg: {
				...baseStudioConfig.casparcg,
				hypercomposed: {
					ledChannel: 4,
					pgmChannel: 5,
				},
			},
		}

		expect(getHypercomposedChannels({ studio: overrideConfig })).toEqual({
			ledChannel: 4,
			pgmChannel: 5,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer1, overrideConfig).channel).toBe(4)
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer2, overrideConfig).channel).toBe(5)
	})

	it('corrects identical LED and PGM channels to a distinct pair', () => {
		expect(
			getHypercomposedChannels({
				studio: {
					...baseStudioConfig,
					casparcg: {
						...baseStudioConfig.casparcg,
						hypercomposed: {
							ledChannel: 3,
							pgmChannel: 3,
						},
					},
				},
			})
		).toEqual({
			ledChannel: 3,
			pgmChannel: 4,
		})
	})

	it('routes LED stack (graphics, preview, primary clip) to channel 1', () => {
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer1)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.ClipPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayerPreview)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.ClipPreview,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGGraphicsLowerThird)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.GraphicsLowerThird,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGGraphicsLogo)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.GraphicsLogo,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGEffectsPlayer)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.EffectsPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGAudioBed)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.AudioBed,
		})
	})

	it('routes secondary clip player to PGM channel 2', () => {
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer2)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 2,
			layer: PgmChannelLayers.ClipPlayer,
		})
	})

	it('keeps HTML graphics layers distinct from clip player layer on LED channel', () => {
		const clipPlayerLayer = getMappingOptions(CasparCGLayers.CasparCGClipPlayer1).layer
		const gfxLayers = [
			getMappingOptions(CasparCGLayers.CasparCGGraphicsTicker).layer,
			getMappingOptions(CasparCGLayers.CasparCGGraphicsLowerThird).layer,
			getMappingOptions(CasparCGLayers.CasparCGGraphicsStrap).layer,
			getMappingOptions(CasparCGLayers.CasparCGGraphicsLogo).layer,
		]

		for (const layer of gfxLayers) {
			expect(layer).not.toBe(clipPlayerLayer)
		}
	})
})
