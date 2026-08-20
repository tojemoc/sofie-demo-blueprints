import { SegmentType } from '../../base/showstyle/definitions/index.js'
import type { VideoPlayLayer } from './objects.js'

/**
 * Rundown Editor piece type ids that normalize to gfx/* Caspar templates.
 * Keep in sync with sofie megarepo assets/sofie-rundown-editor-piece-types.json.
 */
export const RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES = [
	'headline',
	/** Thematic DoubleBox left-window ILU (PGM 115) — not headline chrome. */
	'doublebox-ilu',
	'l3d-headline',
	'l3d-mod',
	/** Topic / guest nameplate (Figma predstavovak). */
	'l3d-predstavovak',
	'l3d-tema',
	'l3d-syn',
	'l3d-sjv',
	'l3d-sport',
	/** Recommendation / avízo CTA — jednou-vetou shell without kicker. */
	'l3d-odporucanie',
	'weather',
	'outro',
	'logo-bug',
] as const

export type RundownEditorGraphicPieceType = (typeof RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES)[number]

/** Membership check after trim/lowercase — returns boolean (not a type predicate on the raw input). */
export function isRundownEditorGraphicPieceType(pieceType: string): boolean {
	const normalized = pieceType.trim().toLowerCase()
	return (RUNDOWN_EDITOR_GRAPHIC_PIECE_TYPES as readonly string[]).includes(normalized)
}

/**
 * Video piece types that play on dedicated Caspar layers (not VT/ClipPlayer takeover).
 * - `intro` → PGM IntroOverlay (210), above wipe / camera / gfx — never LED
 * - `bg-loop` → ClipPlayer1 (110), LED background behind camera
 * - `wipe` → PGM EffectsPlayer (200), story-block alpha wipe
 */
export const RUNDOWN_EDITOR_LAYERED_VIDEO_PIECE_TYPES = ['intro', 'bg-loop', 'wipe'] as const

export type RundownEditorLayeredVideoPieceType = (typeof RUNDOWN_EDITOR_LAYERED_VIDEO_PIECE_TYPES)[number]

export type { VideoPlayLayer }

export function normalizeRundownEditorLayeredVideoPieceType(
	pieceType: string
): RundownEditorLayeredVideoPieceType | undefined {
	const normalized = pieceType.trim().toLowerCase()
	return (RUNDOWN_EDITOR_LAYERED_VIDEO_PIECE_TYPES as readonly string[]).includes(normalized)
		? (normalized as RundownEditorLayeredVideoPieceType)
		: undefined
}

/** Membership check after trim/lowercase — returns boolean (not a type predicate on the raw input). */
export function isRundownEditorLayeredVideoPieceType(pieceType: string): boolean {
	return normalizeRundownEditorLayeredVideoPieceType(pieceType) !== undefined
}

export function playLayerForVideoPieceType(pieceType: RundownEditorLayeredVideoPieceType): VideoPlayLayer {
	if (pieceType === 'intro') return 'effects'
	if (pieceType === 'wipe') return 'wipe'
	return 'background'
}

export const DEFAULT_WIPE_FILE = 'wipes/wipe'

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
