import { SourceType, StudioConfig, VisionMixerDevice } from '../../../base/studio/helpers/config.js'

export const DemoStudioConfig: StudioConfig = {
	previewRenderer: 'sofie',
	casparcgLatency: 0,
	casparcgMediaFolder: 'y:/360-ingest/sofie-demo-media',
	ingestMediaFolder: 'y:/360-ingest/sofie-demo-media',
	// Ops: Package Manager must read the SAME tree Caspar plays (e.g. Y:/360-ingest/sofie-demo-media).
	// If these stay on c:/casparcg/... while Caspar media-path is Y:, Sofie shows false
	// "Voice Over / ILU / Lower Third can't be found" while AMCP PLAY still succeeds.
	httpProxyBaseUrl: 'http://localhost:8080/package',
	visionMixer: {
		type: VisionMixerDevice.Atem,
		host: '0.0.0.0',
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
		hypercomposed: {
			ledChannel: 1,
			pgmChannel: 2,
			bgChannelA: 3,
			bgChannelB: 4,
			// ATEM-classic map (route bus on ch2, looks on ch3/4). vMix studios must
			// remap to pgmChannel 4 (clean GFX = NDI GFX), bgChannelA 2 / bgChannelB 3
			// (looks = NDI A / NDI B) so vmixProgram inputs 2/3/4 line up — otherwise
			// look content feeds the clean-GFX input and PGM graphics feed look A.
			camIngestChannel: 5,
			// Opened once on ch5 ingest; look 3/4-115 PLAY route://5 (never a second DeckLink).
			pgmCameraProducer: 'dshow://video=OBS Virtual Camera',
			// Burn-in "1. LED" … "5. CAM" on layer 990 (needs gfx/debug-channel-label).
			debugChannelLabels: false,
		},
	},
	sisyfosSources: {},
	vmixSources: {},
	vmixProgram: {
		cameraInput: 1,
		// lookAInput/lookBInput are the composite Virtual inputs in the vMix preset:
		// blueprints place the camera on layer 1 and the NDI look feed on layer 2.
		lookAInput: 7,
		lookBInput: 8,
		// Raw NDI feeds of the Caspar look channels, keyed over the camera through the
		// transparent cutout. Must differ from lookAInput/lookBInput or the overlay is off.
		lookAFeedInput: 2,
		lookBFeedInput: 3,
		cleanGfxInput: 4,
		bedAInput: 5,
		bedCInput: 6,
	},
	atemOutputs: {},
	atemSources: {
		camera1: { input: 1, type: SourceType.Camera },
		camera2: { input: 2, type: SourceType.Camera },
		camera3: { input: 3, type: SourceType.Camera },
		camera4: { input: 4, type: SourceType.Camera },
		remote1: { input: 5, type: SourceType.Remote },
		remote2: { input: 6, type: SourceType.Remote },
		mediaplayer: { input: 7, type: SourceType.MediaPlayer },
		graphics: { input: 8, type: SourceType.Graphics },
	},
}
