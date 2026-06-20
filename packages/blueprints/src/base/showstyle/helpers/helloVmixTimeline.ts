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

/** Map Rundown Editor graphic attribute keys to vMix Title field names (GT). */
const GRAPHIC_ATTRIBUTE_TO_VMIX_TEXT_FIELD: Record<string, Record<string, string>> = {
	LOWER_THIRD: {
		name: 'Name',
		description: 'Description',
	},
	HEADLINE: {
		text: 'Text',
	},
	STRAP: {
		location: 'Location',
		text: 'Text',
	},
}

export function mapGraphicAttributesToVmixText(
	registryKey: string,
	attributes: Record<string, unknown>
): TSR.VMixText | undefined {
	const aliases = GRAPHIC_ATTRIBUTE_TO_VMIX_TEXT_FIELD[registryKey] ?? {}
	const text: TSR.VMixText = {}

	for (const [key, value] of Object.entries(attributes)) {
		if (value === undefined || value === null || value === '') continue
		if (typeof value === 'boolean') continue

		const fieldName = aliases[key] ?? key
		text[fieldName] = String(value)
	}

	return Object.keys(text).length > 0 ? text : undefined
}

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

/**
 * Registry graphic: set GT text on the Title input, then take the configured overlay in.
 * Piece-level enable.start / enable.duration (from Rundown Editor start/duration) gate the whole sequence.
 */
export function createHelloVmixGraphicTimeline(
	config: StudioConfig,
	registryKey: string,
	attributes: Record<string, unknown>
): TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] {
	const entry = resolveVmixInput(config, registryKey)
	if (!entry) {
		throw new Error(`vmixInputs.${registryKey} is not configured`)
	}

	const timeline: TimelineBlueprintExt<TSR.TimelineContentVMixAny>[] = []
	const text = mapGraphicAttributesToVmixText(registryKey, attributes)

	if (text) {
		timeline.push(
			literal<TimelineBlueprintExt<TSR.TimelineContentVMixInput>>({
				id: '',
				enable: { start: 0 },
				layer: getVmixInputLayerId(registryKey),
				priority: 2,
				content: {
					deviceType: TSR.DeviceType.VMIX,
					type: TSR.TimelineContentTypeVMix.INPUT,
					text,
				},
			})
		)
	}

	timeline.push(...createHelloVmixOverlayTimeline(config, registryKey))

	return timeline
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
