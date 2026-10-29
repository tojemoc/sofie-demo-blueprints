import { BlueprintMapping, BlueprintMappings, LookaheadMode, TSR } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../common/util.js'
import { SourceType, StudioConfig } from '../../helpers/config.js'
import { VMixLayers } from '../../layers.js'
import { VmixInputConfig } from '../../../../$schemas/generated/main-studio-config.js'

export function getVMixMappings(
	vmixSources: StudioConfig['vmixSources'],
	vmixProgram: StudioConfig['vmixProgram'],
	deviceId = 'vmix0'
): BlueprintMappings {
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

	for (const [layer, input] of [
		[VMixLayers.VMixLookInputA, vmixProgram.lookAInput],
		[VMixLayers.VMixLookInputB, vmixProgram.lookBInput],
	] as const) {
		mappings[layer] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Input, index: '' + input },
		})
	}

	for (const [inputLayer, audioLayer, input] of [
		[VMixLayers.VMixBedA, VMixLayers.VMixBedAAudio, vmixProgram.bedAInput],
		[VMixLayers.VMixBedC, VMixLayers.VMixBedCAudio, vmixProgram.bedCInput],
	] as const) {
		mappings[inputLayer] = literal<BlueprintMapping<TSR.MappingVmixInput>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.Input, index: '' + input },
		})
		mappings[audioLayer] = literal<BlueprintMapping<TSR.MappingVmixAudioChannel>>({
			device: TSR.DeviceType.VMIX,
			deviceId,
			lookahead: LookaheadMode.NONE,
			options: { mappingType: TSR.MappingVmixType.AudioChannel, index: '' + input },
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
