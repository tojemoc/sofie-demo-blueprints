import {
	isDynamicCompanionExpression,
	normalizeActionId,
	parseInputNumber,
	pickOption,
} from './util.mjs'

/**
 * @typedef {object} MappedStep
 * @property {string} action
 * @property {number} [input]
 * @property {number} [overlayChannel]
 * @property {number} [volume]
 * @property {number} [fadeMs]
 * @property {number} [delayMs]
 * @property {string} [url]
 * @property {string} [tsrActionId]
 * @property {Record<string, unknown>} [tsrActionPayload]
 */

/**
 * @typedef {object} MapResult
 * @property {MappedStep[]} steps
 * @property {number[]} inputs
 * @property {string[]} warnings
 * @property {string[]} notes
 */

/**
 * @param {import('./parse-backup.mjs').CompanionAction} action
 * @param {import('./parse-backup.mjs').CompanionInstance | undefined} vmixInstance
 * @param {import('./parse-backup.mjs').CompanionInstance | undefined} httpInstance
 * @returns {{ step?: MappedStep; warning?: string; note?: string; input?: number }}
 */
function mapSingleAction(action, vmixInstance, httpInstance) {
	const actionId = normalizeActionId(action.actionId)
	const options = action.options ?? {}
	const isVmix =
		vmixInstance &&
		(action.connectionId === vmixInstance.id ||
			action.connectionLabel.toLowerCase().includes('vmix') ||
			actionId.includes('vmix'))
	const isHttp =
		httpInstance &&
		(action.connectionId === httpInstance.id || actionId === 'get' || actionId.includes('http'))

	if (actionId === 'wait' || actionId.endsWith(':wait')) {
		const delayMs = parseInputNumber(pickOption(options, ['time', 'delay', 'ms'])) ?? 0
		return { step: { action: 'wait', delayMs } }
	}

	if (actionId.includes('logic_if') || actionId.includes('logic_while')) {
		return { note: `Skipped conditional logic action "${action.actionId}" — reimplement in Sofie rundown flow or macro branches` }
	}

	if (isHttp || actionId === 'get') {
		const url = String(pickOption(options, ['url', 'URI', 'uri']) ?? '')
		if (!url) return { warning: `HTTP action missing URL (${action.actionId})` }
		if (isDynamicCompanionExpression(url)) {
			return {
				note: `HTTP URL uses Companion variable "${url}" — move path resolution to rundown ingest (Spreadsheet Gateway / Rundown Editor)`,
				step: {
					action: 'httpGet',
					url: url.replace(/\$\([^)]+\)/g, '{{RUNDOWN_PATH}}'),
				},
			}
		}
		return { step: { action: 'httpGet', url } }
	}

	if (!isVmix) {
		if (actionId.includes('google') || actionId.includes('sheet')) {
			return { note: `Skipped Google Sheets action "${action.actionId}" — use rundown ingest for dynamic clip paths` }
		}
		if (actionId.includes('homeassistant') || actionId.includes('atem') || actionId.includes('obs')) {
			return { note: `Skipped non-vMix integration "${action.connectionLabel}" / ${action.actionId}` }
		}
		return { warning: `Unmapped action "${action.actionId}" on connection "${action.connectionLabel}"` }
	}

	const input = parseInputNumber(pickOption(options, ['input', 'Input', 'inputNumber']))
	const overlayChannel = parseInputNumber(pickOption(options, ['mix', 'overlay', 'overlayChannel', 'channel']))

	if (actionId.includes('programcut') || actionId === 'cut' || actionId.includes('transition') && pickOption(options, ['function', 'transition']) === 'Cut') {
		if (input === undefined) return { warning: `programCut missing input (${action.actionId})` }
		const volume = parseInputNumber(pickOption(options, ['volume', 'value']))
		return {
			input,
			step: {
				action: 'programCut',
				input,
				...(volume !== undefined ? { volume } : {}),
			},
		}
	}

	if (actionId.includes('preview')) {
		if (input === undefined) return { warning: `previewInput missing input (${action.actionId})` }
		return { input, step: { action: 'previewInput', input } }
	}

	if (actionId.includes('overlay')) {
		const fn = String(pickOption(options, ['function', 'action', 'mode']) ?? 'In').toLowerCase()
		if (fn.includes('off')) {
			return {
				step: {
					action: 'overlayOff',
					...(overlayChannel !== undefined ? { overlayChannel } : {}),
				},
			}
		}
		if (fn.includes('out')) {
			return {
				step: {
					action: 'overlayOut',
					...(overlayChannel !== undefined ? { overlayChannel } : {}),
				},
			}
		}
		if (input === undefined) return { warning: `overlayIn missing input (${action.actionId})` }
		return {
			input,
			step: {
				action: 'overlayIn',
				input,
				...(overlayChannel !== undefined ? { overlayChannel } : {}),
			},
		}
	}

	if (actionId.includes('volume') || actionId.includes('audiobus') || actionId.includes('setbusvolume')) {
		if (input === undefined) return { warning: `audioVolume missing input (${action.actionId})` }
		const volume = parseInputNumber(pickOption(options, ['volume', 'value', 'gain'])) ?? 100
		const fadeMs = parseInputNumber(pickOption(options, ['fade', 'fadetime', 'fadeMs']))
		return {
			input,
			step: {
				action: 'audioVolume',
				input,
				volume,
				...(fadeMs !== undefined ? { fadeMs } : {}),
			},
		}
	}

	if (actionId.includes('video') || actionId.includes('playback') || actionId.includes('media')) {
		if (input === undefined) return { warning: `video action missing input (${action.actionId})` }
		const fn = String(pickOption(options, ['function', 'action', 'mode']) ?? 'Play').toLowerCase()
		if (fn.includes('pause') || fn.includes('stop')) {
			return { input, step: { action: 'videoPause', input } }
		}
		if (fn.includes('restart') || fn.includes('reset')) {
			return { input, step: { action: 'videoRestart', input } }
		}
		return { input, step: { action: 'videoPlay', input } }
	}

	if (actionId.includes('title') && (actionId.includes('text') || actionId.includes('adjust'))) {
		if (input === undefined) return { warning: `titleSetText missing input (${action.actionId})` }
		const text = String(pickOption(options, ['value', 'text', 'title']) ?? '')
		const layer = pickOption(options, ['layer', 'index', 'field'])
		const host = String(vmixInstance?.config?.host ?? '127.0.0.1')
		const port = Number(vmixInstance?.config?.port ?? 8088)
		const selectedName = encodeURIComponent(String(pickOption(options, ['selectedName', 'name']) ?? ''))
		const value = encodeURIComponent(text)
		const url =
			selectedName && layer !== undefined
				? `http://${host}:${port}/api/?Function=SetText&Input=${input}&SelectedName=${selectedName}&Value=${value}`
				: `http://${host}:${port}/api/?Function=SetText&Input=${input}&Value=${value}`
		if (isDynamicCompanionExpression(text)) {
			return {
				input,
				note: `Title text uses Companion variable — bind to rundown data in Sofie`,
				step: { action: 'httpGet', url: url.replace(encodeURIComponent(text), '{{RUNDOWN_TITLE}}') },
			}
		}
		return { input, step: { action: 'httpGet', url } }
	}

	if (actionId.includes('preset') || actionId.includes('openpreset')) {
		const preset = String(pickOption(options, ['preset', 'value', 'name']) ?? '')
		if (preset && !isDynamicCompanionExpression(preset)) {
			const host = String(vmixInstance?.config?.host ?? '127.0.0.1')
			const port = Number(vmixInstance?.config?.port ?? 8088)
			return {
				step: {
					action: 'httpGet',
					url: `http://${host}:${port}/api/?Function=OpenPreset&Value=${encodeURIComponent(preset)}`,
				},
				note: `Mapped preset load "${preset}" to vMix OpenPreset HTTP`,
			}
		}
		return { step: { action: 'tsrAction', tsrActionId: 'lastPreset' }, note: 'Mapped preset action to TSR lastPreset' }
	}

	if (actionId.includes('customcommand') || actionId.includes('shortcut') || actionId.includes('function')) {
		const command = String(pickOption(options, ['command', 'function', 'value', 'text']) ?? '')
		if (!command) return { warning: `Custom vMix command missing value (${action.actionId})` }
		const host = String(vmixInstance?.config?.host ?? '127.0.0.1')
		const port = Number(vmixInstance?.config?.port ?? 8088)
		if (command.startsWith('http://') || command.startsWith('https://')) {
			return { step: { action: 'httpGet', url: command } }
		}
		if (isDynamicCompanionExpression(command)) {
			return {
				note: `Custom vMix command uses variables: ${command}`,
				step: {
					action: 'httpGet',
					url: `http://${host}:${port}/api/?${command.replace(/\$\([^)]+\)/g, '{{VAR}}')}`,
				},
			}
		}
		return {
			step: {
				action: 'httpGet',
				url: `http://${host}:${port}/api/?${command}`,
			},
		}
	}

	if (actionId.includes('browserreload')) {
		if (input === undefined) return { warning: `browserReload missing input (${action.actionId})` }
		return { input, step: { action: 'tsrAction', tsrActionId: 'browserReload', tsrActionPayload: { input } } }
	}

	return { warning: `Unmapped vMix action "${action.actionId}"` }
}

/**
 * @param {import('./parse-backup.mjs').CompanionAction[]} actions
 * @param {import('./parse-backup.mjs').CompanionInstance | undefined} vmixInstance
 * @param {import('./parse-backup.mjs').CompanionInstance | undefined} httpInstance
 * @returns {MapResult}
 */
export function mapCompanionActions(actions, vmixInstance, httpInstance) {
	/** @type {MappedStep[]} */
	const steps = []
	/** @type {number[]} */
	const inputs = []
	/** @type {string[]} */
	const warnings = []
	/** @type {string[]} */
	const notes = []

	for (const action of actions) {
		if (action.delay > 0) {
			steps.push({ action: 'wait', delayMs: action.delay })
		}

		const result = mapSingleAction(action, vmixInstance, httpInstance)
		if (result.warning) warnings.push(result.warning)
		if (result.note) notes.push(result.note)
		if (result.input !== undefined) inputs.push(result.input)
		if (result.step) steps.push(result.step)
	}

	return { steps, inputs, warnings, notes }
}
