import {
	IBlueprintPart,
	IBlueprintPiece,
	IBlueprintPieceType,
	ICommonContext,
	PieceLifespan,
	TSR,
} from '@sofie-automation/blueprints-integration'
import { GraphicObject, SomeObject, VideoObject, ObjectType } from '../../../common/definitions/objects.js'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers, SisyfosLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { getHypercomposedChannels } from '../../studio/applyConfig/mappings/casparcg.js'
import { createMediaFileExpectedPackage, toCasparPlayPath } from './mediaPackages.js'
import {
	DEFAULT_WIPE_DURATION_MS,
	DEFAULT_WIPE_PREROLL_MS,
	WIPE_CUT_POINT_MS,
	WIPE_FRAME_MS,
	getVideoPlayLayer,
	normalizeLayeredVideoFileName,
	resolveWipeAirCutMs,
	resolveWipeDurationMs,
	wipePlayoutLatencyFromConfig,
	pgmWipeEffectsLayerForFile,
	isPgmWipeEffectsLayer,
	applyCrossSlotWipeAirCutBias,
	isWipePocasieFile,
	partHasOutroOverlay,
} from './clips.js'
import { getAudioObjectOnLayer } from './audio.js'
import { createWipeBackgroundMusicMutePiece, getWipeForceMuteChannels } from './backgroundMusic.js'
import { delayCountupRevealToWipeCut } from './countupReveal.js'
import { DEFAULT_WIPE_FILE } from '../../../common/definitions/rundownEditorTypes.js'
import { createLookCameraClearTimelineObject } from './pgmCamera.js'
import { createFullBgLoopPiece } from './fullBgLoop.js'

export type LookSlot = 'A' | 'B'

/** Default Take-relative air cut for classical `wipes/wipe` (cover-centre + latency). */
const DEFAULT_WIPE_AIR_CUT_MS = resolveWipeAirCutMs(undefined, DEFAULT_WIPE_DURATION_MS, DEFAULT_WIPE_FILE)

/**
 * Caspar channel format used when converting wipe cut-point ms → STING frames.
 * Note: casparcg-state `Transition.delay` expects **milliseconds** and calls
 * `time2Frames` itself — do not pre-convert when setting `inTransition.delay`.
 */
export const WIPE_STING_FRAME_RATE = 50

/** Default wait so CEF + clips can cue on the idle BG channel before a wiped Take. */
export const DEFAULT_LOOK_PREROLL_MS = 1500

/**
 * Hard-cut only: brief beat after outgoing `CG STOP` before the next L3D ADDs.
 * Wiped Takes must not use this — the wipe covers from frame 0; delaying the
 * overlay/route made Take look like a hard cut (tear/glitch) then a late sting.
 */
export const L3D_OUT_MS = 200

/**
 * Minimum look-MEDIA postroll so Sofie can hold the previous picture into the
 * next Take's wipe keepalive window.
 *
 * Sofie piece groups end at `control.end + postrollDuration`. The next part's
 * `previousPartKeepaliveDuration` (editorial RE `cutPoint`) only keeps picture
 * if this postroll is ≥ that keepalive. Inlining 2500 ({@link DEFAULT_WIPE_DURATION_MS})
 * avoids reading clips.ts at module init (webpack CJS: clips → baseline → pgmLook).
 */
export const LOOK_MEDIA_POSTROLL_MS = 2500

/**
 * Short finite EMPTY for hard-cut look-ILU pulse clears (not wiped). Kept at the
 * default cover-frame length so a lingering weather map dies quickly without
 * riding an open-ended EMPTY into the next Take.
 */
export const LOOK_ILU_HARD_CUT_CLEAR_MS = 380

/**
 * Same-slot / cross-slot hard cuts: delay incoming look PLAY (and cross-slot
 * `route://` flip) by this many ms so previous keepalive can cover Caspar's
 * cold-PLAY seam. Two frames @50fps.
 *
 * Must stay **strictly less** than {@link LOOK_HARD_CUT_KEEPALIVE_MS} — abutting
 * delay===keepalive (#120) still flashed black when incoming PLAY lagged a frame.
 */
export const LOOK_HARD_CUT_INCOMING_DELAY_MS = WIPE_FRAME_MS * 2

/**
 * @deprecated Prefer {@link LOOK_HARD_CUT_INCOMING_DELAY_MS} / {@link LOOK_HARD_CUT_KEEPALIVE_MS}.
 * Kept as an alias of the incoming delay for leave-weather (+2f under cover) call sites.
 */
export const LOOK_HARD_CUT_OVERLAP_MS = LOOK_HARD_CUT_INCOMING_DELAY_MS

/**
 * Floor for Caspar cold PLAY→first-frame on look clips after LOAD/PAUSE is not
 * available (same-slot hard cuts). Operator Caspar logs (2026-09-28): Latency
 * 4–14 frames @50fps on SYN/ILU. Keepalive must cover delay + this floor or
 * baseline Full `loops/bg_loop` fills the hole on `route://4`.
 */
export const LOOK_HARD_CUT_CASPAR_LATENCY_MS = WIPE_FRAME_MS * 14

/**
 * Extra frames past the Caspar latency floor before cross-slot `route://` flips.
 * Abutting first-frame === route (#120/#122) still blinked black when Latency hit
 * the 14f ceiling after hot-PLAY at {@link LOOK_HARD_CUT_INCOMING_DELAY_MS}.
 */
export const LOOK_HARD_CUT_ROUTE_HEADROOM_MS = WIPE_FRAME_MS * 2

/**
 * Hold previous look MEDIA this long into the next hard-cut Take.
 * delay + Caspar latency floor + route headroom so same-slot cold PLAY / cross-slot
 * hot-PLAY cannot open a seam filled by baseline `bg_loop` or black.
 * Cross-slot idle looks use {@link applyHardCutIdleLookHotCue} instead (LOADBG).
 */
export const LOOK_HARD_CUT_KEEPALIVE_MS =
	LOOK_HARD_CUT_INCOMING_DELAY_MS + LOOK_HARD_CUT_CASPAR_LATENCY_MS + LOOK_HARD_CUT_ROUTE_HEADROOM_MS

/**
 * Outgoing look-MEDIA postroll on **hard-cut** Takes (no wipe on this part).
 * Kept near cover-frame + keepalive — full wipe-style postroll (2500) on hard cuts
 * made `bg_loop` / companion loops linger on DB↔Full switches.
 * Must be ≥ {@link LOOK_HARD_CUT_KEEPALIVE_MS}.
 */
export const LOOK_HARD_CUT_POSTROLL_MS = LOOK_ILU_HARD_CUT_CLEAR_MS + LOOK_HARD_CUT_KEEPALIVE_MS

/**
 * Same-slot wiped Takes (DB→DB / Full→Full): cold PLAY of incoming look MEDIA at the
 * air cut lands ~2f late vs the classical cover centre (operator frame-by-frame on
 * ILU GABIKA AVIZO → ILU FERENCAK). Start the look cut this many ms earlier so the
 * first decoded frame meets the cover; wipe overlay / PGM route keep the full air cut.
 */
export const SAME_SLOT_WIPE_AIR_CUT_LEAD_MS = WIPE_FRAME_MS * 2

export const LOOK_A_LAYERS = {
	clip: CasparCGLayers.CasparCGClipPlayer2,
	camera: CasparCGLayers.CasparCGPgmCamera,
	ilu: CasparCGLayers.CasparCGPgmIluPlayer,
	doubleBoxLoop: CasparCGLayers.CasparCGPgmDoubleBoxLoop,
	lowerThird: CasparCGLayers.CasparCGGraphicsPgmLowerThird,
} as const

export const LOOK_B_LAYERS = {
	clip: CasparCGLayers.CasparCGClipPlayer2B,
	camera: CasparCGLayers.CasparCGPgmCameraB,
	ilu: CasparCGLayers.CasparCGPgmIluPlayerB,
	doubleBoxLoop: CasparCGLayers.CasparCGPgmDoubleBoxLoopB,
	lowerThird: CasparCGLayers.CasparCGGraphicsPgmLowerThirdB,
} as const

export type LookLayers = {
	clip: CasparCGLayers
	camera: CasparCGLayers
	ilu: CasparCGLayers
	doubleBoxLoop: CasparCGLayers
	lowerThird: CasparCGLayers
}

const LOOK_A_TO_B: Readonly<Record<string, CasparCGLayers>> = {
	[LOOK_A_LAYERS.clip]: LOOK_B_LAYERS.clip,
	[LOOK_A_LAYERS.camera]: LOOK_B_LAYERS.camera,
	[LOOK_A_LAYERS.ilu]: LOOK_B_LAYERS.ilu,
	[LOOK_A_LAYERS.doubleBoxLoop]: LOOK_B_LAYERS.doubleBoxLoop,
	[LOOK_A_LAYERS.lowerThird]: LOOK_B_LAYERS.lowerThird,
}

const LOOK_COMPOSE_LAYERS = new Set<string>([
	...Object.values<CasparCGLayers>(LOOK_A_LAYERS),
	...Object.values<CasparCGLayers>(LOOK_B_LAYERS),
])

export function isHypercomposedStudio(config: StudioConfig): boolean {
	return Boolean(config.casparcg.hypercomposed)
}

