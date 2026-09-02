import { describe, expect, it } from 'vitest'
import {
	getPgmCameraMediaContentOptions,
	getPgmCameraProducer,
	getPgmCameraVideoFilter,
} from '../base/showstyle/helpers/pgmCamera.js'
import { hybridCasparConfig } from './helpers/smokeRundownIngest.js'
import { StudioConfig } from '../base/studio/helpers/config.js'

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
})
