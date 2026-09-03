import { SourceType, StudioConfig, VisionMixerDevice } from '../../../base/studio/helpers/config.js'

export const DemoStudioConfig: StudioConfig = {
	previewRenderer: 'sofie',
	casparcgLatency: 0,
	casparcgMediaFolder: 'c:/casparcg/sofie-demo-media',
	ingestMediaFolder: 'c:/casparcg/sofie-demo-media',
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
			// Caspar PLAY on look camera layer when a camera piece is Taken (camNo 1 = Camera A in smoke).
			pgmCameraProducer: 'dshow://video=OBS Virtual Camera',
			// Burn-in "1. LED" / "2. PGM" / "3. DoubleBox" / "4. Full" on layer 990 (needs gfx/debug-channel-label).
			debugChannelLabels: false,
		},
	},
	sisyfosSources: {},
	vmixSources: {},
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
