import {
	SourceType,
	StudioConfig,
	VisionMixerDevice,
	VmixInputConfig,
} from '../../studio/helpers/config.js'

export interface ResolvedVmixSource extends VmixInputConfig {
	key: string
	displayName: string
}

export function isVmixStudio(config: StudioConfig): boolean {
	return config.visionMixer.type === VisionMixerDevice.VMix
}

export function getVmixSources(config: StudioConfig): ResolvedVmixSource[] {
	return Object.entries(config.vmixSources ?? {}).map(([key, source]) => ({
		key,
		...source,
		displayName: source.label ?? `${source.type} ${source.input}`,
	}))
}

export function resolveVmixInput(
	config: StudioConfig,
	sourceKey?: string,
	explicitInput?: number
): number | undefined {
	if (explicitInput !== undefined) return explicitInput
	if (!sourceKey) return undefined

	const source = config.vmixSources?.[sourceKey]
	return source?.input
}

export function resolveVmixOverlayChannel(
	config: StudioConfig,
	sourceKey?: string,
	explicitChannel?: number
): number {
	if (explicitChannel !== undefined) return explicitChannel

	if (sourceKey) {
		const source = config.vmixSources?.[sourceKey]
		if (source?.overlayChannel) return source.overlayChannel
		if (source?.type === SourceType.Graphics) return 1
	}

	return 1
}

export function getVmixLayerForOverlayChannel(channel: number): string {
	switch (channel) {
		case 1:
			return 'vmix_overlay_graphics'
		case 2:
			return 'vmix_overlay_2'
		case 3:
			return 'vmix_overlay_3'
		case 4:
			return 'vmix_overlay_4'
		default:
			return 'vmix_overlay_graphics'
	}
}
