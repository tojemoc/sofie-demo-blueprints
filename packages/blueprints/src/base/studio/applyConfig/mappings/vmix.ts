import { BlueprintMapping, BlueprintMappings, LookaheadMode, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { SourceType, StudioConfig } from '../../helpers/config.js'
import { VMixLayers } from '../../layers.js'
import { VmixInputConfig } from '../../../../$schemas/generated/main-studio-config.js'

function overlayMapping(index: 1 | 2 | 3 | 4): BlueprintMapping<TSR.MappingVmixOverlay> {
	return literal<BlueprintMapping<TSR.MappingVmixOverlay>>({
		device: TSR.DeviceType.VMIX,
		deviceId: 'vmix0',
		lookahead: LookaheadMode.NONE,
		options: { mappingType: TSR.MappingVmixType.Overlay, index },
	})
}

export function getVMixMappings(vmixSources: StudioConfig['vmixSources']): BlueprintMappings {
	const mappings: BlueprintMappings = {
		[VMixLayers.VMixMeProgram]: literal<BlueprintMapping<TSR.MappingVmixProgram>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Program, index: 1 },
		}),
		[VMixLayers.VMixMePreview]: literal<BlueprintMapping<TSR.MappingVmixPreview>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
			lookahead: LookaheadMode.WHEN_CLEAR,
			lookaheadMaxSearchDistance: 1,
			lookaheadDepth: 1,
			options: { mappingType: TSR.MappingVmixType.Preview, index: 1 },
		}),
		[VMixLayers.VMixOverlayGraphics]: overlayMapping(1),
		[VMixLayers.VMixOverlay2]: overlayMapping(2),
		[VMixLayers.VMixOverlay3]: overlayMapping(3),
		[VMixLayers.VMixOverlay4]: overlayMapping(4),
		[VMixLayers.VMixRecording]: literal<BlueprintMapping<TSR.MappingVmixRecording>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Recording },
		}),
		[VMixLayers.VMixStreaming]: literal<BlueprintMapping<TSR.MappingVmixStreaming>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Streaming },
		}),
		[VMixLayers.VMixExternal]: literal<BlueprintMapping<TSR.MappingVmixExternal>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.External },
		}),
		[VMixLayers.VMixFadeToBlack]: literal<BlueprintMapping<TSR.MappingVmixFadeToBlack>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.FadeToBlack },
		}),
	}

	for (const source of Object.values<VmixInputConfig>(vmixSources ?? {})) {
		mappings[`vmix_audio_${source.input}`] = literal<BlueprintMapping<TSR.MappingVmixAudioChannel>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
			lookahead: LookaheadMode.NONE,
			options: {
				mappingType: TSR.MappingVmixType.AudioChannel,
				index: '' + source.input,
				inputLayer: source.inputLayer,
			},
		})
		mappings[`vmix_input_${source.input}`] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId: 'vmix0',
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
			deviceId: 'vmix0',
			lookahead: LookaheadMode.WHEN_CLEAR,
			lookaheadMaxSearchDistance: 1,
			options: { mappingType: TSR.MappingVmixType.Input, index: '' + multiviewSource.input },
		})
	}

	return mappings
}
