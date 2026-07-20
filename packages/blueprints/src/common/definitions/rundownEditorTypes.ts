import { SegmentType } from '../../base/showstyle/definitions/index.js'
import type { VideoPlayLayer } from './objects.js'

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
	'l3d-sjv',
	'l3d-sport',
	'weather',
	'outro',
	'logo-bug',
] as const

export type RundownEditorGraphicPieceType = (typeof RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES)[number]

export function isRundownEditorGraphicPieceType(pieceType: string): pieceType is RundownEditorGraphicPieceType {
	return (RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES as readonly string[]).includes(pieceType)
}

/**
 * Video piece types that play on dedicated Caspar layers (not VT/ClipPlayer takeover).
 * - `intro` → EffectsPlayer (200), on top of headlines / camera / gfx
 * - `bg-loop` → ClipPlayer1 (110), LED background behind camera
 */
export const RUNDOWN_EDITOR_LAYERED_VIDEO_PIECE_TYPES = ['intro', 'bg-loop'] as const

export type RundownEditorLayeredVideoPieceType = (typeof RUNDOWN_EDITOR_LAYERED_VIDEO_PIECE_TYPES)[number]

export type { VideoPlayLayer }

export function isRundownEditorLayeredVideoPieceType(
	pieceType: string
): pieceType is RundownEditorLayeredVideoPieceType {
	return (RUNDOWN_EDITOR_LAYERED_VIDEO_PIECE_TYPES as readonly string[]).includes(pieceType)
}

export function playLayerForVideoPieceType(pieceType: RundownEditorLayeredVideoPieceType): VideoPlayLayer {
	return pieceType === 'intro' ? 'effects' : 'background'
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