/**
 * Semantic look channels (not index ping-pong):
 * - DoubleBox → look `'A'` → `bgChannelA` (default Caspar **3**)
 * - Full (headlines / SYN / weather / fullscreen cam) → look `'B'` → `bgChannelB` (default **4**)
 */
export function lookSlotForKind(kind: 'doublebox' | 'full'): LookSlot {
	return kind === 'doublebox' ? 'A' : 'B'
}

/** True when this part should compose on the DoubleBox channel (BG A / ch3). */
export function isDoubleBoxLook(rawType: string | undefined, objects: SomeObject[]): boolean {
	if (/doublebox|double-box/i.test(rawType || '')) return true
	// ZAVER / závěr avízo uses LED `ilu-zaver` + Full-look CAM/`l3d-odporucanie`
	// (route://4 + route://5) — never DoubleBox / db_loop. Skip cam EMPTY when the
	// part owns look CAM so Full CLEAR cannot kill 4-115.
	return objects.some((obj) => {
		if (obj.objectType !== ObjectType.Graphic) return false
		const clip = String((obj as GraphicObject).clipName || '').toLowerCase()
		return clip === 'gfx/doublebox-ilu'
	})
}

/**
 * Tracks the last look-bearing slot so non-look parts (Remote / Titles / DVE)
 * can peek a stable underlay. Slot choice itself is look-kind based, not alternating.
 */
export interface LookSlotSequence {
	/** Remember the slot used by the latest look-bearing (or intro) part. */
	claim(slot: LookSlot): LookSlot
	/** Last claimed slot, or `'B'` (Full) if none yet — does not change state. */
	peek(): LookSlot
}

export function createLookSlotSequence(): LookSlotSequence {
	let last: LookSlot | undefined
	return {
		claim(slot: LookSlot): LookSlot {
			last = slot
			return slot
		},
		peek(): LookSlot {
			// Default Full — smoke opens on headlines (`route://4`) before any DoubleBox.
			return last ?? 'B'
		},
	}
}

/** Rundown id for the active blueprint generation (set by {@link beginLookSlotGeneration}). */
let activeLookSlotGenerationRundownId: string | undefined

const lookSlotSequencesByRundownId = new Map<string, LookSlotSequence>()

/** Start a fresh look-slot sequence for this rundown (called from getRundown). */
export function beginLookSlotGeneration(rundownId: string): void {
	lookSlotSequencesByRundownId.delete(rundownId)
	activeLookSlotGenerationRundownId = rundownId
}

/** Shared sequence for all segments in the current rundown generation. */
export function getLookSlotSequenceForGeneration(rundownId: string): LookSlotSequence {
	if (activeLookSlotGenerationRundownId !== rundownId) {
		beginLookSlotGeneration(rundownId)
	}

	let sequence = lookSlotSequencesByRundownId.get(rundownId)
	if (!sequence) {
		sequence = createLookSlotSequence()
		lookSlotSequencesByRundownId.set(rundownId, sequence)
	}
	return sequence
}

/** Test helper — vitest shares the module between cases. */
export function resetLookSlotGenerationForTests(): void {
	lookSlotSequencesByRundownId.clear()
	activeLookSlotGenerationRundownId = undefined
}

export function getLookLayers(slot: LookSlot): LookLayers {
	return slot === 'B' ? LOOK_B_LAYERS : LOOK_A_LAYERS
}

export function getLookCasparChannel(config: StudioConfig, slot: LookSlot): number {
	const channels = getHypercomposedChannels({ studio: config })
	return slot === 'B' ? channels.bgChannelB : channels.bgChannelA
}

export function getLookPrerollMs(config: StudioConfig): number {
	const raw = config.casparcg.hypercomposed?.lookPrerollMs
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
		return Math.floor(raw)
	}
	return DEFAULT_LOOK_PREROLL_MS
}

export function isLookComposeLayer(layer: string): boolean {
	return LOOK_COMPOSE_LAYERS.has(layer)
}

/** Convert wipe cut-point ms → frames at {@link WIPE_STING_FRAME_RATE} (docs / tests only). */
export function wipeStingDelayFrames(cutPointMs: number = WIPE_CUT_POINT_MS): number {
	return Math.max(0, Math.round((cutPointMs / 1000) * WIPE_STING_FRAME_RATE))
}

export function findWipeVideoObject(objects: SomeObject[]): VideoObject | undefined {
	return objects.find(
		(object): object is VideoObject => object.objectType === ObjectType.Video && getVideoPlayLayer(object) === 'wipe'
	)
}

function remapLayerId(layer: string, slot: LookSlot): string {
	if (slot === 'A') return layer
	return LOOK_A_TO_B[layer] ?? layer
}

export function remapLookLayers(pieces: IBlueprintPiece[], slot: LookSlot): void {
	if (slot === 'A') return

	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			obj.layer = remapLayerId(String(obj.layer), slot)
		}
		for (const pkg of piece.expectedPackages ?? []) {
			if (!('layers' in pkg) || !Array.isArray(pkg.layers)) continue
			pkg.layers = pkg.layers.map((layer) => remapLayerId(String(layer), slot))
		}
	}
}

/** True when a look piece still opens native live capture (should not happen after ch5 ingest). */
function isLiveCameraProducerFile(file: unknown): boolean {
	if (typeof file !== 'string') return false
	const lower = file.toLowerCase().trim()
	return lower.startsWith('dshow://') || lower.startsWith('v4l2://') || lower.startsWith('decklink://')
}

function isLiveCameraTimelineContent(content: { type?: string; file?: unknown; inputType?: string }): boolean {
	if (content?.type === TSR.TimelineContentTypeCasparCg.INPUT && content.inputType === 'decklink') {
		return true
	}
	return content?.type === TSR.TimelineContentTypeCasparCg.MEDIA && isLiveCameraProducerFile(content.file)
}

function pieceUsesLiveCameraProducer(piece: IBlueprintPiece): boolean {
	return (piece.content.timelineObjects ?? []).some((obj) => {
		const content = obj.content as { type?: string; file?: unknown; inputType?: string }
		return isLiveCameraTimelineContent(content)
	})
}

function applyLookPreroll(pieces: IBlueprintPiece[], prerollMs: number): void {
	if (prerollMs <= 0) return

	for (const piece of pieces) {
		const objs = piece.content.timelineObjects ?? []
		const usesLook = objs.some((obj) => isLookComposeLayer(String(obj.layer)))
		if (!usesLook) continue
		// L3D HTML templates: ADD timing is Take-relative via applyL3dTakeOffsets.
		// Inflating prerollDuration on those pieces made Sofie hold the CG until
		// Take+preroll+enable (~4s after wipe CLEAR). Media LOADBG preroll stays.
		const hasL3dTemplate = objs.some((obj) => {
			const layer = String(obj.layer)
			if (!L3D_TEMPLATE_LAYERS.has(layer)) return false
			return isCasparTemplate(obj.content as { type?: string })
		})
		if (hasL3dTemplate) continue
		// Editorial look MEDIA (VO/VT clips, ILU, weather map): same Sofie hold —
		// piece.prerollDuration delayed audible/visible start ~1.2–1.5s after wipe end
		// (SJV ILU audio, sport leak under wipe_pocasie). Wipe piece already has
		// DEFAULT_WIPE_PREROLL_MS for LOADBG on the sting.
		const sourceId = String(piece.sourceLayerId)
		if (
			sourceId === (SourceLayer.VO as string) ||
			sourceId === (SourceLayer.VT as string) ||
			sourceId === (SourceLayer.GFX as string) ||
			// DoubleBox frame + Full companion loop: Sofie hold opened a black hole after
			// keepalive ended at cut while incoming db_loop waited Take+preroll.
			sourceId === (SourceLayer.PgmDoubleBoxLoop as string) ||
			sourceId === (SourceLayer.FullBgLoop as string)
		) {
			continue
		}
		const hasEditorialLookMedia = objs.some((obj) => {
			const layer = String(obj.layer)
			const content = obj.content as { type?: string; file?: string }
			if (!isCasparMedia(content) || content.file === 'EMPTY') return false
			return (
				layer === (LOOK_A_LAYERS.clip as string) ||
				layer === (LOOK_B_LAYERS.clip as string) ||
				layer === (LOOK_A_LAYERS.ilu as string) ||
				layer === (LOOK_B_LAYERS.ilu as string) ||
				layer === (CasparCGLayers.CasparCGIluPlayer as string)
			)
		})
		if (hasEditorialLookMedia) continue
		// Look CAM is MEDIA route://5 — same Sofie hold risk on wiped DB Takes.
		const hasLookRouteCamera = objs.some((obj) => {
			const layer = String(obj.layer)
			if (layer !== (LOOK_A_LAYERS.camera as string) && layer !== (LOOK_B_LAYERS.camera as string)) return false
			const content = obj.content as { type?: string; file?: string }
			return isCasparMedia(content) && typeof content.file === 'string' && content.file.startsWith('route://')
		})
		if (hasLookRouteCamera) continue
		// Native DeckLink/dshow must not LOADBG on look layers (ingest helper owns the device).
		// Look CAM is normally MEDIA route://5 — safe to preroll; skip only if a piece still has INPUT.
		if (pieceUsesLiveCameraProducer(piece)) continue
		piece.prerollDuration = Math.max(piece.prerollDuration ?? 0, prerollMs)
	}
}

