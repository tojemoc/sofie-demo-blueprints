import {
	SourceType,
	StudioConfig,
	VisionMixerDevice,
	VmixAutomationAction,
	VmixSourceCategory,
} from '../../../base/studio/helpers/config.js'

/**
 * Example vMix studio preset reflecting a large vMix project (~127 inputs).
 * Map your actual vMix input numbers and labels here — one entry per source you
 * want exposed on the Sofie shelf. You do not need to list all 127 inputs, only
 * those you want operators to control.
 */
export const VmixDemoStudioConfig: StudioConfig = {
	previewRenderer: 'sofie',
	casparcgLatency: 0,
	visionMixer: {
		type: VisionMixerDevice.VMix,
		host: '127.0.0.1',
		port: 8088,
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
	atemSources: {},
	atemOutputs: {},
	vmixSources: {
		cam1: {
			input: 1,
			type: SourceType.Camera,
			label: 'CAM 1',
			category: VmixSourceCategory.Video,
			tags: ['studio', 'debata', 'rozhovor'],
			defaultVolume: 100,
		},
		cam2: {
			input: 2,
			type: SourceType.Camera,
			label: 'CAM 2',
			category: VmixSourceCategory.Video,
			tags: ['studio', 'debata'],
			defaultVolume: 100,
		},
		cam3: {
			input: 3,
			type: SourceType.Camera,
			label: 'CAM 3',
			category: VmixSourceCategory.Video,
			tags: ['studio', 'rozhovor'],
			defaultVolume: 100,
		},
		cam4: {
			input: 4,
			type: SourceType.Camera,
			label: 'CAM 4',
			category: VmixSourceCategory.Video,
			tags: ['studio', 'debata'],
			defaultVolume: 100,
		},
		remote1: {
			input: 10,
			type: SourceType.Remote,
			label: 'Remote Guest 1',
			category: VmixSourceCategory.Video,
			tags: ['studio'],
		},
		stinger_spravy: {
			input: 20,
			type: SourceType.Graphics,
			label: 'Stinger Spravy',
			category: VmixSourceCategory.Technical,
			overlayChannel: 1,
			tags: ['spravy', 'stinger'],
		},
		headline_box: {
			input: 21,
			type: SourceType.Graphics,
			label: 'Headline Box',
			category: VmixSourceCategory.Graphics,
			overlayChannel: 2,
			tags: ['spravy', 'gfx'],
		},
		ilu_player: {
			input: 30,
			type: SourceType.MediaPlayer,
			label: 'ILU Video',
			category: VmixSourceCategory.Video,
			tags: ['spravy', 'ilu'],
		},
		dve_multiview: {
			input: 50,
			type: SourceType.MultiView,
			label: 'DVE MultiView',
			category: VmixSourceCategory.Technical,
			tags: ['studio', 'dve'],
		},
	},
	vmixAutomationMacros: {
		spravy_head_start: {
			label: 'SPRAVY Head Start',
			tags: ['spravy'],
			steps: [
				{ action: VmixAutomationAction.ProgramCut, sourceKey: 'cam1' },
				{ action: VmixAutomationAction.Wait, delayMs: 200 },
				{ action: VmixAutomationAction.OverlayIn, sourceKey: 'headline_box' },
				{ action: VmixAutomationAction.Wait, delayMs: 500 },
				{ action: VmixAutomationAction.OverlayIn, sourceKey: 'stinger_spravy' },
			],
		},
		studio_tv_on: {
			label: 'Studio TV ON',
			tags: ['studio-master'],
			steps: [
				{ action: VmixAutomationAction.ProgramCut, sourceKey: 'cam1' },
				{ action: VmixAutomationAction.AudioVolume, sourceKey: 'cam1', volume: 100, fadeMs: 500 },
			],
		},
		wait_n_cut_cam1: {
			label: 'Wait n Cut CAM1',
			tags: ['studio', 'rozhovor'],
			steps: [
				{ action: VmixAutomationAction.PreviewInput, sourceKey: 'cam1' },
				{ action: VmixAutomationAction.Wait, delayMs: 1000 },
				{ action: VmixAutomationAction.ProgramCut, sourceKey: 'cam1' },
			],
		},
	},
}
