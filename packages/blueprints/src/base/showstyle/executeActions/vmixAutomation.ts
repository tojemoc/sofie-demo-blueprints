import {
	IActionExecutionContext,
	IBlueprintActionManifest,
	IBlueprintPiece,
	TSR,
} from '@sofie-automation/blueprints-integration'
import {
	StudioConfig,
	VisionMixerDevice,
	VmixAutomationAction,
	VmixAutomationMacro,
	VmixAutomationStep,
} from '../../studio/helpers/config.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { literal, t } from '../../../common/util.js'
import {
	createVMixAudioTimelineObject,
	createVMixInputPlaybackTimelineObject,
	createVMixOverlayOffTimelineObject,
	createVMixOverlayTimelineObject,
	createVMixPreviewTimelineObject,
	createVMixProgramCutPieceContent,
	getDefaultVmixAdlibLifespan,
} from '../helpers/vmixOperations.js'
import { isVmixStudio, resolveVmixInput, resolveVmixOverlayChannel } from '../helpers/vmixSources.js'
import { parseConfig } from '../helpers/config.js'

export const VMIX_MACRO_ACTION_PREFIX = 'vmixMacro:'

export function getVmixMacroActionId(macroKey: string): string {
	return `${VMIX_MACRO_ACTION_PREFIX}${macroKey}`
}

export function getMacroKeyFromActionId(actionId: string): string | undefined {
	if (!actionId.startsWith(VMIX_MACRO_ACTION_PREFIX)) return undefined
	return actionId.slice(VMIX_MACRO_ACTION_PREFIX.length)
}

export function getVmixAutomationActionManifests(
	config: StudioConfig,
	externalId: string
): IBlueprintActionManifest[] {
	if (!isVmixStudio(config)) return []

	return Object.entries(config.vmixAutomationMacros ?? {}).map(([macroKey, macro]) =>
		literal<IBlueprintActionManifest>({
			actionId: getVmixMacroActionId(macroKey),
			userData: { macroKey },
			userDataManifest: {},
			display: {
				label: t(macro.label),
				sourceLayerId: SourceLayer.GFX,
				outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			},
			externalId,
		})
	)
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function stepToTimelineObjects(config: StudioConfig, step: VmixAutomationStep, start: number) {
	const input = resolveVmixInput(config, step.sourceKey, step.input)
	if (input === undefined && step.action !== VmixAutomationAction.OverlayOff && step.action !== VmixAutomationAction.Wait) {
		return []
	}

	switch (step.action) {
		case VmixAutomationAction.ProgramCut:
			return createVMixProgramCutPieceContent(config, input!, start, step.volume)
		case VmixAutomationAction.PreviewInput:
			return [createVMixPreviewTimelineObject(input!, start)]
		case VmixAutomationAction.OverlayIn:
			return [
				createVMixOverlayTimelineObject(
					input!,
					resolveVmixOverlayChannel(config, step.sourceKey, step.overlayChannel),
					start
				),
			]
		case VmixAutomationAction.OverlayOut:
		case VmixAutomationAction.OverlayOff:
			return [
				createVMixOverlayOffTimelineObject(
					resolveVmixOverlayChannel(config, step.sourceKey, step.overlayChannel),
					start
				),
			]
		case VmixAutomationAction.AudioVolume:
			return [createVMixAudioTimelineObject(input!, step.volume ?? 100, step.fadeMs, start)]
		case VmixAutomationAction.VideoPlay:
			return [createVMixInputPlaybackTimelineObject(input!, true, false, start)]
		case VmixAutomationAction.VideoPause:
			return [createVMixInputPlaybackTimelineObject(input!, false, false, start)]
		case VmixAutomationAction.VideoRestart:
			return [createVMixInputPlaybackTimelineObject(input!, true, true, start)]
		default:
			return []
	}
}

async function executeHttpStep(context: IActionExecutionContext, url: string): Promise<void> {
	try {
		const response = await fetch(url)
		if (!response.ok) {
			context.notifyUserWarning(`HTTP ${response.status} for ${url}`)
		}
	} catch (err) {
		context.notifyUserWarning(`HTTP request failed: ${url}`)
		context.logWarning(`HTTP request failed: ${url} - ${err}`)
	}
}

async function executeTsrStep(
	context: IActionExecutionContext,
	config: StudioConfig,
	step: VmixAutomationStep
): Promise<void> {
	if (!step.tsrActionId) return

	const devices = await context.listPlayoutDevices()
	const vmixDevice = devices.find(
		(device) =>
			device.deviceType === TSR.DeviceType.VMIX && String(device.deviceId) === config.visionMixer.deviceId
	)
	if (!vmixDevice) {
		context.notifyUserWarning('vMix playout device not found for TSR action')
		return
	}

	await context.executeTSRAction(vmixDevice.deviceId, step.tsrActionId, step.tsrActionPayload ?? {})
}

export async function executeVmixAutomationMacro(
	context: IActionExecutionContext,
	macroKey: string
): Promise<void> {
	const config = parseConfig(context).studio
	if (config.visionMixer.type !== VisionMixerDevice.VMix) return

	const macro: VmixAutomationMacro | undefined = config.vmixAutomationMacros?.[macroKey]
	if (!macro) {
		context.notifyUserWarning(`Unknown vMix macro: ${macroKey}`)
		return
	}

	let timelineOffset = 0
	const timelineObjects = []

	for (const step of macro.steps) {
		if (step.action === VmixAutomationAction.Wait) {
			timelineOffset += step.delayMs ?? 0
			continue
		}

		if (step.action === VmixAutomationAction.HttpGet) {
			if (step.url) {
				if (timelineOffset > 0) await delay(timelineOffset)
				await executeHttpStep(context, step.url)
				timelineOffset = 0
			}
			continue
		}

		if (step.action === VmixAutomationAction.TsrAction) {
			if (timelineOffset > 0) await delay(timelineOffset)
			await executeTsrStep(context, config, step)
			timelineOffset = 0
			continue
		}

		timelineObjects.push(...stepToTimelineObjects(config, step, timelineOffset))
	}

	if (timelineObjects.length > 0) {
		const piece: IBlueprintPiece = {
			externalId: `vmix-macro-${macroKey}`,
			name: macro.label,
			lifespan: getDefaultVmixAdlibLifespan(),
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			enable: { start: 'now' },
			content: { timelineObjects },
		}
		await context.insertPiece('current', piece)
	}
}
