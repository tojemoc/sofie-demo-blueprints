import { JSONSchema } from '@sofie-automation/blueprints-integration'
import { beforeAll, describe, expect, it } from 'vitest'
import { DemoStudioConfig } from '../main/studio/configs/demo.js'

interface JsonSchemaObject {
	[key: string]: unknown
}

let schema: JsonSchemaObject

beforeAll(async () => {
	// The manifest is evaluated against rollup-injected globals; stub them for vitest.
	const globals = globalThis as Record<string, unknown>
	globals.__VERSION__ ??= 'test'
	globals.__VERSION_TSR__ ??= 'test'
	globals.__VERSION_INTEGRATION__ ??= 'test'
	globals.__TRANSLATION_BUNDLES__ ??= '{}'
	const { baseManifest } = await import('../base/studio/manifest.js')
	schema = JSON.parse(baseManifest.studioConfigSchema as unknown as string) as JsonSchemaObject
})

function* walkObjects(node: unknown): Generator<JsonSchemaObject> {
	if (Array.isArray(node)) {
		for (const item of node) yield* walkObjects(item)
		return
	}
	if (node === null || typeof node !== 'object') return
	const obj = node as JsonSchemaObject
	yield obj
	for (const value of Object.values<unknown>(obj)) yield* walkObjects(value)
}

const TABLE_PROPERTIES = ['atemSources', 'atemOutputs', 'vmixSources', 'sisyfosSources'] as const

describe('studioConfigSchema (dereferenced manifest schema)', () => {
	it('uses no object-valued additionalProperties anywhere (Sofie renders tables from patternProperties)', () => {
		for (const obj of walkObjects(schema)) {
			const additional = obj['additionalProperties']
			expect(typeof additional === 'object' && additional !== null).toBe(false)
		}
	})

	it.each(TABLE_PROPERTIES)('%s is a patternProperties table with a single "" row schema', (name) => {
		const table = (schema.properties as JsonSchemaObject)[name] as JsonSchemaObject
		expect(table.type).toBe('object')
		const pattern = table.patternProperties as JsonSchemaObject
		expect(Object.keys(pattern)).toEqual([''])
		expect((pattern[''] as JsonSchemaObject).type).toBe('object')
	})

	it.each(TABLE_PROPERTIES)('%s row columns all carry a string type ($refs dereferenced)', (name) => {
		const table = (schema.properties as JsonSchemaObject)[name] as JsonSchemaObject
		const row = (table.patternProperties as JsonSchemaObject)[''] as JsonSchemaObject
		const columns = row.properties as JsonSchemaObject
		expect(columns).toBeDefined()
		for (const column of Object.keys(columns)) {
			expect(typeof (columns[column] as JsonSchemaObject).type).toBe('string')
		}
	})

	it('exposes the six required vmixProgram integer inputs', () => {
		const properties = schema.properties as JsonSchemaObject
		const vmixProgram = properties.vmixProgram as JsonSchemaObject
		expect(vmixProgram).toBeDefined()
		expect(vmixProgram.type).toBe('object')
		const programProperties = vmixProgram.properties as JsonSchemaObject
		for (const field of ['cameraInput', 'lookAInput', 'lookBInput', 'cleanGfxInput', 'bedAInput', 'bedCInput']) {
			expect((programProperties[field] as JsonSchemaObject)?.type).toBe('integer')
		}
		expect(vmixProgram.required).toEqual(
			expect.arrayContaining(['cameraInput', 'lookAInput', 'lookBInput', 'cleanGfxInput', 'bedAInput', 'bedCInput'])
		)
		expect(schema.required).toEqual(expect.arrayContaining(['vmixProgram']))
	})

	it('DemoStudioConfig carries the vmixProgram defaults', () => {
		expect(DemoStudioConfig.vmixProgram).toEqual({
			cameraInput: 1,
			lookAInput: 2,
			lookBInput: 3,
			cleanGfxInput: 4,
			bedAInput: 5,
			bedCInput: 6,
		})
	})

	it('keeps $defs-free schema shape (sanity: dereference produced a plain object tree)', () => {
		expect((schema as JSONSchema).type).toBe('object')
	})
})
