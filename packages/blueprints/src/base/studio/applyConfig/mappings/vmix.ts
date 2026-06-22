import { BlueprintMapping, BlueprintMappings, LookaheadMode, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { SourceType, StudioConfig } from '../../helpers/config.js'
import { VMixLayers } from '../../layers.js'
import { VmixInputConfig, VmixRegistryInputConfig } from '../../../../$schemas/generated/main-studio-config.js'
import {
	formatVmixMappingIndex,
	getVmixInputLayerId,
	getVmixMixPreviewLayerId,
	getVmixMixProgramLayerId,
	getVmixOverlayLayerId,
} from '../../helpers/vmixInputs.js'

function overlayMapping(deviceId: string, index: 1 | 2 | 3 | 4): BlueprintMapping<TSR.MappingVmixOverlay> {
	return literal<BlueprintMapping<TSR.MappingVmixOverlay>>({
		device: TSR.DeviceType.VMIX,
		deviceId,
		lookahead: LookaheadMode.NONE,
		options: { mappingType: TSR.MappingVmixType.Overlay, index },
	})
}

export function getVMixMappings(config: StudioConfig): BlueprintMappings {
	const vmixSources = config.vmixSources
	const deviceId = config.visionMixer.deviceId
	const mappings: BlueprintMappings = {
		[VMixLayers.VMixMeProgram]: literal<BlueprintMapping<TSR.MappingVmixProgram>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Program, index: 1 },
		}),
		[VMixLayers.VMixMePreview]: literal<BlueprintMapping<TSR.MappingVmixPreview>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.WHEN_CLEAR,
			lookaheadMaxSearchDistance: 1,
			lookaheadDepth: 1,
			options: { mappingType: TSR.MappingVmixType.Preview, index: 1, disableDefaults: true },
		}),
		[VMixLayers.VMixOverlayGraphics]: overlayMapping(deviceId, 1),
		[VMixLayers.VMixOverlay2]: overlayMapping(deviceId, 2),
		[VMixLayers.VMixOverlay3]: overlayMapping(deviceId, 3),
		[VMixLayers.VMixOverlay4]: overlayMapping(deviceId, 4),
		[VMixLayers.VMixRecording]: literal<BlueprintMapping<TSR.MappingVmixRecording>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Recording },
		}),
		[VMixLayers.VMixStreaming]: literal<BlueprintMapping<TSR.MappingVmixStreaming>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Streaming },
		}),
		[VMixLayers.VMixExternal]: literal<BlueprintMapping<TSR.MappingVmixExternal>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.External },
		}),
		[VMixLayers.VMixFadeToBlack]: literal<BlueprintMapping<TSR.MappingVmixFadeToBlack>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.FadeToBlack },
		}),
	}

	for (const source of Object.values<VmixInputConfig>(vmixSources ?? {})) {
		mappings[`vmix_audio_${source.input}`] = literal<BlueprintMapping<TSR.MappingVmixAudioChannel>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingVmixType.AudioChannel,
				index: '' + source.input,
				inputLayer: source.inputLayer,
			},
		})
		mappings[`vmix_input_${source.input}`] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingVmixType.Input,
				index: '' + source.input,
			},
		})
	}

	const multiviewSource = Object.values<VmixInputConfig>(vmixSources ?? {}).find(
		(source) => source.type === SourceType.MultiView
	)
	if (multiviewSource) {
		mappings[VMixLayers.VMixDVEMultiView] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.WHEN_CLEAR,
			lookaheadMaxSearchDistance: 1,
			options: {
				mappingType: TSR.MappingVmixType.Input,
				index: '' + multiviewSource.input,
				disableDefaults: true,
			},
		})
	}

	const additionalMixBuses = new Set<number>()

	for (const [key, entry] of Object.entries<VmixRegistryInputConfig>(config.vmixInputs ?? {})) {
		mappings[getVmixInputLayerId(key)] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.WHEN_CLEAR,
			lookaheadMaxSearchDistance: 1,
			options: {
				mappingType: TSR.MappingVmixType.Input,
				index: formatVmixMappingIndex(entry.input),
				disableDefaults: true,
			},
		})

		if (entry.overlay !== undefined) {
			mappings[getVmixOverlayLayerId(key)] = literal<BlueprintMapping<TSR.MappingVmixOverlay>>({
				device: TSR.DeviceType.VMIX,
				deviceId,
				lookahead: LookaheadMode.NONE,
				options: {
					mappingType: TSR.MappingVmixType.Overlay,
					index: entry.overlay as 1 | 2 | 3 | 4,
				},
			})
		}

		if (entry.mix !== undefined && entry.mix > 1) {
			additionalMixBuses.add(entry.mix)
		}
	}

	for (const mix of additionalMixBuses) {
		const mixIndex = mix as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
		const programLayer = getVmixMixProgramLayerId(mix)
		const previewLayer = getVmixMixPreviewLayerId(mix)

		mappings[programLayer] = literal<BlueprintMapping<TSR.MappingVmixProgram>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Program, index: mixIndex },
		})

		mappings[previewLayer] = literal<BlueprintMapping<TSR.MappingVmixPreview>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.WHEN_CLEAR,
			lookaheadMaxSearchDistance: 1,
			lookaheadDepth: 1,
			options: { mappingType: TSR.MappingVmixType.Preview, index: mixIndex, disableDefaults: true },
		})
	}

	return mappings
}
