import { GraphicObjectBase } from '../../../common/definitions/objects.js'
import { PlayoutRouting, StudioConfig } from '../../studio/helpers/config.js'
import { hasVmixInputRegistry, resolveVmixInput } from '../../studio/helpers/vmixInputs.js'
import {
	createHelloVmixGraphicTimeline,
	createHelloVmixInputPlaybackTimeline,
	createHelloVmixOverlayTimeline,
	createHelloVmixProgramTimeline,
} from './helloVmixTimeline.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'

/** Well-known registry keys used by the Hello vMix smoke test and newsroom presets. */
export const VMIX_REGISTRY_KEYS = {
	CAMERA: 'CAMERA',
	LOWER_THIRD: 'LOWER_THIRD',
	HEADLINE: 'HEADLINE',
	DOUBLEBOX: 'DOUBLEBOX',
	BG_LOOP: 'BG_LOOP',
	STRAP: 'STRAP',
	TICKER: 'TICKER',
} as const

export type VmixRegistryKey = (typeof VMIX_REGISTRY_KEYS)[keyof typeof VMIX_REGISTRY_KEYS]

export function isVmixRegistryMode(config: StudioConfig): boolean {
	if (config.playoutRouting === PlayoutRouting.Hybrid) {
		return false
	}
	if (config.playoutRouting === PlayoutRouting.VmixRegistry) {
		return true
	}
	return hasVmixInputRegistry(config)
}

export function resolveGraphicPieceRegistryKey(object: GraphicObjectBase): string | undefined {
	const clipName = object.clipName.toLowerCase()

	if (clipName.includes('l3d')) {
		return VMIX_REGISTRY_KEYS.LOWER_THIRD
	}
	if (clipName.includes('head')) {
		return VMIX_REGISTRY_KEYS.HEADLINE
	}
	if (clipName.includes('strap')) {
		return VMIX_REGISTRY_KEYS.STRAP
	}
	if (clipName.includes('ticker')) {
		return VMIX_REGISTRY_KEYS.TICKER
	}

	return undefined
}

export function hasRegistryEntry(config: StudioConfig, registryKey: string): boolean {
	return resolveVmixInput(config, registryKey) !== undefined
}

export function createRegistryProgramTimeline(config: StudioConfig, registryKey: string): TimelineBlueprintExt[] {
	return createHelloVmixProgramTimeline(config, registryKey)
}

export function createRegistryOverlayTimeline(config: StudioConfig, registryKey: string): TimelineBlueprintExt[] {
	return createHelloVmixOverlayTimeline(config, registryKey)
}

export function createRegistryGraphicTimeline(
	config: StudioConfig,
	registryKey: string,
	attributes: Record<string, unknown>
): TimelineBlueprintExt[] {
	return createHelloVmixGraphicTimeline(config, registryKey, attributes)
}

export function createRegistryInputPlaybackTimeline(config: StudioConfig, registryKey: string): TimelineBlueprintExt[] {
	return createHelloVmixInputPlaybackTimeline(config, registryKey)
}
