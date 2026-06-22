import { SourceType, StudioConfig, VisionMixerDevice, VmixInputConfig } from '../../studio/helpers/config.js'
import { VMixLayers } from '../../studio/layers.js'

export interface ResolvedVmixSource extends VmixInputConfig {
	key: string
	displayName: string
}

export function isVmixStudio(config: StudioConfig): boolean {
	return config.visionMixer.type === VisionMixerDevice.VMix
}

export function getVmixSources(config: StudioConfig): ResolvedVmixSource[] {
	return Object.entries<VmixInputConfig>(config.vmixSources ?? {}).map(([key, source]) => ({
		key,
		...source,
		displayName: source.label ?? `${source.type} ${source.input}`,
	}))
}

export function resolveVmixInput(config: StudioConfig, sourceKey?: string, explicitInput?: number): number | undefined {
	if (explicitInput !== undefined) return explicitInput
	if (!sourceKey) return undefined

	const source = config.vmixSources?.[sourceKey]
	return source?.input
}

export function resolveVmixOverlayChannel(config: StudioConfig, sourceKey?: string, explicitChannel?: number): number {
	if (explicitChannel !== undefined) return explicitChannel

	if (sourceKey) {
		const source = config.vmixSources?.[sourceKey]
		if (source?.overlayChannel) return source.overlayChannel
		if (source?.type === SourceType.Graphics) return 1
	}

	return 1
}

export function getVmixLayerForOverlayChannel(channel: number): VMixLayers {
	switch (channel) {
		case 1:
			return VMixLayers.VMixOverlayGraphics
		case 2:
			return VMixLayers.VMixOverlay2
		case 3:
			return VMixLayers.VMixOverlay3
		case 4:
			return VMixLayers.VMixOverlay4
		default:
			return VMixLayers.VMixOverlayGraphics
	}
}
