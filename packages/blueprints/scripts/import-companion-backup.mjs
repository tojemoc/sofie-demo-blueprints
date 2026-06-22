#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { parseCompanionBackup } from './companion-import/parse-backup.mjs'
import { generateStudioConfig } from './companion-import/generate-studio-config.mjs'
import { parseVmixProjectXml } from './companion-import/parse-vmix-xml.mjs'

function printHelp() {
	console.log(`Usage: import-companion-backup.mjs <companion-backup.json> [options]

Options:
  --vmix-xml <path>       vMix .vmix project XML for source names (recommended for 127-input projects)
  --out <path>            Output studio config JSON (default: ./studio-config.imported.json)
  --report <path>         Import report text file (default: ./companion-import-report.txt)
  --include-all-inputs    Include every vMix XML input in vmixSources (not only referenced ones)
  --device-id <id>        visionMixer.deviceId (default: vmix0)
  --help                  Show this help

Example:
  node scripts/import-companion-backup.mjs ~/backup/companion.json \\
    --vmix-xml ~/vmix/show.vmix \\
    --out ./studio-config.spravy.json
`)
}

/**
 * @param {string[]} argv
 * @param {number} index
 * @param {string} optionName
 * @returns {string}
 */
function readOptionValue(argv, index, optionName) {
	const value = argv[index]
	if (value === undefined || value.startsWith('--')) {
		throw new Error(`Missing value for ${optionName}`)
	}
	return value
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ backupPath?: string; vmixXmlPath?: string; outPath: string; reportPath: string; includeAllInputs: boolean; deviceId: string; help: boolean }} */
	const args = {
		outPath: resolve('studio-config.imported.json'),
		reportPath: resolve('companion-import-report.txt'),
		includeAllInputs: false,
		deviceId: 'vmix0',
		help: false,
	}

	const positional = []
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--help' || arg === '-h') {
			args.help = true
		} else if (arg === '--vmix-xml') {
			args.vmixXmlPath = resolve(readOptionValue(argv, ++i, arg))
		} else if (arg === '--out') {
			args.outPath = resolve(readOptionValue(argv, ++i, arg))
		} else if (arg === '--report') {
			args.reportPath = resolve(readOptionValue(argv, ++i, arg))
		} else if (arg === '--include-all-inputs') {
			args.includeAllInputs = true
		} else if (arg === '--device-id') {
			args.deviceId = readOptionValue(argv, ++i, arg)
		} else if (arg.startsWith('-')) {
			throw new Error(`Unknown option: ${arg}`)
		} else {
			positional.push(arg)
		}
	}

	args.backupPath = positional[0]
	return args
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.backupPath) {
		printHelp()
		process.exit(args.help ? 0 : 1)
	}

	const backupRaw = await readFile(args.backupPath, 'utf8')
	const backup = JSON.parse(backupRaw)
	const parsed = parseCompanionBackup(backup)

	/** @type {Array<{ input: number; title: string; type: string }>} */
	let vmixXmlInputs = []
	if (args.vmixXmlPath) {
		const xml = await readFile(args.vmixXmlPath, 'utf8')
		vmixXmlInputs = parseVmixProjectXml(xml)
	}

	const result = generateStudioConfig(parsed, vmixXmlInputs, {
		deviceId: args.deviceId,
		includeAllVmixInputs: args.includeAllInputs,
	})

	const header = [
		`Companion import report`,
		`Source backup: ${args.backupPath}`,
		args.vmixXmlPath ? `vMix project: ${args.vmixXmlPath}` : 'vMix project: (not provided — input labels will be generic)',
		`Companion version: ${parsed.version ?? 'unknown'} (${parsed.companionBuild ?? 'unknown build'})`,
		`Pages: ${parsed.summary.pageCount}, buttons with actions: ${parsed.summary.buttonCount}, total actions: ${parsed.summary.actionCount}`,
		`vMix connection: ${parsed.vmixInstance ? `${parsed.vmixInstance.label} @ ${parsed.vmixInstance.config.host}:${parsed.vmixInstance.config.port}` : 'not found'}`,
		`Generated sources: ${result.stats.sourceCount}, macros: ${result.stats.macroCount}`,
		'',
	]

	const reportText = [...header, ...result.report].join('\n')
	await writeFile(args.outPath, JSON.stringify(result.studioConfig, null, 2) + '\n', 'utf8')
	await writeFile(args.reportPath, reportText + '\n', 'utf8')

	console.log(`Wrote studio config: ${args.outPath}`)
	console.log(`Wrote import report: ${args.reportPath}`)
	console.log(
		`Imported ${result.stats.macroCount} macro(s) and ${result.stats.sourceCount} source(s) from ${basename(args.backupPath)}`
	)
	if (!args.vmixXmlPath) {
		console.log('Tip: pass --vmix-xml <show.vmix> to name all 127 inputs from your vMix project file.')
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err)
	process.exit(1)
})
