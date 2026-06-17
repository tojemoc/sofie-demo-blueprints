import {
	StudioConfig,
	VmixRegistryInputConfig,
	PlayoutRouting,
} from '../../../$schemas/generated/main-studio-config.js'

export type VmixInputReference = number | string

export function resolveVmixInput(config: StudioConfig, key: string): VmixRegistryInputConfig | undefined {
	return config.vmixInputs?.[key]
}

export function getVmixInputLayerId(key: string): string {
	return `vmix_input_${normalizeRegistryKey(key)}`
}

export function getVmixOverlayLayerId(key: string): string {
	return `vmix_overlay_${normalizeRegistryKey(key)}`
}

export function getVmixMixProgramLayerId(mix: number): string {
	return mix === 1 ? 'vmix_me_program' : `vmix_mix${mix}_program`
}

export function getVmixMixPreviewLayerId(mix: number): string {
	return mix === 1 ? 'vmix_me_preview' : `vmix_mix${mix}_preview`
}

export function formatVmixMappingIndex(input: VmixInputReference): string {
	return typeof input === 'number' ? String(input) : input
}

export function hasVmixInputRegistry(config: StudioConfig): boolean {
	return Object.keys(config.vmixInputs ?? {}).length > 0
}

function normalizeRegistryKey(key: string): string {
	return key.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
}

export function validateVmixInputsRegistry(config: StudioConfig): string[] {
	const errors: string[] = []

	if (config.playoutRouting === PlayoutRouting.VmixRegistry && !hasVmixInputRegistry(config)) {
		errors.push(
			'vmixInputs must contain at least one entry when playout routing is set to vMix registry. If the vMix Input Registry table appears empty after saving, run Config Fix Up on the studio blueprint configuration page.'
		)
	}

	const normalizedKeyOwners = new Map<string, string>()

	for (const key of Object.keys(config.vmixInputs ?? {})) {
		const normalized = normalizeRegistryKey(key)
		const existing = normalizedKeyOwners.get(normalized)
		if (existing !== undefined && existing !== key) {
			errors.push(`vmixInputs registry key collision: "${existing}" and "${key}" both map to layer id "${normalized}"`)
		} else {
			normalizedKeyOwners.set(normalized, key)
		}
	}

	for (const [key, entry] of Object.entries<VmixRegistryInputConfig>(config.vmixInputs ?? {})) {
		if (entry.input === undefined || entry.input === '') {
			errors.push(`vmixInputs.${key}: input is required`)
		}
		if (entry.overlay !== undefined && (entry.overlay < 1 || entry.overlay > 4)) {
			errors.push(`vmixInputs.${key}: overlay must be between 1 and 4`)
		}
		if (entry.mix !== undefined && (entry.mix < 1 || entry.mix > 16)) {
			errors.push(`vmixInputs.${key}: mix must be between 1 and 16`)
		}
	}

	return errors
}