/**
 * Same-slot hard cut: delay look compose MEDIA that would otherwise PLAY at Take so
 * previousPartKeepaliveDuration can hold the outgoing picture across
 * {@link LOOK_HARD_CUT_INCOMING_DELAY_MS}. Skips EMPTY clears, L3D templates, and continuous
 * `db_loop` (must not blink between DoubleBoxes).
 *
 * Do **not** LOAD/PAUSE (`playing: false`) here — same-slot would replace the on-air
 * outgoing clip. True overlap comes from keepalive covering delay + Caspar latency
 * ({@link LOOK_HARD_CUT_KEEPALIVE_MS}).
 */
function delayHardCutLookMedia(pieces: IBlueprintPiece[], delayMs: number): void {
	if (delayMs <= 0) return
	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			const layer = String(obj.layer)
			if (!isLookComposeLayer(layer) || L3D_TEMPLATE_LAYERS.has(layer)) continue
			const content = obj.content as { type?: string; file?: string }
			if (!isCasparMedia(content) || content.file === 'EMPTY') continue
			if (layer === (LOOK_A_LAYERS.doubleBoxLoop as string) || layer === (LOOK_B_LAYERS.doubleBoxLoop as string)) {
				continue
			}
			shiftEnableStartIfAtTake(obj, delayMs)
		}
	}
}

/**
 * Cross-slot hard cut onto the **idle** look channel: LOAD/PAUSE compose MEDIA from
 * Take, then hot PLAY at `playAtMs`. The PGM `route://` flip is delayed separately
 * (see {@link LOOK_HARD_CUT_KEEPALIVE_MS}) so the first frame is ready before PGM
 * leaves the previous channel — otherwise baseline Full `loops/bg_loop` (or black)
 * flashes for Caspar Latency 4–14f.
 *
 * Same pattern as wiped {@link applyL3dTakeOffsets} `preloadIdleLookMedia`. Skips
 * EMPTY, L3D templates, and continuous `db_loop`. Preserves editorial `seek` on
 * clips; defaults to 0 only when unset. Look CAM `route://5` is unchanged (no seek).
 */
function applyHardCutIdleLookHotCue(pieces: IBlueprintPiece[], playAtMs: number): void {
	if (playAtMs < 0) return
	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			const layer = String(obj.layer)
			if (!isLookComposeLayer(layer) || L3D_TEMPLATE_LAYERS.has(layer)) continue
			const content = obj.content as { type?: string; file?: string; seek?: number }
			if (!isCasparMedia(content) || content.file === 'EMPTY') continue
			if (layer === (LOOK_A_LAYERS.doubleBoxLoop as string) || layer === (LOOK_B_LAYERS.doubleBoxLoop as string)) {
				continue
			}
			const isRoute = typeof content.file === 'string' && content.file.startsWith('route://')
			if (isRoute) {
				applyCasparHotPlayCue(obj as TimelineBlueprintExt, playAtMs)
				continue
			}
			const seekMs = typeof content.seek === 'number' && Number.isFinite(content.seek) ? content.seek : 0
			applyCasparHotPlayCue(obj as TimelineBlueprintExt, playAtMs, { seekMs })
		}
	}
}

/** Delay PGM `route://` hard-cut flip so previous route keepalive covers the seam. */
function delayHardCutPgmRoute(pieces: IBlueprintPiece[], delayMs: number): void {
	if (delayMs <= 0) return
	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			if (String(obj.layer) !== (CasparCGLayers.CasparCGPgmRoute as string)) continue
			const content = obj.content as { type?: string; file?: string }
			if (!isCasparMedia(content)) continue
			shiftEnableStartIfAtTake(obj, delayMs)
		}
	}
}

/**
 * Full-channel underlay as MEDIA `route://N` (not TSR ROUTE).
 * casparcg-state `setDefaultValue` coerces ROUTE `layer` null/undefined → 0, so AMCP
 * becomes `route://N-0` (empty layer → black PGM) instead of the full mix `route://N`.
 *
 * Story-block wipes prefer EffectsPlayer overlay + delayed hard-cut (see
 * {@link wipeUsesPgmOverlay}) — STING on the route is kept only as an optional escape
 * hatch. When used, `delay` must be **ms** (casparcg-state converts to frames).
 */
export function createFullChannelRouteContent(
	channel: number,
	stingFile?: string,
	cutPointMs: number = DEFAULT_WIPE_AIR_CUT_MS
): TSR.TimelineContentCCGMedia {
	return {
		deviceType: TSR.DeviceType.CASPARCG,
		type: TSR.TimelineContentTypeCasparCg.MEDIA,
		file: `route://${channel}`,
		noStarttime: true,
		...(stingFile
			? {
					transitions: {
						inTransition: {
							type: TSR.Transition.STING,
							maskFile: stingFile,
							overlayFile: stingFile,
							delay: cutPointMs,
						},
					},
				}
			: {}),
	}
}

/** Parse `route://3` / `route://3-0` style MEDIA files back to the Caspar channel. */
export function parseRouteMediaChannel(file: unknown): number | undefined {
	if (typeof file !== 'string') return undefined
	const match = /^route:\/\/(\d+)(?:-\d+)?$/i.exec(file.trim())
	if (!match) return undefined
	return Number(match[1])
}

export function createPgmRouteTimelineObject(
	config: StudioConfig,
	slot: LookSlot,
	wipeFile?: string,
	options?: { sting?: boolean; routeStartMs?: number; cutPointMs?: number }
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	const channel = getLookCasparChannel(config, slot)
	const useSting = Boolean(wipeFile) && options?.sting !== false
	const stingFile = useSting && wipeFile ? toCasparPlayPath(wipeFile) : undefined
	const routeStartMs = options?.routeStartMs ?? 0
	const cutPointMs = options?.cutPointMs ?? DEFAULT_WIPE_AIR_CUT_MS

	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { start: routeStartMs },
		layer: CasparCGLayers.CasparCGPgmRoute,
		priority: 1,
		content: createFullChannelRouteContent(channel, stingFile, cutPointMs),
	})
}

/**
 * Alpha-only wipe overlay mixer for PGM 205.
 *
 * Do **not** set `chroma` — even `Chroma.NONE` makes playout emit
 * `MIXER … CHROMA 0 undefined …` (broken AMCP). Do **not** set
 * `straightAlpha` on a layer: casparcg-state only emits it when
 * `layerNo === -1` as channel `MIXER STRAIGHT_ALPHA_OUTPUT` (DeckLink
 * key/fill output), never as a per-layer “treat clip as straight alpha”
 * switch. Caspar’s compositor always expects **premultiplied** content.
 */
export const PGM_WIPE_OVERLAY_MIXER: NonNullable<TSR.TimelineContentCCGMedia['mixer']> = {
	keyer: false,
	blend: TSR.BlendMode.NORMAL,
	opacity: 1,
	fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
	volume: 1,
}

/**
 * Remastered `wipes/wipe*.mov` are straight (non-premul) alpha. Without this
 * FILTER, opaque wipe graphics look semi-translucent wherever alpha is soft —
 * Caspar composites as if RGB were already ×α.
 * Maps to AMCP `PLAY … FILTER premultiply=inplace=1`.
 */
export const PGM_WIPE_STRAIGHT_TO_PREMUL_FILTER = 'premultiply=inplace=1'

/**
 * Explicit LOADBG → hot PLAY: `playing: false` cues Caspar LOAD/PAUSE, then a
 * keyframe sets `playing: true` at `playAtMs` (object-relative). Sofie Lookahead
 * PRELOAD copies strip keyframes without `preserveForLookahead`, so EffectsPlayer
 * PRELOAD LOADBGs the paused cue while Next; Take applies the PLAY keyframe hot.
 * Idle look layers (lookahead NONE) use the same pattern with `playAtMs` = air cut
 * so LOAD runs from Take under the sting and PLAY is hot when `route://` flips.
 */
function applyCasparHotPlayCue(obj: TimelineBlueprintExt, playAtMs: number, options?: { seekMs?: number }): void {
	const content = obj.content as TSR.TimelineContentCCGMedia
	content.playing = false
	if (options?.seekMs !== undefined) {
		content.seek = options.seekMs
	}
	const existing = (obj.keyframes ?? []) as NonNullable<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']>
	obj.keyframes = [
		...existing,
		{
			id: '',
			enable: { start: Math.max(0, Math.floor(playAtMs)) },
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				playing: true,
			},
		},
	]
}

function createPgmWipeOverlayTimelineObject(
	wipeFile: string,
	wipeDurationMs: number,
	startMs: number = 0
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	const overlay = literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { start: startMs, duration: wipeDurationMs },
		layer: pgmWipeEffectsLayerForFile(wipeFile),
		priority: 1,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: toCasparPlayPath(wipeFile),
			// Frame 0 for Sofie PRELOAD LOADBG + Take hot-PLAY (same decoder cue).
			seek: 0,
			videoFilter: PGM_WIPE_STRAIGHT_TO_PREMUL_FILTER,
			mixer: { ...PGM_WIPE_OVERLAY_MIXER },
		},
	})
	// LOADBG (playing:false) from object start; hot PLAY at Take (keyframe start 0).
	// Sofie PRELOAD while Next strips this keyframe → paused LOADBG on EffectsPlayer.
	applyCasparHotPlayCue(overlay, 0, { seekMs: 0 })
	return overlay
}

