import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES } from '../common/definitions/rundownEditorTypes.js'

type RundownEditorPayloadManifest = {
	id: string
	label: string
	type: 'string' | 'number' | 'boolean' | 'mediaPick'
	includeInName?: boolean
	subdir?: string
}

type RundownEditorTypeManifest = {
	id: string
	entityType: 'piece' | 'part' | 'segment'
	name: string
	payload: RundownEditorPayloadManifest[]
}

function isPayloadManifest(value: unknown): value is RundownEditorPayloadManifest {
	if (typeof value !== 'object' || value === null) return false

	const field = value as Record<string, unknown>

	return (
		typeof field.id === 'string' &&
		typeof field.label === 'string' &&
		(field.type === 'string' || field.type === 'number' || field.type === 'boolean' || field.type === 'mediaPick') &&
		(!('includeInName' in field) || typeof field.includeInName === 'boolean') &&
		(!('subdir' in field) || typeof field.subdir === 'string')
	)
}

function verifyRundownEditorTypesImport(
	data: unknown,
	entityType: RundownEditorTypeManifest['entityType']
): data is RundownEditorTypeManifest[] {
	return (
		Array.isArray(data) &&
		data.every((entry): entry is RundownEditorTypeManifest => {
			if (typeof entry !== 'object' || entry === null) return false

			const manifest = entry as Record<string, unknown>

			return (
				typeof manifest.id === 'string' &&
				manifest.entityType === entityType &&
				typeof manifest.name === 'string' &&
				Array.isArray(manifest.payload) &&
				manifest.payload.every(isPayloadManifest)
			)
		})
	)
}

const assetsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../assets')

describe('sofie-rundown-editor-piece-types.json', () => {
	it('matches Rundown Editor piece type import validation', () => {
		const data: unknown = JSON.parse(readFileSync(resolve(assetsDir, 'sofie-rundown-editor-piece-types.json'), 'utf8'))

		expect(verifyRundownEditorTypesImport(data, 'piece')).toBe(true)
	})

	it('graphic piece ids stay in sync with blueprint normalization', () => {
		const data = JSON.parse(
			readFileSync(resolve(assetsDir, 'sofie-rundown-editor-piece-types.json'), 'utf8')
		) as Array<{
			id: string
		}>

		const graphicIds = data
			.map((entry) => entry.id)
			.filter((id) => (RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES as readonly string[]).includes(id))

		expect(graphicIds.sort()).toEqual([...RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES].sort())
	})
})

describe('sofie-rundown-editor-part-types.json', () => {
	it('matches Rundown Editor part type import validation', () => {
		const data: unknown = JSON.parse(readFileSync(resolve(assetsDir, 'sofie-rundown-editor-part-types.json'), 'utf8'))

		expect(verifyRundownEditorTypesImport(data, 'part')).toBe(true)
	})
})

describe('sofie-rundown-editor-segment-types.json', () => {
	it('matches Rundown Editor segment type import validation', () => {
		const data: unknown = JSON.parse(
			readFileSync(resolve(assetsDir, 'sofie-rundown-editor-segment-types.json'), 'utf8')
		)

		expect(verifyRundownEditorTypesImport(data, 'segment')).toBe(true)
	})
})
