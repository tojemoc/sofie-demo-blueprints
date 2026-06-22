import { SourceType, StudioConfig } from '../../studio/helpers/config.js'
import { InputConfig, VisionMixerDevice, VmixInputConfig } from '../../..//$schemas/generated/main-studio-config.js'

export interface RawSourceInfo {
	type: SourceType
	/** 1-based number */
	id: number
}

export interface SourceInfo extends RawSourceInfo {
	input: number
}

export function findSource(input: string | number | boolean | undefined, type: SourceType): RawSourceInfo | undefined {
	const match = (input + '').match(/(.*?)(\d+)(.*)/) // find the first number
	if (match) {
		return {
			id: Number(match[2]),
			type,
		}
	} else {
		return undefined
	}
}

export function getSourceInfoFromRaw(config: StudioConfig, rawInfo: RawSourceInfo): SourceInfo {
	let sourcesOfType: Array<InputConfig | VmixInputConfig>

	if (config.visionMixer.type === VisionMixerDevice.VMix) {
		if (!config.vmixSources) {
			return { ...rawInfo, input: 0 }
		}
		sourcesOfType = Object.values<VmixInputConfig>(config.vmixSources).filter((s) => s.type === rawInfo.type)
	} else {
		sourcesOfType = Object.values<InputConfig>(config.atemSources).filter((s) => s.type === rawInfo.type)
	}

	const sourceIndex = rawInfo.id - 1
	if (sourceIndex < 0 || sourceIndex >= sourcesOfType.length) {
		return { ...rawInfo, input: 0 }
	}

	return {
		...rawInfo,
		input: sourcesOfType[sourceIndex]?.input ?? 0,
	}
}