/**
 * All hypercomposed story-block wipes PLAY on a PGM EffectsPlayer layer (205–208
 * by wipe file) and hard-cut MEDIA `route://N` at the air cut (editorial file cut
 * + playout latency) under the cover.
 *
 * DoubleBox previously used Caspar STING on the route, but casparcg-state coerces
 * ROUTE `layer` → 0 (`route://N-0` → black PGM) and STING `delay` was easy to
 * mis-unit (frames vs ms → TRIGGER_POINT=0). Overlay + delayed MEDIA cut matches
 * the working Full-section path (SJV / ŠPORT / Počasie / tip).
 */
export function wipeUsesPgmOverlay(_slot: LookSlot): boolean {
	return true
}

function createPgmRoutePiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string,
	slot: LookSlot,
	wipe: VideoObject | undefined,
	wipeFile: string | undefined,
	wipeCutPointMsOverride?: number
): IBlueprintPiece {
	const hasWipe = Boolean(wipe && wipeFile)
	const overlayWipe = hasWipe && wipeUsesPgmOverlay(slot)
	const wipeDurationMs = resolveWipeDurationMs(wipe?.duration, wipeFile)
	const wipeCutPointMs =
		wipeCutPointMsOverride ??
		resolveWipeAirCutMs(wipe?.attributes, wipeDurationMs, wipeFile, wipePlayoutLatencyFromConfig(config))
	const transitionLabel =
		typeof wipe?.attributes?.transition === 'string' && wipe.attributes.transition.trim()
			? wipe.attributes.transition.trim()
			: undefined

	const timelineObjects: TimelineBlueprintExt[] = []
	if (overlayWipe && wipeFile) {
		// Overlay from Take (0) — never leave a naked hard-cut window before the sting.
		timelineObjects.push(createPgmWipeOverlayTimelineObject(wipeFile, wipeDurationMs, 0))
		timelineObjects.push(
			createPgmRouteTimelineObject(config, slot, wipeFile, {
				sting: false,
				routeStartMs: wipeCutPointMs,
				cutPointMs: wipeCutPointMs,
			})
		)
	} else {
		timelineObjects.push(
			createPgmRouteTimelineObject(config, slot, wipeFile, {
				sting: hasWipe,
				routeStartMs: 0,
				cutPointMs: wipeCutPointMs,
			})
		)
	}

	if (hasWipe) {
		const wipeMutes = getWipeForceMuteChannels(config)
		if (wipeMutes.length > 0) {
			timelineObjects.push({
				...getAudioObjectOnLayer(config, SisyfosLayers.ForceMute, wipeMutes),
				enable: {
					start: 0,
					duration: wipeDurationMs,
				},
			})
		}
	}

	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_pgm_route`,
		name: hasWipe
			? `Wipe${transitionLabel ? ` · ${transitionLabel}` : ''} | route://${getLookCasparChannel(config, slot)}`
			: `PGM route | ${slot}`,
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: hasWipe ? SourceLayer.PgmWipe : SourceLayer.PgmRoute,
		outputLayerId: getOutputLayerForSourceLayer(hasWipe ? SourceLayer.PgmWipe : SourceLayer.PgmRoute),
		...(hasWipe ? { pieceType: IBlueprintPieceType.InTransition } : {}),
		content: {
			fileName: wipeFile,
			ignoreAudioFormat: true,
			ignoreMediaObjectStatus: true,
			timelineObjects,
		},
		expectedPackages: wipeFile
			? [
					createMediaFileExpectedPackage(
						context,
						wipeFile,
						overlayWipe
							? [pgmWipeEffectsLayerForFile(wipeFile), CasparCGLayers.CasparCGPgmRoute]
							: [CasparCGLayers.CasparCGPgmRoute],
						{
							includeSideEffects: true,
						}
					),
				]
			: undefined,
		// Wipe overlay needs a long LOADBG window. Sofie excludes InTransition preroll
		// from toPartDelay — do not put this preroll on Normal look pieces.
		prerollDuration: hasWipe
			? Math.max(config.casparcgLatency, getLookPrerollMs(config), DEFAULT_WIPE_PREROLL_MS)
			: config.casparcgLatency,
	})
}

function attachRouteToWipePiece(
	context: ICommonContext,
	config: StudioConfig,
	wipePiece: IBlueprintPiece,
	slot: LookSlot,
	wipeFile: string,
	wipeDurationMs: number,
	wipeCutPointMs: number = DEFAULT_WIPE_AIR_CUT_MS
): void {
	const mutes = (wipePiece.content.timelineObjects ?? []).filter(
		(obj) => String(obj.layer) === (SisyfosLayers.ForceMute as string)
	)
	// Keep ForceMute aligned with the wipe SFX / overlay window (not an open-ended mute).
	for (const mute of mutes) {
		mute.enable = { start: 0, duration: wipeDurationMs }
	}
	const overlayWipe = wipeUsesPgmOverlay(slot)
	wipePiece.content.timelineObjects = overlayWipe
		? [
				createPgmWipeOverlayTimelineObject(wipeFile, wipeDurationMs, 0),
				createPgmRouteTimelineObject(config, slot, wipeFile, {
					sting: false,
					routeStartMs: wipeCutPointMs,
					cutPointMs: wipeCutPointMs,
				}),
				...mutes,
			]
		: [
				createPgmRouteTimelineObject(config, slot, wipeFile, {
					sting: true,
					routeStartMs: 0,
					cutPointMs: wipeCutPointMs,
				}),
				...mutes,
			]
	wipePiece.enable = { start: 0 }
	wipePiece.pieceType = IBlueprintPieceType.InTransition
	wipePiece.prerollDuration = Math.max(config.casparcgLatency, getLookPrerollMs(config), DEFAULT_WIPE_PREROLL_MS)
	wipePiece.content.ignoreAudioFormat = true
	wipePiece.content.ignoreMediaObjectStatus = true
	wipePiece.expectedPackages = [
		createMediaFileExpectedPackage(
			context,
			wipeFile,
			overlayWipe
				? [pgmWipeEffectsLayerForFile(wipeFile), CasparCGLayers.CasparCGPgmRoute]
				: [CasparCGLayers.CasparCGPgmRoute],
			{
				includeSideEffects: true,
			}
		),
	]
	const channel = getLookCasparChannel(config, slot)
	if (!wipePiece.name.includes('route://')) {
		wipePiece.name = `${wipePiece.name.replace(/\s*\|\s*[\w./-]+$/, '')} | route://${channel}`
	}
}

/**
 * Map story looks onto BG A (DoubleBox) / BG B (Full) and hold PGM on a full-channel route.
 * Wiped Takes PLAY wipe on PGM EffectsPlayer and hard-cut MEDIA `route://N` at the wipe
 * cut point (DoubleBox → ch3, Full → ch4). Hard cuts re-assert `route://N` with no
 * transition. Logo / intro stay on PGM above the route.
 *
 * During wipe SFX, mute Caspar mixer volume on SYN/ILU/look clip layers so only the wipe
 * bed is audible (Sisyfos ForceMute alone does not duck route:// clip audio).
 */
