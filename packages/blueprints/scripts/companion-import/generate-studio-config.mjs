import { mapCompanionActions } from './map-vmix-actions.mjs'
import { mapVmixXmlCategory, mapVmixXmlType } from './parse-vmix-xml.mjs'
import { slugify, tagsFromPageName, uniqueKey } from './util.mjs'

/**
 * @typedef {object} GenerateOptions
 * @property {string} [deviceId]
 * @property {string[]} [defaultTags]
 * @property {boolean} [includeAllVmixInputs]
 */

/**
 * @param {number} input
 * @param {Map<number, { title: string; type: string }>} xmlInputs
 * @param {Set<string>} usedKeys
 * @returns {{ key: string; config: Record<string, unknown> }}
 */
function sourceFromInput(input, xmlInputs, usedKeys) {
	const xml = xmlInputs.get(input)
	const title = xml?.title ?? `Input ${input}`
	const baseKey = slugify(title)
	const key = uniqueKey(baseKey === 'input' ? `input_${input}` : baseKey, usedKeys)
	const vmixType = xml?.type ?? 'Unknown'

	return {
		key,
		config: {
			input,
			type: mapVmixXmlType(vmixType),
			label: title,
			category: mapVmixXmlCategory(vmixType, title),
			tags: inferTagsFromTitle(title),
		},
	}
}

/**
 * @param {string} title
 * @returns {string[]}
 */
function inferTagsFromTitle(title) {
	const tags = []
	const lower = title.toLowerCase()
	if (lower.includes('sprav') || lower.includes('headline') || lower.includes('ilu') || lower.includes('syn'))
		tags.push('spravy')
	if (lower.includes('cam')) tags.push('studio')
	if (lower.includes('stinger')) tags.push('spravy')
	return tags
}

/**
 * @param {Record<string, unknown>} vmixSources
 * @param {number} input
 * @returns {string | undefined}
 */
function findSourceKeyForInput(vmixSources, input) {
	for (const [key, source] of Object.entries(vmixSources)) {
		if (/** @type {{ input?: number }} */ (source).input === input) return key
	}
	return undefined
}

/**
 * @param {number} input
 * @param {Map<number, { title: string; type: string }>} xmlInputMap
 * @param {Set<string>} usedKeys
 * @param {Record<string, unknown>} vmixSources
 * @returns {string}
 */
function ensureSourceKey(input, xmlInputMap, usedKeys, vmixSources) {
	const existing = findSourceKeyForInput(vmixSources, input)
	if (existing) return existing

	const source = sourceFromInput(input, xmlInputMap, usedKeys)
	vmixSources[source.key] = source.config
	return source.key
}

/**
 * @param {import('./parse-backup.mjs').ReturnType<import('./parse-backup.mjs').parseCompanionBackup>} parsed
 * @param {Array<{ input: number; title: string; type: string }>} [vmixXmlInputs]
 * @param {GenerateOptions} [options]
 */
export function generateStudioConfig(parsed, vmixXmlInputs = [], options = {}) {
	const usedSourceKeys = new Set()
	const usedMacroKeys = new Set()
	/** @type {Record<string, unknown>} */
	const vmixSources = {}
	/** @type {Record<string, unknown>} */
	const vmixAutomationMacros = {}
	/** @type {string[]} */
	const report = []

	const xmlInputMap = new Map(vmixXmlInputs.map((input) => [input.input, input]))
	const referencedInputs = new Set()

	if (options.includeAllVmixInputs) {
		for (const xmlInput of vmixXmlInputs) {
			referencedInputs.add(xmlInput.input)
		}
	}

	for (const button of parsed.buttons) {
		const mapped = mapCompanionActions(button.actions, parsed.vmixInstance, parsed.httpInstance)
		for (const input of mapped.inputs) referencedInputs.add(input)
		for (const warning of mapped.warnings) {
			report.push(`[${button.label}] ${warning}`)
		}
		for (const note of mapped.notes) {
			report.push(`[${button.label}] NOTE: ${note}`)
		}

		if (mapped.steps.length === 0) continue

		const pageTags = tagsFromPageName(button.pageName)
		const macroKey = uniqueKey(slugify(button.label), usedMacroKeys)
		vmixAutomationMacros[macroKey] = {
			label: button.label,
			tags: [...new Set([...(options.defaultTags ?? []), ...pageTags])],
			steps: mapped.steps.map((step) => {
				if (step.input !== undefined) {
					const sourceKey = ensureSourceKey(step.input, xmlInputMap, usedSourceKeys, vmixSources)
					const { input: _input, ...rest } = step
					return { ...rest, sourceKey }
				}
				return step
			}),
		}
	}

	for (const input of referencedInputs) {
		if (findSourceKeyForInput(vmixSources, input)) continue
		ensureSourceKey(input, xmlInputMap, usedSourceKeys, vmixSources)
	}

	const vmixHost = String(parsed.vmixInstance?.config?.host ?? '127.0.0.1')
	const vmixPort = Number(parsed.vmixInstance?.config?.port ?? 8088)

	const studioConfig = {
		previewRenderer: 'sofie',
		casparcgLatency: 0,
		visionMixer: {
			type: 'Vmix',
			host: vmixHost,
			port: vmixPort,
			deviceId: options.deviceId ?? 'vmix0',
		},
		audioMixer: {
			host: 'localhost',
			port: 1176,
			deviceId: 'sisyfos0',
		},
		casparcg: {
			host: 'localhost',
			port: 5250,
		},
		sisyfosSources: {},
		atemSources: {},
		atemOutputs: {},
		vmixSources,
		vmixAutomationMacros,
	}

	report.push('')
	report.push('--- Správy workflow notes (from production writeup) ---')
	report.push(
		'Sheet-driven AddInput loads (HEADLINE.mov / ILU SYN .mp4) should become rundown VT parts or a watchfolder loader — not static macros.'
	)
	report.push('Per-contribution LIST inputs or individual inputs avoid vMix list lag and allow parallel ILU/SYN playback.')
	report.push('Audio volume cycling (ILU vs SYN vs noise floor) maps to audioVolume macro steps or part adapters.')
	report.push('Ready-to-start / reset-all-contributions sequences are good macro candidates — verify videoRestart steps after import.')
	report.push('Title text pour/pull maps to httpGet SetText steps; bind {{RUNDOWN_TITLE}} placeholders to rundown data.')

	return {
		studioConfig,
		report,
		stats: {
			sourceCount: Object.keys(vmixSources).length,
			macroCount: Object.keys(vmixAutomationMacros).length,
			referencedInputCount: referencedInputs.size,
			xmlInputCount: vmixXmlInputs.length,
		},
	}
}
