import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type RundownEditorPayloadManifest = {
	id: string
	label: string
	type: 'string' | 'number' | 'boolean'
	includeInName?: boolean
}

type RundownEditorPieceTypeManifest = {
	id: string
	entityType: 'piece'
	name: string
	payload: RundownEditorPayloadManifest[]
}

function isPayloadManifest(value: unknown): value is RundownEditorPayloadManifest {
	if (typeof value !== 'object' || value === null) return false

	const field = value as Record<string, unknown>

	return (
		typeof field.id === 'string' &&
		typeof field.label === 'string' &&
		(field.type === 'string' || field.type === 'number' || field.type === 'boolean') &&
		(!('includeInName' in field) || typeof field.includeInName === 'boolean')
	)
}

/** Mirrors Rundown Editor import validation, with stricter shape checks for our asset file. */
function verifyRundownEditorPieceTypesImport(data: unknown): data is RundownEditorPieceTypeManifest[] {
	return (
		Array.isArray(data) &&
		data.every((entry): entry is RundownEditorPieceTypeManifest => {
			if (typeof entry !== 'object' || entry === null) return false

			const manifest = entry as Record<string, unknown>

			return (
				typeof manifest.id === 'string' &&
				manifest.entityType === 'piece' &&
				typeof manifest.name === 'string' &&
				Array.isArray(manifest.payload) &&
				manifest.payload.every(isPayloadManifest)
			)
		})
	)
}

describe('sofie-rundown-editor-piece-types.json', () => {
	it('matches Rundown Editor piece type import validation', () => {
		const filePath = resolve(
			dirname(fileURLToPath(import.meta.url)),
			'../../../../assets/sofie-rundown-editor-piece-types.json'
		)
		const data: unknown = JSON.parse(readFileSync(filePath, 'utf8'))

		expect(verifyRundownEditorPieceTypesImport(data)).toBe(true)
	})
})
