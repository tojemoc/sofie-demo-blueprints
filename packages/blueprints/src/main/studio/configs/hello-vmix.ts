import { SourceType, StudioConfig, VisionMixerDevice } from '../../../base/studio/helpers/config.js'

/**
 * Studio configuration for the Hello vMix integration demonstration.
 *
 * Requires a vMix preset with inputs named exactly:
 * CAMERA, LOWER_THIRD, HEADLINE, DOUBLEBOX, BG_LOOP, MIX3_FEED
 */
export const HelloVmixStudioConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 0,
	visionMixer: {
		type: VisionMixerDevice.VMix,
		host: '127.0.0.1',
		port: 8099,
		deviceId: 'vmix0',
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
	vmixInputs: {
		CAMERA: {
			input: 'CAMERA',
		},
		LOWER_THIRD: {
			input: 'LOWER_THIRD',
			overlay: 1,
		},
		HEADLINE: {
			input: 'HEADLINE',
			overlay: 2,
		},
		DOUBLEBOX: {
			input: 'DOUBLEBOX',
		},
		BG_LOOP: {
			input: 'BG_LOOP',
			loop: true,
		},
		MIX3_FEED: {
			input: 'MIX3_FEED',
			mix: 3,
		},
	},
	atemOutputs: {},
	atemSources: {
		camera1: { input: 1, type: SourceType.Camera },
		camera2: { input: 2, type: SourceType.Camera },
		remote1: { input: 3, type: SourceType.Remote },
		mediaplayer: { input: 4, type: SourceType.MediaPlayer },
		graphics: { input: 5, type: SourceType.Graphics },
	},
}
