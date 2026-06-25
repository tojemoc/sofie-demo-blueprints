import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type RundownEditorPieceTypeManifest = {
	id: string
	entityType: 'piece'
	name: string
	payload: unknown[]
}

/** Mirrors Rundown Editor import validation in typeManifestsForm.tsx */
function verifyRundownEditorPieceTypesImport(data: unknown): data is RundownEditorPieceTypeManifest[] {
	return (
		Array.isArray(data) &&
		data.every((entry): entry is RundownEditorPieceTypeManifest => {
			return (
				typeof entry === 'object' &&
				entry !== null &&
				'id' in entry &&
				'entityType' in entry &&
				entry.entityType === 'piece' &&
				'name' in entry &&
				'payload' in entry
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
