import { TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import {
	formatVmixMappingIndex,
	getVmixInputLayerId,
	getVmixMixProgramLayerId,
	getVmixOverlayLayerId,
	resolveVmixInput,
	VmixInputReference,
} from '../../studio/helpers/vmixInputs.js'
import { VMixLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { createVMixTimelineObjects } from './visionMixer.js'

export function resolveRegistryInput(config: StudioConfig, registryKey: string): VmixInputReference {
	const entry = resolveVmixInput(config, registryKey)
	if (!entry) {
		throw new Error(`vmixInputs.${registryKey} is not configured`)
	}
	return entry.input
}

export function createHelloVmixProgramTimeline(
	config: StudioConfig,
	registryKey: string
): TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] {
	const input = resolveRegistryInput(config, registryKey)
	return createVMixTimelineObjects(input)
}

export function createHelloVmixOverlayTimeline(
	config: StudioConfig,
	registryKey: string
): TimelineBlueprintExt<TSR.TimelineContentVMixOverlay>[] {
	const entry = resolveVmixInput(config, registryKey)
	if (!entry) {
		throw new Error(`vmixInputs.${registryKey} is not configured`)
	}

	const layer = entry.overlay ? getVmixOverlayLayerId(registryKey) : VMixLayers.VMixOverlayGraphics

	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixOverlay>>({
			id: '',
			enable: { while: 1 },
			layer,
			priority: 1,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.OVERLAY,
				input: formatVmixMappingIndex(entry.input) as number | string,
			},
		}),
	]
}

export function createHelloVmixMixProgramTimeline(
	config: StudioConfig,
	registryKey: string
): TimelineBlueprintExt<TSR.TimelineContentVMixProgram>[] {
	const entry = resolveVmixInput(config, registryKey)
	if (!entry) {
		throw new Error(`vmixInputs.${registryKey} is not configured`)
	}

	const mix = entry.mix ?? 1
	if (mix <= 1) {
		throw new Error(`vmixInputs.${registryKey}: mix must be greater than 1 for Mix program control`)
	}

	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixProgram>>({
			id: '',
			enable: { while: 1 },
			layer: getVmixMixProgramLayerId(mix),
			priority: 1,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.PROGRAM,
				input: formatVmixMappingIndex(entry.input) as number | string,
			},
		}),
	]
}

export function createHelloVmixInputPlaybackTimeline(
	config: StudioConfig,
	registryKey: string
): TimelineBlueprintExt<TSR.TimelineContentVMixInput>[] {
	const entry = resolveVmixInput(config, registryKey)
	if (!entry) {
		throw new Error(`vmixInputs.${registryKey} is not configured`)
	}

	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixInput>>({
			id: '',
			enable: { while: 1 },
			layer: getVmixInputLayerId(registryKey),
			priority: 1,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.INPUT,
				playing: true,
				loop: entry.loop ?? true,
			},
		}),
	]
}
