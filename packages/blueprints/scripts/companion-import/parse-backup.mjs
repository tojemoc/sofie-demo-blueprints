/**
 * @typedef {object} CompanionAction
 * @property {string} actionId
 * @property {string} connectionId
 * @property {string} connectionLabel
 * @property {Record<string, unknown>} options
 * @property {number} delay
 * @property {string} [headline]
 */

/**
 * @typedef {object} CompanionButton
 * @property {string} pageId
 * @property {string} pageName
 * @property {string} controlId
 * @property {string} label
 * @property {CompanionAction[]} actions
 */

/**
 * @typedef {object} CompanionInstance
 * @property {string} id
 * @property {string} label
 * @property {string} instanceType
 * @property {Record<string, unknown>} config
 */

/**
 * @param {unknown} backup
 * @returns {CompanionInstance[]}
 */
export function extractInstances(backup) {
	/** @type {CompanionInstance[]} */
	const instances = []
	const raw = backup?.instances ?? backup?.connections ?? {}

	for (const [id, instance] of Object.entries(raw)) {
		if (!instance || typeof instance !== 'object') continue
		const typed = /** @type {Record<string, unknown>} */ (instance)
		instances.push({
			id,
			label: String(typed.label ?? typed.name ?? id),
			instanceType: String(typed.instance_type ?? typed.moduleName ?? typed.module ?? typed.type ?? ''),
			config: /** @type {Record<string, unknown>} */ (typed.config ?? typed),
		})
	}

	return instances
}

/**
 * @param {CompanionInstance[]} instances
 * @returns {CompanionInstance | undefined}
 */
export function findVmixInstance(instances) {
	return instances.find((instance) => {
		const haystack = `${instance.instanceType} ${instance.label}`.toLowerCase()
		return haystack.includes('vmix')
	})
}

/**
 * @param {CompanionInstance[]} instances
 * @returns {CompanionInstance | undefined}
 */
export function findHttpInstance(instances) {
	return instances.find((instance) => {
		const haystack = `${instance.instanceType} ${instance.label}`.toLowerCase()
		return haystack.includes('http') || haystack.includes('generic-http')
	})
}

/**
 * @param {unknown} action
 * @param {Map<string, CompanionInstance>} instanceById
 * @returns {CompanionAction | undefined}
 */
function normalizeAction(action, instanceById) {
	if (!action || typeof action !== 'object') return undefined
	const typed = /** @type {Record<string, unknown>} */ (action)
	const actionId = String(typed.actionId ?? typed.definitionId ?? typed.action ?? '')
	if (!actionId) return undefined

	const connectionId = String(typed.instance ?? typed.connectionId ?? typed.connection ?? '')
	const instance = instanceById.get(connectionId)

	return {
		actionId,
		connectionId,
		connectionLabel: instance?.label ?? connectionId,
		options: /** @type {Record<string, unknown>} */ (typed.options ?? typed),
		delay: Number(typed.delay ?? 0) || 0,
		headline: typed.headline ? String(typed.headline) : undefined,
	}
}

/**
 * @param {unknown} steps
 * @returns {unknown[]}
 */
function flattenStepActions(steps) {
	/** @type {unknown[]} */
	const actions = []

	if (!steps) return actions

	if (Array.isArray(steps)) {
		for (const step of steps) {
			if (!step || typeof step !== 'object') continue
			const typed = /** @type {Record<string, unknown>} */ (step)
			for (const key of ['down', 'up', 'rotate_left', 'rotate_right']) {
				const bucket = typed[key]
				if (Array.isArray(bucket)) actions.push(...bucket)
			}
			for (const [key, value] of Object.entries(typed)) {
				if (['down', 'up', 'rotate_left', 'rotate_right', 'name'].includes(key)) continue
				if (value && typeof value === 'object' && 'actions' in value) {
					const nested = /** @type {{ actions?: unknown[] }} */ (value).actions
					if (Array.isArray(nested)) actions.push(...nested)
				}
			}
		}
		return actions
	}

	if (typeof steps === 'object') {
		for (const step of Object.values(steps)) {
			if (!step || typeof step !== 'object') continue
			const typed = /** @type {Record<string, unknown>} */ (step)
			const actionSets = /** @type {Record<string, unknown>} */ (typed.action_sets ?? typed)

			for (const key of ['down', 'up', 'rotate_left', 'rotate_right']) {
				const list = actionSets[key]
				if (Array.isArray(list)) actions.push(...list)
			}

			for (const [key, value] of Object.entries(actionSets)) {
				if (['down', 'up', 'rotate_left', 'rotate_right'].includes(key)) continue
				if (value && typeof value === 'object' && 'actions' in value) {
					const nested = /** @type {{ actions?: unknown[] }} */ (value).actions
					if (Array.isArray(nested)) actions.push(...nested)
				}
			}
		}
	}

	return actions
}

/**
 * @param {unknown} control
 * @returns {string}
 */
function controlLabel(control) {
	if (!control || typeof control !== 'object') return ''
	const typed = /** @type {Record<string, unknown>} */ (control)
	const style = typed.style
	if (style && typeof style === 'object') {
		const text = /** @type {{ text?: string }} */ (style).text
		if (text) return String(text).trim()
	}
	return ''
}

/**
 * @param {unknown} backup
 * @returns {CompanionButton[]}
 */
export function extractButtons(backup) {
	const instances = extractInstances(backup)
	const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
	/** @type {CompanionButton[]} */
	const buttons = []

	const pages = backup?.pages ?? {}
	for (const [pageId, page] of Object.entries(pages)) {
		if (!page || typeof page !== 'object') continue
		const pageObj = /** @type {Record<string, unknown>} */ (page)
		const pageName = String(pageObj.name ?? pageId)
		const controls = pageObj.controls ?? pageObj.buttons ?? pageObj

		for (const [controlId, control] of Object.entries(controls)) {
			if (!control || typeof control !== 'object') continue
			const typed = /** @type {Record<string, unknown>} */ (control)
			if (typed.type && typed.type !== 'button') continue

			const rawActions = flattenStepActions(typed.steps)
			const actions = rawActions
				.map((action) => normalizeAction(action, instanceById))
				.filter((action) => action !== undefined)

			if (actions.length === 0) continue

			const label = controlLabel(control) || `${pageName} ${controlId}`
			buttons.push({
				pageId,
				pageName,
				controlId,
				label,
				actions,
			})
		}
	}

	return buttons
}

/**
 * @param {unknown} backup
 */
export function parseCompanionBackup(backup) {
	if (!backup || typeof backup !== 'object') {
		throw new Error('Companion backup must be a JSON object')
	}

	const instances = extractInstances(backup)
	const vmixInstance = findVmixInstance(instances)
	const httpInstance = findHttpInstance(instances)
	const buttons = extractButtons(backup)

	return {
		version: backup.version,
		type: backup.type,
		companionBuild: backup.companionBuild,
		instances,
		vmixInstance,
		httpInstance,
		buttons,
		summary: {
			pageCount: Object.keys(backup.pages ?? {}).length,
			buttonCount: buttons.length,
			actionCount: buttons.reduce((sum, button) => sum + button.actions.length, 0),
		},
	}
}
