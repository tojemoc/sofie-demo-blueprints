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

export function getVmixAutomationActionManifests(config: StudioConfig, externalId: string): IBlueprintActionManifest[] {
	if (!isVmixStudio(config)) return []

	return Object.entries<VmixAutomationMacro>(config.vmixAutomationMacros ?? {}).map(([macroKey, macro]) =>
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

async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function insertQueuedTimelineObjects(
	context: IActionExecutionContext,
	macroKey: string,
	macroLabel: string,
	timelineObjects: IBlueprintPiece['content']['timelineObjects']
): Promise<void> {
	if (timelineObjects.length === 0) return

	const piece: IBlueprintPiece = {
		externalId: `vmix-macro-${macroKey}-${Date.now()}`,
		name: macroLabel,
		lifespan: getDefaultVmixAdlibLifespan(),
		sourceLayerId: SourceLayer.GFX,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
		enable: { start: 'now' },
		content: { timelineObjects: [...timelineObjects] },
	}
	await context.insertPiece('current', piece)
	timelineObjects.splice(0)
}

function stepToTimelineObjects(
	context: IActionExecutionContext,
	config: StudioConfig,
	step: VmixAutomationStep,
	start: number
): IBlueprintPiece['content']['timelineObjects'] {
	const input = resolveVmixInput(config, step.sourceKey, step.input)

	if (
		input === undefined &&
		step.action !== VmixAutomationAction.OverlayOff &&
		step.action !== VmixAutomationAction.OverlayOut &&
		step.action !== VmixAutomationAction.Wait
	) {
		context.notifyUserWarning(`vMix macro step skipped: ${step.action} requires input or sourceKey`)
		context.logWarning(`vMix macro step skipped: ${step.action} missing input/sourceKey`)
		return []
	}

	switch (step.action) {
		case VmixAutomationAction.ProgramCut:
			if (input === undefined) {
				context.notifyUserWarning('vMix macro step skipped: programCut requires input or sourceKey')
				return []
			}
			return createVMixProgramCutPieceContent(config, input, start, step.volume)
		case VmixAutomationAction.PreviewInput:
			if (input === undefined) {
				context.notifyUserWarning('vMix macro step skipped: previewInput requires input or sourceKey')
				return []
			}
			return [createVMixPreviewTimelineObject(input, start)]
		case VmixAutomationAction.OverlayIn:
			if (input === undefined) {
				context.notifyUserWarning('vMix macro step skipped: overlayIn requires input or sourceKey')
				return []
			}
			return [
				createVMixOverlayTimelineObject(
					input,
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
			if (input === undefined) {
				context.notifyUserWarning('vMix macro step skipped: audioVolume requires input or sourceKey')
				return []
			}
			return [createVMixAudioTimelineObject(input, step.volume ?? 100, step.fadeMs, start)]
		case VmixAutomationAction.VideoPlay:
			if (input === undefined) {
				context.notifyUserWarning('vMix macro step skipped: videoPlay requires input or sourceKey')
				return []
			}
			return [createVMixInputPlaybackTimelineObject(input, true, false, start)]
		case VmixAutomationAction.VideoPause:
			if (input === undefined) {
				context.notifyUserWarning('vMix macro step skipped: videoPause requires input or sourceKey')
				return []
			}
			return [createVMixInputPlaybackTimelineObject(input, false, false, start)]
		case VmixAutomationAction.VideoRestart:
			if (input === undefined) {
				context.notifyUserWarning('vMix macro step skipped: videoRestart requires input or sourceKey')
				return []
			}
			return [createVMixInputPlaybackTimelineObject(input, true, true, start)]
		default:
			return []
	}
}

async function executeHttpStep(context: IActionExecutionContext, url: string): Promise<void> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), 8000)
	const safeUrl = redactUrlForLog(url)

	try {
		const response = await fetch(url, { signal: controller.signal })
		if (!response.ok) {
			context.notifyUserWarning(`HTTP ${response.status} for ${safeUrl}`)
		}
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			context.notifyUserWarning(`HTTP request timed out: ${safeUrl}`)
			context.logWarning(`HTTP request timed out: ${safeUrl}`)
		} else {
			context.notifyUserWarning(`HTTP request failed: ${safeUrl}`)
			context.logWarning(`HTTP request failed: ${safeUrl} - ${err}`)
		}
	} finally {
		clearTimeout(timeoutId)
	}
}

function redactUrlForLog(url: string): string {
	try {
		const parsed = new URL(url)
		for (const [key] of parsed.searchParams.entries()) {
			if (/token|secret|password|apikey|auth/i.test(key)) {
				parsed.searchParams.set(key, '***')
			}
		}
		return parsed.toString()
	} catch {
		return '[invalid URL]'
	}
}

async function executeTsrStep(
	context: IActionExecutionContext,
	config: StudioConfig,
	step: VmixAutomationStep
): Promise<void> {
	if (!step.tsrActionId) {
		context.notifyUserWarning('vMix macro TSR step skipped: tsrActionId is required')
		context.logWarning('vMix macro TSR step skipped: missing tsrActionId')
		return
	}

	try {
		const devices = await context.listPlayoutDevices()
		const vmixDevice = devices.find(
			(device) => device.deviceType === TSR.DeviceType.VMIX && String(device.deviceId) === config.visionMixer.deviceId
		)
		if (!vmixDevice) {
			context.notifyUserWarning('vMix playout device not found for TSR action')
			return
		}

		await context.executeTSRAction(vmixDevice.deviceId, step.tsrActionId, step.tsrActionPayload ?? {})
	} catch (err) {
		context.notifyUserWarning(`vMix macro TSR step failed: ${step.tsrActionId}`)
		context.logWarning(`vMix macro TSR step failed (${step.tsrActionId}): ${err}`)
	}
}

export async function executeVmixAutomationMacro(context: IActionExecutionContext, macroKey: string): Promise<void> {
	const config = parseConfig(context).studio
	if (config.visionMixer.type !== VisionMixerDevice.VMix) return

	const macro: VmixAutomationMacro | undefined = config.vmixAutomationMacros?.[macroKey]
	if (!macro) {
		context.notifyUserWarning(`Unknown vMix macro: ${macroKey}`)
		return
	}

	const timelineObjects: IBlueprintPiece['content']['timelineObjects'] = []

	for (const step of macro.steps) {
		if (step.action === VmixAutomationAction.Wait) {
			await insertQueuedTimelineObjects(context, macroKey, macro.label, timelineObjects)
			await delay(step.delayMs ?? 0)
			continue
		}

		if (step.action === VmixAutomationAction.HttpGet) {
			if (!step.url) {
				context.notifyUserWarning(`vMix macro "${macro.label}": httpGet step skipped (missing url)`)
				context.logWarning(`vMix macro ${macroKey}: httpGet step missing url`)
				continue
			}
			await insertQueuedTimelineObjects(context, macroKey, macro.label, timelineObjects)
			await executeHttpStep(context, step.url)
			continue
		}

		if (step.action === VmixAutomationAction.TsrAction) {
			await insertQueuedTimelineObjects(context, macroKey, macro.label, timelineObjects)
			await executeTsrStep(context, config, step)
			continue
		}

		timelineObjects.push(...stepToTimelineObjects(context, config, step, 0))
	}

	await insertQueuedTimelineObjects(context, macroKey, macro.label, timelineObjects)
}
