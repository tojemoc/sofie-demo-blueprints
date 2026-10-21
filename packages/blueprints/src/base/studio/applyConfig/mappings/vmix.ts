import { BlueprintMapping, BlueprintMappings, LookaheadMode, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { SourceType, StudioConfig } from '../../helpers/config.js'
import { VMixLayers } from '../../layers.js'
import { VmixInputConfig } from '../../../../$schemas/generated/main-studio-config.js'
import { VMIX_BED_SOURCE_KEYS, VMIX_LOOK_SOURCE_KEYS } from '../../../showstyle/helpers/visionMixer.js'

export function getVMixMappings(vmixSources: StudioConfig['vmixSources'], deviceId = 'vmix0'): BlueprintMappings {
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

			options: { mappingType: TSR.MappingVmixType.Preview, index: 1 },
		}),
		[VMixLayers.VMixOverlayGraphics]: literal<BlueprintMapping<TSR.MappingVmixOverlay>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,

			options: { mappingType: TSR.MappingVmixType.Overlay, index: 1 },
		}),
	}

	for (const [layer, key] of [
		[VMixLayers.VMixLookInputA, VMIX_LOOK_SOURCE_KEYS.A],
		[VMixLayers.VMixLookInputB, VMIX_LOOK_SOURCE_KEYS.B],
	] as const) {
		const source = vmixSources[key] as VmixInputConfig | undefined
		if (!source) continue
		mappings[layer] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Input, index: '' + source.input },
		})
	}

	for (const [inputLayer, audioLayer, key] of [
		[VMixLayers.VMixBedA, VMixLayers.VMixBedAAudio, VMIX_BED_SOURCE_KEYS.A],
		[VMixLayers.VMixBedC, VMixLayers.VMixBedCAudio, VMIX_BED_SOURCE_KEYS.C],
	] as const) {
		const source = vmixSources[key] as VmixInputConfig | undefined
		if (!source) continue
		mappings[inputLayer] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Input, index: '' + source.input },
		})
		mappings[audioLayer] = literal<BlueprintMapping<TSR.MappingVmixAudioChannel>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.AudioChannel, index: '' + source.input },
		})
	}

	const multiviewSource = Object.values<VmixInputConfig>(vmixSources).find(
		(source) => source.type === SourceType.MultiView
	)
	if (multiviewSource) {
		/**
		 * Note that the word "MultiView" here does not refer to a traditional multiviewer used to monitor inputs and outputs in a studio.
		 * Instead, vMix uses this word to describe an input which has other inputs overlaid on top of it like a DVE.
		 * This is vMix's version of an ATEM SuperSource.
		 */
		mappings[VMixLayers.VMixDVEMultiView] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.WHEN_CLEAR,
			lookaheadMaxSearchDistance: 1,

			options: { mappingType: TSR.MappingVmixType.Input, index: '' + multiviewSource.input },
		})
	}

	return mappings
}
