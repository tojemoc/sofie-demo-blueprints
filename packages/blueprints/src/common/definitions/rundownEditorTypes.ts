import { SegmentType } from '../../base/showstyle/definitions/index.js'

/**
 * Rundown Editor piece type ids that normalize to gfx/* Caspar templates.
 * Keep in sync with assets/sofie-rundown-editor-piece-types.json.
 */
export const RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES = [
	'headline',
	'l3d-headline',
	'l3d-mod',
	'l3d-tema',
	'l3d-syn',
	'outro',
	'logo-bug',
] as const

export type RundownEditorGraphicPieceType = (typeof RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES)[number]

export function isRundownEditorGraphicPieceType(pieceType: string): pieceType is RundownEditorGraphicPieceType {
	return (RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES as readonly string[]).includes(pieceType)
}

export function resolveSegmentType(segmentPayload: { type?: string; name?: string }): SegmentType {
	const rawType = segmentPayload.type?.toLowerCase()

	if (rawType === SegmentType.OPENING) return SegmentType.OPENING
	if (rawType === SegmentType.HEADLINES) return SegmentType.HEADLINES
	if (rawType === SegmentType.STORY) return SegmentType.STORY
	if (rawType === SegmentType.NORMAL) return SegmentType.NORMAL

	// Legacy spreadsheet heuristic until segment types are set explicitly in the editor.
	if (segmentPayload.name?.match(/intro/i)) return SegmentType.OPENING

	return SegmentType.NORMAL
}