export function finalizeHypercomposedPart(
	context: ICommonContext,
	config: StudioConfig,
	part: IBlueprintPart,
	partExternalId: string,
	objects: SomeObject[],
	pieces: IBlueprintPiece[],
	lookSlot: LookSlot = 'A',
	/** Look claimed for the previous part. Same slot ⇒ this channel is still on-air (DB→DB). */
	previousLookSlot?: LookSlot
): void {
	if (!isHypercomposedStudio(config)) return

	if (shouldClearLookCamera(pieces)) {
		const clearObj = createLookCameraClearTimelineObject()
		const hostPiece = pieces.find(
			(piece) =>
				piece.sourceLayerId === (SourceLayer.VO as string) ||
				piece.sourceLayerId === (SourceLayer.VT as string) ||
				piece.sourceLayerId === (SourceLayer.GFX as string)
		)
		if (hostPiece) {
			hostPiece.content.timelineObjects = [...(hostPiece.content.timelineObjects ?? []), clearObj]
		} else {
			pieces.push(
				literal<IBlueprintPiece>({
					enable: { start: 0 },
					externalId: `${partExternalId}_look_cam_clear`,
					name: 'Look CAM clear',
					lifespan: PieceLifespan.WithinPart,
					sourceLayerId: SourceLayer.Camera,
					outputLayerId: getOutputLayerForSourceLayer(SourceLayer.Camera),
					content: { timelineObjects: [clearObj] },
				})
			)
		}
	}

	remapLookLayers(pieces, lookSlot)

	const wipe = findWipeVideoObject(objects)
	const wipeFile = wipe
		? normalizeLayeredVideoFileName(
				'wipe',
				(typeof wipe.attributes?.fileName === 'string' && wipe.attributes.fileName.trim()) ||
					wipe.clipName ||
					DEFAULT_WIPE_FILE
			)
		: undefined
	const wipeDurationMs = resolveWipeDurationMs(wipe?.duration, wipeFile)
	const hasWipe = Boolean(wipe && wipeFile)
	const wipePocasie = Boolean(wipeFile && isWipePocasieFile(wipeFile))
	const sameLookChannel = previousLookSlot !== undefined && previousLookSlot === lookSlot
	// Air cut = editorial cutPoint + cover centre + PRELOAD latency. Cross-slot
	// bias is a no-op (early ADEL→GUBIK was cold PLAY after wrong-file PRELOAD
	// on shared 205 — fixed by per-file layers 205–208).
	const wipeCutPointMs = applyCrossSlotWipeAirCutBias(
		resolveWipeAirCutMs(wipe?.attributes, wipeDurationMs, wipeFile, wipePlayoutLatencyFromConfig(config)),
		wipeDurationMs,
		Boolean(hasWipe && previousLookSlot !== undefined && !sameLookChannel)
	)
	// Same-slot wiped Takes cold-PLAY look MEDIA at the cut (cannot LOADBG over on-air).
	// Operator frame-by-frame (ILU GABIKA AVIZO → ILU FERENCAK): that PLAY lands ~2f
	// after the classical cover centre — lead the look cut so the first frame meets cover.
	// Wipe overlay / PGM route / countup keep the full air cut.
	const wipeLookCutMs =
		hasWipe && sameLookChannel ? Math.max(0, wipeCutPointMs - SAME_SLOT_WIPE_AIR_CUT_LEAD_MS) : wipeCutPointMs
	// Leave-weather into wiped ZAVER: detect early so keepalive / WX hide can wait for
	// solid cover (not Take, not a bare air-cut while the sting is still incomplete).
	const leaveWeatherUnderWipe = Boolean(
		hasWipe && !partHasLookIluMedia(pieces, lookSlot) && partHasActiveIluZaver(pieces)
	)
	/** Hide previous weather L3D/ILU this far into the Take (air cut + 2f under cover). */
	const leaveWeatherHideMs = leaveWeatherUnderWipe
		? Math.min(wipeDurationMs, wipeCutPointMs + LOOK_HARD_CUT_OVERLAP_MS)
		: wipeLookCutMs

	if (hasWipe) {
		applyLookPreroll(pieces, getLookPrerollMs(config))
		// Keep previous look VIDEO only until the cover cut — not the full sting.
		// Leave-weather extends keepalive to leaveWeatherHideMs so cities/map stay until
		// the sting is actually covering (air cut alone was early when PRELOAD lagged).
		// Same-slot uses wipeLookCutMs (air cut − lead) so the switch matches the early
		// look PLAY. Full-sting keepalive left DB→DB / Full→Full switches until wipe CLEAR
		// (new look could not win while the previous part still occupied the channel).
		// L3D templates are CLEARed separately at Take — keepalive must not stack them.
		part.inTransition = {
			blockTakeDuration: wipeDurationMs,
			previousPartKeepaliveDuration: leaveWeatherHideMs,
			partContentDelayDuration: 0,
		}
		muteEditorialClipAudioDuringWipe(pieces, wipeDurationMs)
		// Kolíska beds ride Caspar audio layers — Sisyfos ForceMute does not duck them.
		pieces.push(createWipeBackgroundMusicMutePiece(config, partExternalId, wipeDurationMs))
		// Countup reveal must land under the cover with the route cut — not at Take
		// (AMCP showed PLAY countup → route:// → wipe first-frame when reveal was at 0).
		delayCountupRevealToWipeCut(pieces, wipeCutPointMs)
	} else if (previousLookSlot !== undefined) {
		// Hard cut (same-slot or cross-slot): hold previous look past the incoming
		// delay so Caspar cold-PLAY cannot open a black / bg_loop seam. Keepalive
		// covers delay + measured Caspar Latency floor + route headroom (same-slot
		// cannot LOADBG over on-air). Cross-slot idle looks LOADBG from Take and
		// hot-PLAY with route://. Do **not** raise look `prerollDuration` here —
		// Sofie toPartDelay would hold Camera/ILU (~1500 ms) past keepalive and open
		// a black / bg_loop hole on Full↔DB hard cuts (AMCP: LOAD at Take, route://
		// ~1.8s later). Idle LOADBG needs no Sofie preroll; same-slot cold-PLAYs at
		// LOOK_HARD_CUT_INCOMING_DELAY_MS under keepalive.
		part.inTransition = {
			blockTakeDuration: 0,
			previousPartKeepaliveDuration: LOOK_HARD_CUT_KEEPALIVE_MS,
			partContentDelayDuration: 0,
		}
		if (sameLookChannel) {
			delayHardCutLookMedia(pieces, LOOK_HARD_CUT_INCOMING_DELAY_MS)
		} else {
			// LOAD from Take; hot PLAY at the short delay so Caspar can decode while
			// PGM still shows the previous channel (route delayed to keepalive below).
			applyHardCutIdleLookHotCue(pieces, LOOK_HARD_CUT_INCOMING_DELAY_MS)
		}
	}

	const hasIncomingL3d = partHasIncomingL3dTemplate(pieces)
	const earliestL3dObjectTimeMs = minIncomingL3dPieceStartMs(pieces)
	// CLEAR until the first incoming L3D is on-air. Wiped Takes: that is max(wipeEnd,
	// earliest objectTime) so start:1s under wipe_sport cannot gap-fill previous CG.
	// wipe_pocasie lands weather GFX at the cover cut with bg_pocasie.
	const firstL3dOnAirMs = hasWipe
		? wipePocasie
			? wipeCutPointMs + earliestL3dObjectTimeMs
			: Math.max(wipeDurationMs, earliestL3dObjectTimeMs)
		: hasIncomingL3d
			? L3D_OUT_MS + earliestL3dObjectTimeMs
			: 0
	const l3dClearDurationMs = hasIncomingL3d ? firstL3dOnAirMs : undefined
	// Leave-weather into wiped ZAVER: hold previous weather L3D until cover is solid —
	// not cleared at Take while wipe overlay is still loading. Wipe-only GFX shells
	// keep L3D CLEAR at Take. Require an *active* on-air ilu-zaver piece — an
	// ad-lib-only ingest hit must not delay L3D CLEAR on unrelated wiped GFX.
	const l3dClearStartMs = leaveWeatherUnderWipe ? leaveWeatherHideMs : 0
	const l3dClearHoldMs =
		l3dClearDurationMs !== undefined && l3dClearStartMs > 0
			? Math.max(0, l3dClearDurationMs - l3dClearStartMs) +
				// Overlap the delayed ADD by 2f so weather cities cannot flash for a frame
				// when EMPTY ends at the same instant the new L3D enables.
				(leaveWeatherUnderWipe ? LOOK_HARD_CUT_OVERLAP_MS : 0)
			: l3dClearDurationMs

	// Kill any keepalive'd / leftover L3D before the delayed ADD. Same-template Takes
	// (SJV→SJV, ŠPORT→ŠPORT) otherwise become CG UPDATE (text swap, no IN anim).
	// All Caspar EMPTYs share {@link SourceLayer.PgmLayerClear} (not GFX) so SYN VO is
	// not pruned by exclusiveGroup `pgm`.
	const clearObjects: TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] = []
	if (hasIncomingL3d || hasWipe) {
		// Duration only until the delayed CG ADD. Wiped Takes with no incoming L3D must
		// hold EMPTY for the whole part — otherwise previous L3D returns after
		// the clear window while the sting/keepalive still covers.
		clearObjects.push(...buildL3dLayerClearObjects(lookSlot, l3dClearHoldMs, l3dClearStartMs))
	}
	// Full wipe onto a *new* look channel (e.g. DoubleBox→Full): EMPTY stale CAM /
	// db_loop on ch4 under the sting. EMPTY the clip layer only when this part has
	// no incoming clip MEDIA (clear leftover SYN) or for wipe_pocasie (prio-3 weather
	// bg_loop). Story Takes with clip MEDIA must not EMPTY — prio-2 EMPTY evicts
	// idle LOADBG (`preloadIdleLookMedia`) and lets baseline `loops/bg_loop` flash
	// at the air cut (operator 2026-09-28). Full→Full must also not EMPTY the live
	// clip (black blink). Never EMPTY look CAM when this part owns it.
	if (hasWipe && lookSlot === 'B' && !sameLookChannel) {
		const clearClip = wipePocasie || !partHasLookClipMedia(pieces, lookSlot)
		clearObjects.push(
			...buildLookChannelClearObjects(
				lookSlot,
				clearClip ? (wipePocasie ? wipeDurationMs : wipeCutPointMs) : undefined,
				{
					clearCamera: !partHasLookCameraMedia(pieces, lookSlot),
					clearClip,
				}
			)
		)
	}
	// Any wiped Full Take: kill leftover DoubleBox frame on ch3. Sofie PRELOAD used
	// to LOADBG `db_loop` during ZAVER preroll; even with lookahead NONE, OutOnSegmentEnd
	// leftovers / mistaken route://3 must not leave a stray frame. When ch3 is still the
	// outgoing PGM look (DB→Full), delay EMPTY to the route cut so the frame holds under
	// the sting; when ch3 is off-air (Full→Full / ZAVER after Počasie), clear at Take.
	// ZAVER also CLEARs look-A ILU/CAM/L3D (ilu-zaver is LED-only).
	if (hasWipe && lookSlot === 'B') {
		const dbLoopClearStartMs = previousLookSlot === 'A' ? wipeCutPointMs : 0
		clearObjects.push(emptyLookMediaObject(LOOK_A_LAYERS.doubleBoxLoop, undefined, dbLoopClearStartMs))
	}
	if (lookSlot === 'B' && partHasActiveIluZaver(pieces)) {
		// Wiped ZAVER after DoubleBox: db_loop EMPTY is already scheduled at wipeCutPointMs
		// above — do not also EMPTY it at Take via the bulk look-A clear (that would kill
		// the on-air frame under the sting before the route cut).
		clearObjects.push(
			...buildLookChannelClearObjects('A', undefined, {
				clearDoubleBoxLoop: !(hasWipe && previousLookSlot === 'A'),
			}),
			...buildLookIluClearObjects('A'),
			...buildL3dLayerClearObjects('A')
		)
	}
	// Leaving Počasie: clear bg_pocasie under wipe cover. Finite EMPTY through wipe end
	// let weather postroll flash one frame after sting CLEAR — leave-weather ZAVER uses
	// open-ended WithinPart EMPTY instead (safe: next Take is Outro, not weather).
	// Leave-weather / non-ILU Takes: EMPTY look ILU so `bg_pocasie` cannot linger
	// into ZAVER (Full) or the next story. DB Takes without look ILU also CLEAR
	// Full ILU so a lingering ch4 weather map dies under the sting.
	if (!partHasLookIluMedia(pieces, lookSlot)) {
		if (hasWipe) {
			if (leaveWeatherUnderWipe) {
				clearObjects.push(...buildLookIluClearObjects(lookSlot, undefined, leaveWeatherHideMs))
			} else {
				const leaveWeatherClearMs = Math.max(0, wipeDurationMs - wipeCutPointMs)
				clearObjects.push(...buildLookIluClearObjects(lookSlot, leaveWeatherClearMs, wipeCutPointMs))
			}
			if (lookSlot === 'A') {
				const leaveWeatherClearMs = Math.max(0, wipeDurationMs - wipeCutPointMs)
				clearObjects.push(...buildLookIluClearObjects('B', leaveWeatherClearMs, wipeCutPointMs))
			}
		} else {
			clearObjects.push(...buildLookIluClearObjects(lookSlot, LOOK_ILU_HARD_CUT_CLEAR_MS))
		}
	}
	if (clearObjects.length > 0) {
		appendPgmLayerClearPiece(pieces, partExternalId, clearObjects)
	}

	if (wipePocasie) {
		// Priority 3 WithinPart bg_loop — must beat clip EMPTY (prio 2) that now lasts
		// through the sting, so weather underlay wins at the cover cut.
		const bgLoop = createFullBgLoopPiece(context, config, partExternalId)
		for (const obj of bgLoop.content.timelineObjects ?? []) {
			obj.priority = Math.max(obj.priority ?? 0, 3)
		}
		remapLookLayers([bgLoop], lookSlot)
		pieces.push(bgLoop)
	}

	applyL3dTakeOffsets(pieces, hasWipe ? wipeDurationMs : 0, wipePocasie, wipeLookCutMs, {
		// Idle look channel under the sting: LOAD/PAUSE all compose MEDIA from Take so
		// PLAY at the air cut is hot when route://N flips. Same-slot (DB→DB / Full→Full)
		// must not early-LOAD (replaces on-air under the wipe); wipeLookCutMs leads the
		// cold PLAY by SAME_SLOT_WIPE_AIR_CUT_LEAD_MS so cover centre meets first frame.
		preloadIdleLookMedia: hasWipe && !sameLookChannel,
	})

	// Wiped ZAVER: LED `ilu-zaver` must land with WX hide under cover — not at Take
	// (before the sting covers PGM). Ad-lib-only ingest must not delay other LED ILU
	// (e.g. headline) sitting on the same Caspar layer.
	if (hasWipe && partHasActiveIluZaver(pieces)) {
		delayLedIluZaverToWipeCut(pieces, leaveWeatherHideMs)
	}

	const alreadyRouted = pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some(
			(obj) => String(obj.layer) === (CasparCGLayers.CasparCGPgmRoute as string)
		)
	)
	if (!alreadyRouted) {
		const wipePiece = pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))
		if (wipePiece && wipeFile) {
			attachRouteToWipePiece(context, config, wipePiece, lookSlot, wipeFile, wipeDurationMs, wipeCutPointMs)
		} else {
			pieces.push(
				createPgmRoutePiece(
					context,
					config,
					partExternalId,
					lookSlot,
					wipe,
					wipe ? wipeFile : undefined,
					hasWipe ? wipeCutPointMs : undefined
				)
			)
		}
	}

	// Cross-slot hard cut: delay route:// until keepalive so idle LOADBG→PLAY
	// (at LOOK_HARD_CUT_INCOMING_DELAY_MS) has LOOK_HARD_CUT_CASPAR_LATENCY_MS to
	// produce a first frame before PGM leaves the previous channel.
	if (!hasWipe && previousLookSlot !== undefined && !sameLookChannel) {
		delayHardCutPgmRoute(pieces, LOOK_HARD_CUT_KEEPALIVE_MS)
	}

	if (partHasOutroOverlay(objects)) {
		// Outro.mov owns the soundtrack — duck look-clip audio and wipe SFX that would ride PGM.
		muteLookClipAudioForRestOfPart(pieces)
		mutePgmWipeOverlayAudio(pieces)
	}

	// Wiped Takes: reserve full sting postroll so the next Take's keepalive can hold
	// picture through editorial cutPoint. Hard cuts keep the legacy short postroll so
	// companion bg_loop does not linger on DB↔Full switches.
	applyLookMediaPostroll(
		pieces,
		hasWipe
			? Math.max(LOOK_MEDIA_POSTROLL_MS, DEFAULT_WIPE_DURATION_MS, wipeCutPointMs, wipeDurationMs)
			: LOOK_HARD_CUT_POSTROLL_MS
	)
}

