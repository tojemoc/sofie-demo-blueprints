import { LookaheadMode, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { SourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { getCasparCGMappings, getHypercomposedChannels } from '../base/studio/applyConfig/mappings/casparcg.js'
import {
	BgChannelLayers,
	LedChannelLayers,
	PgmChannelLayers,
} from '../base/studio/applyConfig/mappings/casparcgLayers.js'

const baseStudioConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 0,
	casparcgMediaFolder: 'c:/casparcg/sofie-demo-media',
	ingestMediaFolder: 'c:/casparcg/sofie-demo-media',
	httpProxyBaseUrl: 'http://localhost:8080/package',
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
	it('defaults hypercomposed channels to LED=1, PGM=2, BG A=3, BG B=4', () => {
		expect(getHypercomposedChannels({ studio: baseStudioConfig })).toEqual({
			ledChannel: 1,
			pgmChannel: 2,
			bgChannelA: 3,
			bgChannelB: 4,
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
					bgChannelA: 6,
					bgChannelB: 7,
				},
			},
		}

		expect(getHypercomposedChannels({ studio: overrideConfig })).toEqual({
			ledChannel: 4,
			pgmChannel: 5,
			bgChannelA: 6,
			bgChannelB: 7,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer1, overrideConfig).channel).toBe(4)
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmRoute, overrideConfig).channel).toBe(5)
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer2, overrideConfig).channel).toBe(6)
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer2B, overrideConfig).channel).toBe(7)
	})

	it('corrects identical LED and PGM channels to a distinct set', () => {
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
			bgChannelA: 5,
			bgChannelB: 6,
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
			channel: 2,
			layer: PgmChannelLayers.GraphicsLogo,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGEffectsPlayer)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.EffectsPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmEffectsPlayer)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 2,
			layer: PgmChannelLayers.EffectsPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmIntroPlayer)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 2,
			layer: PgmChannelLayers.IntroOverlay,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGAudioBed)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.AudioBed,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGAudioBedPgm)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 2,
			layer: PgmChannelLayers.AudioBed,
		})
	})

	it('routes PGM bus to channel 2 (route + logo above wipe)', () => {
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmRoute)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 2,
			layer: PgmChannelLayers.Route,
		})
		expect(PgmChannelLayers.GraphicsLogo).toBeGreaterThan(PgmChannelLayers.Route)
		expect(PgmChannelLayers.IntroOverlay).toBeGreaterThan(PgmChannelLayers.GraphicsLogo)
	})

	it('routes look A compose stack to BG channel 3', () => {
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer2)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 3,
			layer: BgChannelLayers.ClipPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmCamera)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 3,
			layer: BgChannelLayers.Camera,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmIluPlayer)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 3,
			layer: BgChannelLayers.IluPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmDoubleBoxLoop)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 3,
			layer: BgChannelLayers.DoubleBoxLoop,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGGraphicsPgmLowerThird)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 3,
			layer: BgChannelLayers.GraphicsLowerThird,
		})
	})

	it('routes look B compose stack to BG channel 4 with the same relative layers', () => {
		expect(getMappingOptions(CasparCGLayers.CasparCGClipPlayer2B)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 4,
			layer: BgChannelLayers.ClipPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmCameraB)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 4,
			layer: BgChannelLayers.Camera,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmIluPlayerB)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 4,
			layer: BgChannelLayers.IluPlayer,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGPgmDoubleBoxLoopB)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 4,
			layer: BgChannelLayers.DoubleBoxLoop,
		})
		expect(getMappingOptions(CasparCGLayers.CasparCGGraphicsPgmLowerThirdB)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 4,
			layer: BgChannelLayers.GraphicsLowerThird,
		})
	})

	it('routes ILU player above clip player on LED channel so FILL does not affect bg loop', () => {
		expect(getMappingOptions(CasparCGLayers.CasparCGIluPlayer)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 1,
			layer: LedChannelLayers.IluPlayer,
		})
		expect(LedChannelLayers.IluPlayer).toBeGreaterThan(LedChannelLayers.ClipPlayer)
		expect(LedChannelLayers.IluPlayer).toBeLessThan(LedChannelLayers.GraphicsTicker)
	})

	it('stacks DoubleBox story ILU above CAM on the look', () => {
		expect(BgChannelLayers.IluPlayer).toBeGreaterThan(BgChannelLayers.Camera)
		expect(BgChannelLayers.DoubleBoxLoop).toBeGreaterThan(BgChannelLayers.IluPlayer)
		expect(PgmChannelLayers.IluPlayer).toBeGreaterThan(PgmChannelLayers.Camera)
	})

	it('keeps HTML graphics layers distinct from clip player layer on LED channel', () => {
		const clipPlayerLayer = getMappingOptions(CasparCGLayers.CasparCGClipPlayer1).layer
		const iluPlayerLayer = getMappingOptions(CasparCGLayers.CasparCGIluPlayer).layer
		const gfxLayers = [
			getMappingOptions(CasparCGLayers.CasparCGGraphicsTicker).layer,
			getMappingOptions(CasparCGLayers.CasparCGGraphicsLowerThird).layer,
			getMappingOptions(CasparCGLayers.CasparCGGraphicsStrap).layer,
		]

		expect(iluPlayerLayer).not.toBe(clipPlayerLayer)
		for (const layer of gfxLayers) {
			expect(layer).not.toBe(clipPlayerLayer)
			expect(layer).not.toBe(iluPlayerLayer)
		}
	})

	it('preloads BG look mappings and does not lookahead the PGM route', () => {
		const mappings = getCasparCGMappings({ studio: baseStudioConfig })
		expect(mappings[CasparCGLayers.CasparCGClipPlayer2]?.lookahead).toBe(LookaheadMode.PRELOAD)
		expect(mappings[CasparCGLayers.CasparCGClipPlayer2B]?.lookahead).toBe(LookaheadMode.PRELOAD)
		expect(mappings[CasparCGLayers.CasparCGPgmCamera]?.lookahead).toBe(LookaheadMode.PRELOAD)
		expect(mappings[CasparCGLayers.CasparCGPgmRoute]?.lookahead).toBe(LookaheadMode.NONE)
		expect(mappings[CasparCGLayers.CasparCGGraphicsLogo]?.lookahead).toBe(LookaheadMode.NONE)
	})

	it('routes 360° sekúnd logo-bug to PGM (not LED, not BG look)', () => {
		expect(getMappingOptions(CasparCGLayers.CasparCGGraphicsLogo)).toEqual({
			mappingType: TSR.MappingCasparCGType.Layer,
			channel: 2,
			layer: PgmChannelLayers.GraphicsLogo,
		})
	})
})
