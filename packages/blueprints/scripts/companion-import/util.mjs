/**
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
	return (
		String(text || 'macro')
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 48) || 'macro'
	)
}

/**
 * @param {string} key
 * @param {Set<string>} used
 * @returns {string}
 */
export function uniqueKey(key, used) {
	let candidate = key
	let i = 2
	while (used.has(candidate)) {
		candidate = `${key}_${i}`
		i++
	}
	used.add(candidate)
	return candidate
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
export function parseInputNumber(value) {
	if (value === undefined || value === null || value === '') return undefined
	const n = Number(value)
	return Number.isFinite(n) ? n : undefined
}

/**
 * @param {Record<string, unknown>} options
 * @param {string[]} keys
 * @returns {unknown}
 */
export function pickOption(options, keys) {
	for (const key of keys) {
		if (options[key] !== undefined && options[key] !== '') return options[key]
	}
	return undefined
}

/**
 * @param {string} actionId
 * @returns {string}
 */
export function normalizeActionId(actionId) {
	return String(actionId || '')
		.replace(/^[^:]+:/, '')
		.toLowerCase()
}

/**
 * Infer Sofie page tag from Companion page name.
 * @param {string} pageName
 * @returns {string[]}
 */
export function tagsFromPageName(pageName) {
	const name = String(pageName || '').toLowerCase()
	const tags = []
	if (name.includes('sprav')) tags.push('spravy')
	if (name.includes('studio')) tags.push('studio')
	if (name.includes('weather') || name.includes('pocas')) tags.push('weather')
	if (name.includes('master')) tags.push('studio-master')
	if (tags.length === 0 && pageName) tags.push(slugify(pageName))
	return tags
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isDynamicCompanionExpression(value) {
	return /\$\([^)]+\)/.test(String(value))
}