/** True when Full-look CAM on 115 would cover SYN/VT (110) or weather underlay (116). */
function shouldClearLookCamera(pieces: IBlueprintPiece[]): boolean {
	for (const piece of pieces) {
		if (piece.sourceLayerId === (SourceLayer.VO as string) || piece.sourceLayerId === (SourceLayer.VT as string)) {
			return true
		}
		for (const obj of piece.content.timelineObjects ?? []) {
			const content = obj.content as { type?: string; file?: string }
			if (
				content?.type === TSR.TimelineContentTypeCasparCg.MEDIA &&
				typeof content.file === 'string' &&
				/bg_pocasie/i.test(content.file)
			) {
				return true
			}
		}
	}
	return false
}

/** Layers whose Caspar MEDIA audio rides the PGM route and must duck under wipe SFX. */
const EDITORIAL_AUDIO_LOOK_LAYERS = new Set<string>([
	CasparCGLayers.CasparCGClipPlayer2,
	CasparCGLayers.CasparCGClipPlayer2B,
	CasparCGLayers.CasparCGPgmIluPlayer,
	CasparCGLayers.CasparCGPgmIluPlayerB,
	CasparCGLayers.CasparCGIluPlayer,
])

function setLookClipMixerVolume(obj: TimelineBlueprintExt, volume: number): void {
	const content = obj.content as TSR.TimelineContentCCGMedia
	content.mixer = { ...(content.mixer ?? {}), volume }
}

/** Hold look-clip Caspar mixer at 0 for the rest of the part (outro jingle). */
function muteLookClipAudioForRestOfPart(pieces: IBlueprintPiece[]): void {
	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			if (!EDITORIAL_AUDIO_LOOK_LAYERS.has(String(obj.layer))) continue
			const content = obj.content as TSR.TimelineContentCCGMedia | undefined
			if (!content || content.type !== TSR.TimelineContentTypeCasparCg.MEDIA) continue
			setLookClipMixerVolume(obj as TimelineBlueprintExt, 0)
		}
	}
}

/** Wipe overlay SFX must not mix under `outro.mov` (PGM 210 owns the sting). */
function mutePgmWipeOverlayAudio(pieces: IBlueprintPiece[]): void {
	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			if (!isPgmWipeEffectsLayer(String(obj.layer))) continue
			const content = obj.content as TSR.TimelineContentCCGMedia | undefined
			if (!content || content.type !== TSR.TimelineContentTypeCasparCg.MEDIA) continue
			content.mixer = { ...(content.mixer ?? {}), volume: 0 }
		}
	}
}

function muteEditorialClipAudioDuringWipe(pieces: IBlueprintPiece[], wipeDurationMs: number): void {
	for (const piece of pieces) {
		const objects = piece.content.timelineObjects ?? []
		for (const obj of objects) {
			if (!EDITORIAL_AUDIO_LOOK_LAYERS.has(String(obj.layer))) continue
			const content = obj.content as TSR.TimelineContentCCGMedia | undefined
			if (!content || content.type !== TSR.TimelineContentTypeCasparCg.MEDIA) continue

			const baseVolume =
				typeof content.mixer?.volume === 'number' && Number.isFinite(content.mixer.volume) ? content.mixer.volume : 1

			const existing = ((obj as TimelineBlueprintExt).keyframes ?? []) as NonNullable<
				TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']
			>
			;(obj as TimelineBlueprintExt).keyframes = [
				...existing,
				{
					id: '',
					enable: { start: 0, duration: wipeDurationMs },
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						mixer: { volume: 0 },
					},
				},
				{
					id: '',
					enable: { start: wipeDurationMs },
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						mixer: { volume: baseVolume },
					},
				},
			]
		}
	}
}

