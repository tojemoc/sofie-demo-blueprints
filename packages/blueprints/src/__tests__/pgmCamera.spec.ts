import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import {
	casparFormatToChannelFormat,
	createDoubleBoxBaselineCameraTimeline,
	createPgmCameraTimelineContent,
	getPgmCameraMediaContentOptions,
	getPgmCameraProducer,
	getPgmCameraVideoFilter,
	parseDecklinkProducer,
} from '../base/showstyle/helpers/pgmCamera.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { StudioConfig } from '../base/studio/helpers/config.js'
import { hybridCasparConfig } from './helpers/smokeRundownIngest.js'

describe('pgmCamera helpers', () => {
	it('reads producer from hypercomposed studio config', () => {
		expect(getPgmCameraProducer(hybridCasparConfig)).toBe('dshow://video=OBS Virtual Camera')
	})

	it('sets noStarttime on live dshow/v4l2 producers', () => {
		expect(getPgmCameraMediaContentOptions(hybridCasparConfig, 'dshow://video=OBS Virtual Camera')).toMatchObject({
			noStarttime: true,
		})
		expect(getPgmCameraMediaContentOptions(hybridCasparConfig, 'v4l2:///dev/video0')).toMatchObject({
			noStarttime: true,
		})
	})

	it('does not set noStarttime on file producers', () => {
		expect(getPgmCameraMediaContentOptions(hybridCasparConfig, 'clips/foo.mp4')).toEqual({})
	})

	it('forwards optional videoFilter from studio config', () => {
		const hypercomposed = hybridCasparConfig.casparcg.hypercomposed ?? { ledChannel: 1, pgmChannel: 2 }
		const config = {
			...hybridCasparConfig,
			casparcg: {
				...hybridCasparConfig.casparcg,
				hypercomposed: {
					...hypercomposed,
					pgmCameraVideoFilter: 'scale=1280:720',
				},
			},
		} as StudioConfig

		expect(getPgmCameraVideoFilter(config)).toBe('scale=1280:720')
		expect(getPgmCameraMediaContentOptions(config, 'dshow://video=OBS Virtual Camera')).toMatchObject({
			noStarttime: true,
			videoFilter: 'scale=1280:720',
		})
	})

	it('baselines warm DoubleBox CAM1 with DoubleBox FILL', () => {
		const warm = createDoubleBoxBaselineCameraTimeline(hybridCasparConfig)
		expect(warm?.layer).toBe(CasparCGLayers.CasparCGPgmCamera)
		expect(warm?.enable).toEqual({ while: 1 })
		expect(warm?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'dshow://video=OBS Virtual Camera',
			noStarttime: true,
			mixer: {
				fill: { x: 0.2, y: 0.072, xScale: 0.8, yScale: 0.8 },
			},
		})
	})

	it('parses DeckLink producer strings from studio config', () => {
		expect(parseDecklinkProducer('DECKLINK DEVICE 1 FORMAT 1080p5000')).toEqual({
			device: 1,
			format: '1080p5000',
		})
		expect(parseDecklinkProducer('DECKLINK 2 FORMAT 1080I5000')).toEqual({
			device: 2,
			format: '1080I5000',
		})
		expect(parseDecklinkProducer('dshow://video=OBS Virtual Camera')).toBeUndefined()
	})

	it('maps DeckLink to TSR INPUT (unquoted AMCP) instead of MEDIA clip path', () => {
		const content = createPgmCameraTimelineContent(hybridCasparConfig, 'DECKLINK DEVICE 1 FORMAT 1080p5000', {
			fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
		})
		expect(content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.INPUT,
			inputType: 'decklink',
			device: 1,
			deviceFormat: TSR.ChannelFormat.HD_1080P5000,
		})
		expect(casparFormatToChannelFormat('1080p5000')).toBe(TSR.ChannelFormat.HD_1080P5000)
	})

	it('baselines DeckLink CAM1 as structured INPUT', () => {
		const hypercomposed = hybridCasparConfig.casparcg.hypercomposed ?? { ledChannel: 1, pgmChannel: 2 }
		const config = {
			...hybridCasparConfig,
			casparcg: {
				...hybridCasparConfig.casparcg,
				hypercomposed: {
					...hypercomposed,
					pgmCameraProducer: 'DECKLINK DEVICE 1 FORMAT 1080p5000',
				},
			},
		} as StudioConfig
		const warm = createDoubleBoxBaselineCameraTimeline(config)
		expect(warm?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.INPUT,
			inputType: 'decklink',
			device: 1,
			deviceFormat: TSR.ChannelFormat.HD_1080P5000,
		})
	})

	it('skips warm DoubleBox CAM1 when producer unset', () => {
		const hypercomposed = hybridCasparConfig.casparcg.hypercomposed ?? { ledChannel: 1, pgmChannel: 2 }
		const config = {
			...hybridCasparConfig,
			casparcg: {
				...hybridCasparConfig.casparcg,
				hypercomposed: {
					...hypercomposed,
					pgmCameraProducer: '',
				},
			},
		} as StudioConfig
		expect(createDoubleBoxBaselineCameraTimeline(config)).toBeUndefined()
	})
})
