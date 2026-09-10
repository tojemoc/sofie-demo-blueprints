import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import {
	createDoubleBoxBaselineCameraTimeline,
	getPgmCameraMediaContentOptions,
	getPgmCameraProducer,
	getPgmCameraVideoFilter,
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
