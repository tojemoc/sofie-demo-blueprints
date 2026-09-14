import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import {
	casparFormatToChannelFormat,
	createCameraIngestBaselineTimeline,
	createDoubleBoxBaselineCameraTimeline,
	createLookCameraTimelineContent,
	createPgmCameraTimelineContent,
	getCamIngestChannel,
	getPgmCameraMediaContentOptions,
	getPgmCameraProducer,
	getPgmCameraVideoFilter,
	parseDecklinkProducer,
	resolveDecklinkDeviceFormat,
} from '../base/showstyle/helpers/pgmCamera.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { StudioConfig } from '../base/studio/helpers/config.js'
import { hybridCasparConfig } from './helpers/smokeRundownIngest.js'

describe('pgmCamera helpers', () => {
	it('reads producer from hypercomposed studio config only', () => {
		expect(getPgmCameraProducer(hybridCasparConfig)).toBe('dshow://video=OBS Virtual Camera')
		expect(getCamIngestChannel(hybridCasparConfig)).toBe(5)
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

	it('baselines live dshow on CAM ingest ch5 — not on DoubleBox look A', () => {
		expect(createDoubleBoxBaselineCameraTimeline(hybridCasparConfig)).toBeUndefined()
		const ingest = createCameraIngestBaselineTimeline(hybridCasparConfig)
		expect(ingest?.layer).toBe(CasparCGLayers.CasparCGPgmCameraIngest)
		expect(ingest?.enable).toEqual({ while: 1 })
		expect(ingest?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'dshow://video=OBS Virtual Camera',
			noStarttime: true,
		})
	})

	it('look CAM for live producers is MEDIA route://5 with FILL (not DeckLink INPUT)', () => {
		const content = createLookCameraTimelineContent(hybridCasparConfig, 'dshow://video=OBS Virtual Camera', {
			fill: { x: 0.2, y: 0.072, xScale: 0.8, yScale: 0.8 },
		})
		expect(content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
			noStarttime: true,
			mixer: { fill: { x: 0.2, y: 0.072, xScale: 0.8, yScale: 0.8 } },
		})
		expect(content).not.toHaveProperty('inputType')
	})

	it('parses DeckLink only when config string is DeckLink AMCP', () => {
		expect(parseDecklinkProducer('DECKLINK DEVICE 1 FORMAT 1080p5000')).toEqual({
			device: 1,
			format: '1080p5000',
		})
		expect(parseDecklinkProducer('DECKLINK 2 FORMAT 1080I5000')).toEqual({
			device: 2,
			format: '1080I5000',
		})
		expect(parseDecklinkProducer('dshow://video=OBS Virtual Camera')).toBeUndefined()
		expect(parseDecklinkProducer('clips/cam.mov')).toBeUndefined()
	})

	it('emits MEDIA with exact dshow string on ingest — never invents DeckLink INPUT', () => {
		const content = createPgmCameraTimelineContent(hybridCasparConfig, 'dshow://video=OBS Virtual Camera')
		expect(content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'dshow://video=OBS Virtual Camera',
		})
		expect(content).not.toHaveProperty('inputType')
		expect(content).not.toHaveProperty('device')
	})

	it('maps DeckLink config string to INPUT on ingest using device/format from that string', () => {
		const content = createPgmCameraTimelineContent(hybridCasparConfig, 'DECKLINK DEVICE 1 FORMAT 1080p5000')
		expect(content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.INPUT,
			inputType: 'decklink',
			device: 1,
			deviceFormat: TSR.ChannelFormat.HD_1080P5000,
		})
		expect(casparFormatToChannelFormat('1080p5000')).toBe(TSR.ChannelFormat.HD_1080P5000)
		expect(content).not.toHaveProperty('file')
	})

	it('look CAM for DeckLink is route://5 — INPUT only on ingest baseline', () => {
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

		expect(createDoubleBoxBaselineCameraTimeline(config)).toBeUndefined()
		const ingest = createCameraIngestBaselineTimeline(config)
		expect(ingest?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.INPUT,
			inputType: 'decklink',
			device: 1,
		})
		expect(
			createLookCameraTimelineContent(config, 'DECKLINK DEVICE 1 FORMAT 1080p5000', {
				fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
			})
		).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://5',
			noStarttime: true,
		})
	})

	it('falls back to 1080P5000 when FORMAT token is unknown (never FORMAT INVALID)', () => {
		expect(resolveDecklinkDeviceFormat(undefined)).toBe(TSR.ChannelFormat.HD_1080P5000)
		expect(resolveDecklinkDeviceFormat('not-a-mode')).toBe(TSR.ChannelFormat.HD_1080P5000)
		expect(casparFormatToChannelFormat('not-a-mode')).toBe(TSR.ChannelFormat.INVALID)

		const content = createPgmCameraTimelineContent(hybridCasparConfig, 'DECKLINK DEVICE 3 FORMAT nope')
		expect(content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.INPUT,
			device: 3,
			deviceFormat: TSR.ChannelFormat.HD_1080P5000,
		})
	})

	it('baselines non-live file CAM on DoubleBox look A (not ingest)', () => {
		const hypercomposed = hybridCasparConfig.casparcg.hypercomposed ?? { ledChannel: 1, pgmChannel: 2 }
		const config = {
			...hybridCasparConfig,
			casparcg: {
				...hybridCasparConfig.casparcg,
				hypercomposed: {
					...hypercomposed,
					pgmCameraProducer: 'clips/cam_still',
				},
			},
		} as StudioConfig
		expect(createCameraIngestBaselineTimeline(config)).toBeUndefined()
		const warm = createDoubleBoxBaselineCameraTimeline(config)
		expect(warm?.layer).toBe(CasparCGLayers.CasparCGPgmCamera)
		expect(warm?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'clips/cam_still',
		})
		expect(
			createLookCameraTimelineContent(config, 'clips/cam_still', { fill: { x: 0, y: 0, xScale: 1, yScale: 1 } })
		).toMatchObject({
			file: 'clips/cam_still',
		})
	})

	it('skips ingest + DoubleBox CAM baselines when producer unset', () => {
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
		expect(createCameraIngestBaselineTimeline(config)).toBeUndefined()
		expect(createDoubleBoxBaselineCameraTimeline(config)).toBeUndefined()
	})
})
