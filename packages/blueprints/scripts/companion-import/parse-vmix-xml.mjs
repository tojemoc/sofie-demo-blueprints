/**
 * Parse a vMix .vmix project XML file and extract input definitions.
 * Uses lightweight regex parsing to avoid extra dependencies.
 *
 * @param {string} xml
 * @returns {Array<{ input: number; title: string; type: string; key?: string }>}
 */
export function parseVmixProjectXml(xml) {
	/** @type {Array<{ input: number; title: string; type: string; key?: string }>} */
	const inputs = []
	const inputTagRegex = /<input\b([^>]*)\/?>/gi

	for (const match of xml.matchAll(inputTagRegex)) {
		const attrs = parseAttributes(match[1] ?? '')
		const input = Number(attrs.number)
		if (!Number.isInteger(input) || input <= 0) continue

		inputs.push({
			input,
			title: attrs.title ?? attrs.shortTitle ?? `Input ${input}`,
			type: attrs.type ?? 'Unknown',
			key: attrs.key,
		})
	}

	inputs.sort((a, b) => a.input - b.input)
	return inputs
}

/**
 * @param {string} attrString
 * @returns {Record<string, string>}
 */
function parseAttributes(attrString) {
	/** @type {Record<string, string>} */
	const attrs = {}
	const attrRegex = /(\w+)="([^"]*)"/g
	for (const match of attrString.matchAll(attrRegex)) {
		attrs[match[1]] = decodeXmlEntities(match[2])
	}
	return attrs
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeXmlEntities(value) {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
}

/**
 * Map vMix XML input type to Sofie SourceType enum value.
 * @param {string} vmixType
 * @returns {'camera' | 'remote' | 'mediaplayer' | 'graphics' | 'multiview'}
 */
export function mapVmixXmlType(vmixType) {
	const type = vmixType.toLowerCase()
	if (type.includes('capture') || type.includes('camera') || type.includes('ndi')) return 'camera'
	if (type.includes('browser') || type.includes('video') || type.includes('replay') || type.includes('list'))
		return 'mediaplayer'
	if (type.includes('title') || type.includes('image') || type.includes('colour') || type.includes('color'))
		return 'graphics'
	if (type.includes('multiview') || type.includes('multi view')) return 'multiview'
	if (type.includes('virtual') || type.includes('call') || type.includes('remote')) return 'remote'
	return 'mediaplayer'
}

/**
 * Map vMix XML input to Sofie source category.
 * @param {string} vmixType
 * @param {string} title
 * @returns {'video' | 'technical' | 'graphics'}
 */
export function mapVmixXmlCategory(vmixType, title) {
	const haystack = `${vmixType} ${title}`.toLowerCase()
	if (haystack.includes('title') || haystack.includes('gfx') || haystack.includes('headline') || haystack.includes('logo'))
		return 'graphics'
	if (
		haystack.includes('stinger') ||
		haystack.includes('multiview') ||
		haystack.includes('mix') ||
		haystack.includes('placeholder') ||
		haystack.includes('bars')
	)
		return 'technical'
	return 'video'
}
