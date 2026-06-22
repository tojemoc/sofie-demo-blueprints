import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { VMixLayers } from '../../studio/layers.js'
import { createVisionMixerObjects } from './visionMixer.js'
import { getVmixLayerForOverlayChannel } from './vmixSources.js'

export function createVMixPreviewTimelineObject(
	input: number,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixPreview> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixPreview>>({
		id: '',
		enable: { start },
		layer: VMixLayers.VMixMePreview,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.PREVIEW,
			input,
		},
		priority: 1,
	})
}

export function createVMixOverlayTimelineObject(
	input: number,
	overlayChannel: number,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixOverlay> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixOverlay>>({
		id: '',
		enable: { start },
		layer: getVmixLayerForOverlayChannel(overlayChannel) as VMixLayers,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.OVERLAY,
			input,
		},
		priority: 1,
	})
}

export function createVMixOverlayOffTimelineObject(
	overlayChannel: number,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixOverlay> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixOverlay>>({
		id: '',
		enable: { start },
		layer: getVmixLayerForOverlayChannel(overlayChannel) as VMixLayers,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.OVERLAY,
			input: 0,
		},
		priority: 1,
	})
}

export function createVMixAudioTimelineObject(
	input: number,
	volume: number,
	fadeMs?: number,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixAudio> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixAudio>>({
		id: '',
		enable: { start },
		layer: `vmix_audio_${input}`,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.AUDIO,
			volume,
			fade: fadeMs,
		},
		priority: 1,
	})
}

export function createVMixInputPlaybackTimelineObject(
	input: number,
	playing: boolean,
	restart = false,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixInput> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixInput>>({
		id: '',
		enable: { start },
		layer: `vmix_input_${input}`,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.INPUT,
			playing,
			restart,
		},
		priority: 1,
	})
}

export function createVMixRecordingTimelineObject(
	on: boolean,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixRecording> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixRecording>>({
		id: '',
		enable: { start },
		layer: VMixLayers.VMixRecording,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.RECORDING,
			on,
		},
		priority: 1,
	})
}

export function createVMixStreamingTimelineObject(
	on: boolean,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixStreaming> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixStreaming>>({
		id: '',
		enable: { start },
		layer: VMixLayers.VMixStreaming,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.STREAMING,
			on,
		},
		priority: 1,
	})
}

export function createVMixExternalTimelineObject(
	on: boolean,
	start = 0
): TimelineBlueprintExt<TSR.TimelineContentVMixExternal> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixExternal>>({
		id: '',
		enable: { start },
		layer: VMixLayers.VMixExternal,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.EXTERNAL,
			on,
		},
		priority: 1,
	})
}

export function createVMixProgramCutPieceContent(
	config: StudioConfig,
	input: number,
	start = 0,
	includeDefaultVolume?: number
): TimelineBlueprintExt[] {
	const timelineObjects: TimelineBlueprintExt[] = [...createVisionMixerObjects(config, input, start)]

	if (includeDefaultVolume !== undefined) {
		timelineObjects.push(createVMixAudioTimelineObject(input, includeDefaultVolume, 500, start))
	}

	return timelineObjects
}

export function getDefaultVmixAdlibLifespan(): PieceLifespan {
	return PieceLifespan.WithinPart
}
