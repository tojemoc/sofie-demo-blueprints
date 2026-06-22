import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseCompanionBackup } from '../companion-import/parse-backup.mjs'
import { generateStudioConfig } from '../companion-import/generate-studio-config.mjs'
import { parseVmixProjectXml } from '../companion-import/parse-vmix-xml.mjs'
import { slugify } from '../companion-import/util.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = resolve(__dirname, '../fixtures')

test('slugify normalizes Slovak labels', () => {
	assert.equal(slugify('SPRÁVY Head Start'), 'spravy_head_start')
})

test('parseCompanionBackup extracts vMix buttons and host', async () => {
	const backup = JSON.parse(await readFile(resolve(fixtureDir, 'sample-companion-backup.json'), 'utf8'))
	const parsed = parseCompanionBackup(backup)

	assert.equal(parsed.summary.buttonCount, 4)
	assert.equal(parsed.vmixInstance?.config.host, '10.33.182.163')
	assert.equal(parsed.vmixInstance?.config.port, 8088)
})

test('parseVmixProjectXml reads input titles', async () => {
	const xml = await readFile(resolve(fixtureDir, 'sample-vmix-project.xml'), 'utf8')
	const inputs = parseVmixProjectXml(xml)

	assert.equal(inputs.length, 7)
	assert.equal(inputs.find((i) => i.input === 30)?.title, 'ILU Player')
})

test('generateStudioConfig maps macros and sources', async () => {
	const backup = JSON.parse(await readFile(resolve(fixtureDir, 'sample-companion-backup.json'), 'utf8'))
	const xml = await readFile(resolve(fixtureDir, 'sample-vmix-project.xml'), 'utf8')
	const parsed = parseCompanionBackup(backup)
	const vmixInputs = parseVmixProjectXml(xml)
	const result = generateStudioConfig(parsed, vmixInputs)

	assert.ok(result.stats.macroCount >= 3)
	assert.ok(result.stats.sourceCount >= 4)
	assert.equal(result.studioConfig.visionMixer.host, '10.33.182.163')

	const readyMacro = Object.values(result.studioConfig.vmixAutomationMacros).find(
		(m) => /** @type {{ label: string }} */ (m).label === 'Ready to Start'
	)
	assert.ok(readyMacro)
	const steps = /** @type {{ action: string }[]} */ (/** @type {{ steps: unknown }} */ (readyMacro).steps)
	assert.ok(steps.some((s) => s.action === 'programCut'))
	assert.ok(steps.some((s) => s.action === 'overlayIn'))
	assert.ok(steps.some((s) => s.action === 'videoRestart'))

	const loadMacro = Object.values(result.studioConfig.vmixAutomationMacros).find(
		(m) => /** @type {{ label: string }} */ (m).label === 'Load HEADLINE1'
	)
	assert.ok(loadMacro)
	const loadSteps = /** @type {{ action: string; url?: string }[]} */ (
		/** @type {{ steps: unknown }} */ (loadMacro).steps
	)
	assert.ok(loadSteps.some((s) => s.action === 'httpGet' && s.url?.includes('AddInput')))
	assert.ok(loadSteps.some((s) => s.action === 'httpGet' && s.url?.includes('{{RUNDOWN_PATH}}')))
})