const L3D_TEMPLATE_LAYERS = new Set<string>([
	CasparCGLayers.CasparCGGraphicsPgmLowerThird,
	CasparCGLayers.CasparCGGraphicsPgmLowerThirdB,
])

function isCasparTemplate(content: { type?: string }): boolean {
	return content?.type === TSR.TimelineContentTypeCasparCg.TEMPLATE
}

function isCasparMedia(content: { type?: string }): boolean {
	return content?.type === TSR.TimelineContentTypeCasparCg.MEDIA
}

function shiftEnableStartIfAtTake(obj: { enable?: unknown }, delayMs: number): void {
	if (delayMs <= 0) return
	const enable = obj.enable as { start?: number | string | null } | Array<unknown> | undefined
	if (!enable || Array.isArray(enable)) return
	if (typeof enable.start === 'number' && enable.start === 0) {
		enable.start = delayMs
	}
}

/**
 * On Take: previous L3D is EMPTYed (see {@link appendL3dLayerClear}) so keepalive
 * cannot stack two templates. Incoming L3Ds ADD after a gap — never CG UPDATE.
 *
 * Wiped Takes: wipe overlay covers from 0. Look MEDIA (clips / CAM / Full ILU /
 * weather map / bg_loop) hard-cuts at the cover frame so same-channel rebuilds are not
 * visible under a still-open route. Incoming L3Ds ADD after the sting ends so the
 * in-anim is not buried under wipe SFX — except `wipe_pocasie`, where weather GFX lands
 * with `bg_pocasie` at the cover cut.
 *
 * Look compose MEDIA under wipe ({@link applyCasparHotPlayCue}):
 * - **Idle look channel** (Full↔DB / DB→Full): LOAD/PAUSE from Take, then keyframe
 *   `playing: true` at the air cut so the first frame is ready when `route://N` flips
 *   (no cold PLAY lag). Clip audio stays ducked for the sting
 *   ({@link muteEditorialClipAudioDuringWipe}).
 * - **Same look channel** (DB→DB / Full→Full): delay incoming PLAY to
 *   `wipeCutPointMs` (caller passes air cut − {@link SAME_SLOT_WIPE_AIR_CUT_LEAD_MS})
 *   only — never pause/seek from Take (that LOAD replaces the on-air outgoing clip).
 * - Outgoing MEDIA stays via `previousPartKeepaliveDuration` + look postroll
 *   (= same look-cut instant).
 * `db_loop` stays at enable 0 (same file, OutOnSegmentEnd fill — never EMPTY look A
 * on DoubleBox Takes).
 *
 * Object `enable.start` is **Take-relative** once Sofie `toPartDelay` is correct.
 * Wipe pieces use {@link IBlueprintPieceType.InTransition} so their large
 * `DEFAULT_WIPE_PREROLL_MS` does **not** inflate `toPartDelay` (live AMCP showed
 * ILU/weather LOAD ~500ms after wipe CLEAR ≈ Take+3s when wipe was Normal).
 * `piece.prerollDuration` on Normal pieces still shifts the child group to
 * `control.start − preroll` (LOADBG ahead of control) — do not bake preroll into
 * these enable delays. L3D template pieces also must not inherit look preroll
 * (see {@link applyLookPreroll}) or Sofie holds the CG late.
 *
 * Hard cuts: look MEDIA at 0; L3Ds wait a short {@link L3D_OUT_MS} after CLEAR.
 */
function applyL3dTakeOffsets(
	pieces: IBlueprintPiece[],
	wipeDurationMs: number,
	wipePocasie = false,
	wipeCutPointMs: number = DEFAULT_WIPE_AIR_CUT_MS,
	options?: { preloadIdleLookMedia?: boolean }
): void {
	const hasWipe = wipeDurationMs > 0
	const preloadIdleLookMedia = Boolean(options?.preloadIdleLookMedia)

	for (const piece of pieces) {
		const lookMediaDelay = hasWipe ? wipeCutPointMs : 0
		const pieceStartMs =
			typeof piece.enable?.start === 'number' && Number.isFinite(piece.enable.start)
				? Math.max(0, Math.floor(piece.enable.start))
				: 0

		for (const obj of piece.content.timelineObjects ?? []) {
			const layer = String(obj.layer)
			const content = obj.content as { type?: string; file?: string; seek?: number; playing?: boolean }

			if (L3D_TEMPLATE_LAYERS.has(layer) && isCasparTemplate(content)) {
				let l3dInDelay = L3D_OUT_MS
				if (hasWipe) {
					if (wipePocasie) {
						// Weather GFX with bg_pocasie at the cover cut.
						l3dInDelay = wipeCutPointMs
					} else if (pieceStartMs === 0) {
						// After the sting ends.
						l3dInDelay = wipeDurationMs
					} else if (pieceStartMs < wipeDurationMs) {
						// Editorial start falls under the sting — land at wipe end.
						l3dInDelay = wipeDurationMs - pieceStartMs
					} else {
						// Already after the sting — piece.enable.start is enough.
						l3dInDelay = 0
					}
				}
				shiftEnableStartIfAtTake(obj, l3dInDelay)
				continue
			}

			if (!isLookComposeLayer(layer) || L3D_TEMPLATE_LAYERS.has(layer)) continue
			if (!isCasparMedia(content)) continue
			// Look / L3D CLEAR EMPTYs must stay at Take (sport SYN + previous L3D),
			// except leave-weather ILU EMPTY which is scheduled at the air cut above.
			if (content.file === 'EMPTY') continue

			// Continuous db_loop OutOnSegmentEnd — keep enable 0 so the frame never
			// blinks off between DoubleBoxes in the same tema.
			if (hasWipe && layer === (LOOK_A_LAYERS.doubleBoxLoop as string)) {
				continue
			}

			if (hasWipe && preloadIdleLookMedia) {
				// Idle look channel: LOAD/PAUSE from Take; hot PLAY at the air cut.
				// route:// CAM uses noStarttime — do not force seek:0 on live routes.
				const isRoute = typeof content.file === 'string' && content.file.startsWith('route://')
				applyCasparHotPlayCue(obj as TimelineBlueprintExt, wipeCutPointMs, isRoute ? undefined : { seekMs: 0 })
				continue
			}

			// Live look channel (same-slot wipe): delayed PLAY only — do not LOAD/PAUSE
			// over the on-air outgoing clip under the sting.
			shiftEnableStartIfAtTake(obj, lookMediaDelay)
		}
	}
}

function partHasIncomingL3dTemplate(pieces: IBlueprintPiece[]): boolean {
	return pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some((obj) => {
			const layer = String(obj.layer)
			if (!L3D_TEMPLATE_LAYERS.has(layer)) return false
			return isCasparTemplate(obj.content as { type?: string })
		})
	)
}

/** Earliest piece.enable.start among pieces that carry an incoming look L3D template. */
function minIncomingL3dPieceStartMs(pieces: IBlueprintPiece[]): number {
	let minStart: number | undefined
	for (const piece of pieces) {
		const hasL3d = (piece.content.timelineObjects ?? []).some((obj) => {
			const layer = String(obj.layer)
			if (!L3D_TEMPLATE_LAYERS.has(layer)) return false
			return isCasparTemplate(obj.content as { type?: string })
		})
		if (!hasL3d) continue
		const start = piece.enable?.start
		if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) continue
		const floored = Math.floor(start)
		minStart = minStart === undefined ? floored : Math.min(minStart, floored)
	}
	return minStart ?? 0
}

/** True when this part already owns look ILU MEDIA (e.g. weather `bg_pocasie`). */
function partHasLookIluMedia(pieces: IBlueprintPiece[], lookSlot: LookSlot): boolean {
	const iluLayer = getLookLayers(lookSlot).ilu
	return pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some((obj) => {
			if (String(obj.layer) !== (iluLayer as string)) return false
			const content = obj.content as { type?: string; file?: string }
			if (!isCasparMedia(content)) return false
			return content.file !== 'EMPTY'
		})
	)
}

/**
 * True when on-air pieces include LED `gfx/ilu-zaver` MEDIA with an `iluFile`.
 * Ad-lib-only ingest (absent from `pieces`) must not count — that false positive
 * delayed unrelated LED ILU / L3D CLEAR on wiped GFX shells.
 */
function isActiveIluZaverPiece(piece: IBlueprintPiece): boolean {
	// parseGraphic names pieces `gfx/ilu-zaver | …` from raw clipName; isIluZaver trims
	// via normalizeGraphicClipName — trim here so leading/trailing whitespace still matches.
	// Headlines share CasparCGIluPlayer but use SourceLayer.IluMedia and a different name.
	if (
		!String(piece.name || '')
			.trim()
			.toLowerCase()
			.startsWith('gfx/ilu-zaver')
	)
		return false
	const fileName = (piece.content as { fileName?: string }).fileName
	if (!fileName) return false
	return (piece.content.timelineObjects ?? []).some((obj) => {
		if (String(obj.layer) !== (CasparCGLayers.CasparCGIluPlayer as string)) return false
		const content = obj.content as { type?: string; file?: string }
		return isCasparMedia(content) && content.file !== 'EMPTY'
	})
}

function partHasActiveIluZaver(pieces: IBlueprintPiece[]): boolean {
	return pieces.some(isActiveIluZaverPiece)
}

/** True when this part plays look CAM (live `route://5` / DeckLink) — do not EMPTY it. */
function partHasLookCameraMedia(pieces: IBlueprintPiece[], lookSlot: LookSlot): boolean {
	const cameraLayer = getLookLayers(lookSlot).camera
	return pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some((obj) => {
			if (String(obj.layer) !== (cameraLayer as string)) return false
			const content = obj.content as { type?: string; file?: string; inputType?: string }
			if (content?.type === TSR.TimelineContentTypeCasparCg.INPUT) return true
			if (!isCasparMedia(content) || content.file === 'EMPTY') return false
			return true
		})
	)
}

/** True when this part plays non-EMPTY Caspar MEDIA on the look clip layer (SYN/VT/ILU clips). */
function partHasLookClipMedia(pieces: IBlueprintPiece[], lookSlot: LookSlot): boolean {
	const clipLayer = getLookLayers(lookSlot).clip
	return pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some((obj) => {
			if (String(obj.layer) !== (clipLayer as string)) return false
			const content = obj.content as { type?: string; file?: string }
			if (!isCasparMedia(content) || content.file === 'EMPTY') return false
			return true
		})
	)
}

function emptyLookMediaObject(
	layer: CasparCGLayers,
	clearDurationMs?: number,
	clearStartMs: number = 0
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: {
			start: clearStartMs,
			...(clearDurationMs !== undefined ? { duration: clearDurationMs } : {}),
		},
		layer,
		priority: 2,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'EMPTY',
		},
	})
}

/**
 * EMPTY the look L3D layer at Take (or `clearStartMs`) so a keepalive'd previous
 * template cannot stack under the wipe / hard-cut gap. Duration covers until the
 * delayed CG ADD; omit duration when there is no incoming L3D (wiped Take into a
 * graphic-free part).
 */
function buildL3dLayerClearObjects(
	lookSlot: LookSlot,
	clearDurationMs?: number,
	clearStartMs: number = 0
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	return [emptyLookMediaObject(getLookLayers(lookSlot).lowerThird, clearDurationMs, clearStartMs)]
}

/**
 * Full logical CLEAR of the Full look (ch4): EMPTY leftover SYN/CAM/`db_loop` so
 * `wipe_pocasie` cannot keep the last sport VID playing under weather HTML.
 * Weather keeps ILU (`bg_pocasie`) + L3D; those layers are not EMPTYed for the part.
 * When `clipClearMs` is set, clip EMPTY is finite so {@link createFullBgLoopPiece} can
 * restore `loops/bg_loop` under the weather stack after the cover cut.
 * Skip camera EMPTY when the incoming part owns look CAM (ZAVER / cam Takes).
 * Skip clip EMPTY for story DB→Full wipes (`clearClip: false`) so idle LOADBG survives.
 */
function buildLookChannelClearObjects(
	lookSlot: LookSlot,
	clipClearMs?: number,
	options?: { clearCamera?: boolean; clearDoubleBoxLoop?: boolean; clearClip?: boolean }
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	const layers = getLookLayers(lookSlot)
	const clearCamera = options?.clearCamera !== false
	const clearDoubleBoxLoop = options?.clearDoubleBoxLoop !== false
	const clearClip = options?.clearClip !== false
	return [
		...(clearClip ? [emptyLookMediaObject(layers.clip, clipClearMs)] : []),
		...(clearCamera ? [emptyLookMediaObject(layers.camera)] : []),
		...(clearDoubleBoxLoop ? [emptyLookMediaObject(layers.doubleBoxLoop)] : []),
	]
}

/** EMPTY look ILU so previous `bg_pocasie` cannot ride keepalive/postroll into ZAVER. */
function buildLookIluClearObjects(
	lookSlot: LookSlot,
	clearDurationMs?: number,
	clearStartMs: number = 0
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	return [emptyLookMediaObject(getLookLayers(lookSlot).ilu, clearDurationMs, clearStartMs)]
}

/**
 * Single hidden piece for all look EMPTYs on this Take. Source layer has no
 * exclusiveGroup and is distinct from PgmLowerThird so SYN VO + incoming L3D survive.
 */
function appendPgmLayerClearPiece(
	pieces: IBlueprintPiece[],
	partExternalId: string,
	timelineObjects: TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[]
): void {
	const clearsL3d = timelineObjects.some((obj) => L3D_TEMPLATE_LAYERS.has(String(obj.layer)))
	pieces.push(
		literal<IBlueprintPiece>({
			enable: { start: 0 },
			externalId: `${partExternalId}_l3d_clear`,
			name: clearsL3d ? 'L3D CLEAR (auto-hide previous)' : 'Look CLEAR (ch4 layers)',
			lifespan: PieceLifespan.WithinPart,
			sourceLayerId: SourceLayer.PgmLayerClear,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.PgmLayerClear),
			content: { timelineObjects },
		})
	)
}

/**
 * Outgoing look VIDEO stays up through the wipe cover / keepalive window.
 * Sofie pieces only continue `postrollDuration` past Take into the next part's
 * `previousPartKeepaliveDuration` (editorial RE `cutPoint`). Always reserve at
 * least a full default sting ({@link LOOK_MEDIA_POSTROLL_MS}) so a later wipe's
 * cutPoint > 380 ms can actually hold picture; wiped Takes also cover this
 * part's own sting length when longer.
 *
 * After segment generation, {@link raiseLookMediaPostrollForNextKeepalive} also
 * raises each part to the *following* on-air wipe's cutPoint when that exceeds
 * the default floor (e.g. hard-cut → wipe with cutPoint 3000 ms).
 */
export function applyLookMediaPostroll(pieces: IBlueprintPiece[], postrollMs: number = LOOK_MEDIA_POSTROLL_MS): void {
	const minPostroll = Math.max(0, Math.floor(postrollMs))
	for (const piece of pieces) {
		const objects = piece.content.timelineObjects ?? []
		const keepPicture = objects.some((obj) => {
			const layer = String(obj.layer)
			const content = obj.content as { type?: string; file?: string }
			if (layer === (CasparCGLayers.CasparCGPgmRoute as string) && isCasparMedia(content)) return true
			if (!isLookComposeLayer(layer) || L3D_TEMPLATE_LAYERS.has(layer)) return false
			if (!isCasparMedia(content)) return false
			if (content.file === 'EMPTY') return false
			return true
		})
		if (!keepPicture) continue
		piece.postrollDuration = Math.max(piece.postrollDuration ?? 0, minPostroll)
	}
}

/**
 * After a segment's parts are generated, raise each part's look-MEDIA postroll to
 * cover the next on-air part's `previousPartKeepaliveDuration` (RE wipe cutPoint).
 * Needed when that cut exceeds {@link LOOK_MEDIA_POSTROLL_MS} (default sting floor) —
 * Sofie cannot hold the previous picture past piece postroll even if keepalive is longer.
 */
export function raiseLookMediaPostrollForNextKeepalive(
	parts: Array<{ part: IBlueprintPart; pieces: IBlueprintPiece[] }>
): void {
	for (let i = 0; i < parts.length; i++) {
		let nextKeepalive = 0
		for (let j = i + 1; j < parts.length; j++) {
			const next = parts[j].part
			if (next.invalid || next.floated) continue
			const keepalive = next.inTransition?.previousPartKeepaliveDuration
			if (typeof keepalive === 'number' && Number.isFinite(keepalive) && keepalive > 0) {
				nextKeepalive = Math.floor(keepalive)
			}
			break
		}
		if (nextKeepalive > 0) {
			applyLookMediaPostroll(parts[i].pieces, nextKeepalive)
		}
	}
}

/**
 * Sofie generates segments independently — {@link raiseLookMediaPostrollForNextKeepalive}
 * cannot see a wipe on the *next* segment. SPRÁVY segment boundaries almost always
 * open with a wipe; without a full-sting postroll on the last on-air part, Sofie
 * drops previous look MEDIA after {@link LOOK_HARD_CUT_POSTROLL_MS} (~400 ms) while
 * the next wipe's air cut is still ~760 ms out — black / early cut under the sting
 * (seen on SYN ADEL → ILU GUBIK and other cross-segment wipes).
 */
export function raiseLookMediaPostrollForCrossSegmentWipe(
	parts: Array<{ part: IBlueprintPart; pieces: IBlueprintPiece[] }>
): void {
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i].part
		if (part.invalid || part.floated) continue
		applyLookMediaPostroll(parts[i].pieces, LOOK_MEDIA_POSTROLL_MS)
		break
	}
}

/**
 * Delay LED `ilu-zaver` MEDIA to the wipe air cut so the LED switch lands under
 * the PGM sting with WX hide / route flip — not at Take before wipe frame 0.
 * Only shifts active závěr pieces — never other CasparCGIluPlayer MEDIA (headlines).
 */
function delayLedIluZaverToWipeCut(pieces: IBlueprintPiece[], wipeCutPointMs: number): void {
	if (wipeCutPointMs <= 0) return
	for (const piece of pieces) {
		if (!isActiveIluZaverPiece(piece)) continue
		for (const obj of piece.content.timelineObjects ?? []) {
			if (String(obj.layer) !== (CasparCGLayers.CasparCGIluPlayer as string)) continue
			const content = obj.content as { type?: string; file?: string }
			if (!isCasparMedia(content) || content.file === 'EMPTY') continue
			shiftEnableStartIfAtTake(obj, wipeCutPointMs)
		}
	}
}
