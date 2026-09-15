import {
	IBlueprintPart,
	IBlueprintPiece,
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
	DEFAULT_WIPE_PREROLL_MS,
	WIPE_CUT_POINT_MS,
	getVideoPlayLayer,
	normalizeLayeredVideoFileName,
	resolveWipeDurationMs,
	isWipePocasieFile,
	partHasOutroOverlay,
} from './clips.js'
import { getAudioObjectOnLayer } from './audio.js'
import { getWipeForceMuteChannels } from './backgroundMusic.js'
import { DEFAULT_WIPE_FILE } from '../../../common/definitions/rundownEditorTypes.js'
import { createLookCameraClearTimelineObject } from './pgmCamera.js'

export type LookSlot = 'A' | 'B'

/**
 * Caspar channel format used when converting wipe cut-point ms → STING frames.
 * Note: casparcg-state `Transition.delay` expects **milliseconds** and calls
 * `time2Frames` itself — do not pre-convert when setting `inTransition.delay`.
 */
export const WIPE_STING_FRAME_RATE = 50

/** Default wait so CEF + clips can cue on the idle BG channel before a wiped Take. */
export const DEFAULT_LOOK_PREROLL_MS = 1500

/**
 * Time for the outgoing L3D `CG STOP` out-animation to play on the current look
 * before the picture cuts or the wipe overlay starts. Incoming L3Ds ADD only after
 * the cut/wipe so the in-animation is not covered.
 */
export const L3D_OUT_MS = 500

/** Keep outgoing look MEDIA on the timeline through L3D out + wipe cover-frame. */
export const LOOK_MEDIA_POSTROLL_MS = L3D_OUT_MS + WIPE_CUT_POINT_MS

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
	return objects.some(
		(obj) =>
			obj.objectType === ObjectType.Graphic &&
			String((obj as GraphicObject).clipName || '').toLowerCase() === 'gfx/doublebox-ilu'
	)
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
		const usesLook = (piece.content.timelineObjects ?? []).some((obj) => isLookComposeLayer(String(obj.layer)))
		if (!usesLook) continue
		// Native DeckLink/dshow must not LOADBG on look layers (ingest helper owns the device).
		// Look CAM is normally MEDIA route://5 — safe to preroll; skip only if a piece still has INPUT.
		if (pieceUsesLiveCameraProducer(piece)) continue
		piece.prerollDuration = Math.max(piece.prerollDuration ?? 0, prerollMs)
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
export function createFullChannelRouteContent(channel: number, stingFile?: string): TSR.TimelineContentCCGMedia {
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
							delay: WIPE_CUT_POINT_MS,
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
	options?: { sting?: boolean; routeStartMs?: number }
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	const channel = getLookCasparChannel(config, slot)
	const useSting = Boolean(wipeFile) && options?.sting !== false
	const stingFile = useSting && wipeFile ? toCasparPlayPath(wipeFile) : undefined
	const routeStartMs = options?.routeStartMs ?? 0

	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { start: routeStartMs },
		layer: CasparCGLayers.CasparCGPgmRoute,
		priority: 1,
		content: createFullChannelRouteContent(channel, stingFile),
	})
}

function createPgmWipeOverlayTimelineObject(
	wipeFile: string,
	wipeDurationMs: number,
	startMs: number = 0
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { start: startMs, duration: wipeDurationMs },
		layer: CasparCGLayers.CasparCGPgmEffectsPlayer,
		priority: 1,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: toCasparPlayPath(wipeFile),
			// Alpha-only composite: never KEYER/CHROMA (those luma-key RGB). Play on a
			// fresh PGM layer (205) so leftover MIXER KEYER on old 200 cannot stick.
			// Explicit FILL+opacity forces a MIXER write even when keyer:false is default.
			mixer: {
				keyer: false,
				blend: TSR.BlendMode.NORMAL,
				chroma: {
					keyer: TSR.Chroma.NONE,
					threshold: 0,
					softness: 0,
					spill: 0,
				},
				opacity: 1,
				fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
				volume: 1,
			},
		},
	})
}

/**
 * All hypercomposed story-block wipes PLAY on PGM EffectsPlayer (layer 205) and
 * hard-cut MEDIA `route://N` at {@link WIPE_CUT_POINT_MS} under the cover.
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
	wipeFile: string | undefined
): IBlueprintPiece {
	const hasWipe = Boolean(wipe && wipeFile)
	const overlayWipe = hasWipe && wipeUsesPgmOverlay(slot)
	const wipeDurationMs = resolveWipeDurationMs(wipe?.duration)
	const overlayStartMs = L3D_OUT_MS
	const transitionLabel =
		typeof wipe?.attributes?.transition === 'string' && wipe.attributes.transition.trim()
			? wipe.attributes.transition.trim()
			: undefined

	const timelineObjects: TimelineBlueprintExt[] = []
	if (overlayWipe && wipeFile) {
		timelineObjects.push(createPgmWipeOverlayTimelineObject(wipeFile, wipeDurationMs, overlayStartMs))
		timelineObjects.push(
			createPgmRouteTimelineObject(config, slot, wipeFile, {
				sting: false,
				routeStartMs: overlayStartMs + WIPE_CUT_POINT_MS,
			})
		)
	} else {
		timelineObjects.push(
			createPgmRouteTimelineObject(config, slot, wipeFile, {
				sting: hasWipe,
				routeStartMs: overlayStartMs,
			})
		)
	}

	if (hasWipe) {
		const wipeMutes = getWipeForceMuteChannels(config)
		if (wipeMutes.length > 0) {
			timelineObjects.push({
				...getAudioObjectOnLayer(config, SisyfosLayers.ForceMute, wipeMutes),
				enable: {
					start: overlayStartMs,
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
							? [CasparCGLayers.CasparCGPgmEffectsPlayer, CasparCGLayers.CasparCGPgmRoute]
							: [CasparCGLayers.CasparCGPgmRoute],
						{
							includeSideEffects: true,
						}
					),
				]
			: undefined,
		// Wipe overlay needs a long LOADBG window. Hard-cut route pieces must use only
		// casparcgLatency — lookPrerollMs / wipe preroll on every route delayed every Take
		// by ~1.5–3s (UI advanced, AMCP held). BG cueing for hard cuts is lookahead's job.
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
	wipeDurationMs: number
): void {
	const mutes = (wipePiece.content.timelineObjects ?? []).filter(
		(obj) => String(obj.layer) === (SisyfosLayers.ForceMute as string)
	)
	// Keep ForceMute aligned with the wipe SFX / overlay window (not an open-ended mute).
	for (const mute of mutes) {
		mute.enable = { start: L3D_OUT_MS, duration: wipeDurationMs }
	}
	const overlayWipe = wipeUsesPgmOverlay(slot)
	const overlayStartMs = L3D_OUT_MS
	wipePiece.content.timelineObjects = overlayWipe
		? [
				createPgmWipeOverlayTimelineObject(wipeFile, wipeDurationMs, overlayStartMs),
				createPgmRouteTimelineObject(config, slot, wipeFile, {
					sting: false,
					routeStartMs: overlayStartMs + WIPE_CUT_POINT_MS,
				}),
				...mutes,
			]
		: [createPgmRouteTimelineObject(config, slot, wipeFile, { sting: true, routeStartMs: overlayStartMs }), ...mutes]
	wipePiece.enable = { start: 0 }
	wipePiece.prerollDuration = Math.max(config.casparcgLatency, getLookPrerollMs(config), DEFAULT_WIPE_PREROLL_MS)
	wipePiece.content.ignoreAudioFormat = true
	wipePiece.content.ignoreMediaObjectStatus = true
	wipePiece.expectedPackages = [
		createMediaFileExpectedPackage(
			context,
			wipeFile,
			overlayWipe
				? [CasparCGLayers.CasparCGPgmEffectsPlayer, CasparCGLayers.CasparCGPgmRoute]
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
	lookSlot: LookSlot = 'A'
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
	const wipeDurationMs = resolveWipeDurationMs(wipe?.duration)
	const wipeFile = wipe
		? normalizeLayeredVideoFileName(
				'wipe',
				(typeof wipe.attributes?.fileName === 'string' && wipe.attributes.fileName.trim()) ||
					wipe.clipName ||
					DEFAULT_WIPE_FILE
			)
		: undefined
	const hasWipe = Boolean(wipe && wipeFile)
	const takeHoldMs = L3D_OUT_MS + (hasWipe ? wipeDurationMs : 0)

	if (hasWipe) {
		applyLookPreroll(pieces, getLookPrerollMs(config))
		part.inTransition = {
			blockTakeDuration: takeHoldMs,
			previousPartKeepaliveDuration: 0,
			partContentDelayDuration: 0,
		}
		muteEditorialClipAudioDuringWipe(pieces, wipeDurationMs)
	} else {
		part.inTransition = {
			blockTakeDuration: L3D_OUT_MS,
			previousPartKeepaliveDuration: 0,
			partContentDelayDuration: 0,
		}
	}

	applyL3dTakeOffsets(pieces, hasWipe ? wipeDurationMs : 0)

	if (wipeFile && isWipePocasieFile(wipeFile)) {
		appendLookChannelClear(pieces, partExternalId, lookSlot, L3D_OUT_MS)
	}

	const alreadyRouted = pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some(
			(obj) => String(obj.layer) === (CasparCGLayers.CasparCGPgmRoute as string)
		)
	)
	if (!alreadyRouted) {
		const wipePiece = pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))
		if (wipePiece && wipeFile) {
			attachRouteToWipePiece(context, config, wipePiece, lookSlot, wipeFile, wipeDurationMs)
		} else {
			pieces.push(createPgmRoutePiece(context, config, partExternalId, lookSlot, wipe, wipe ? wipeFile : undefined))
		}
	}

	if (partHasOutroOverlay(objects)) {
		// Outro.mov owns the soundtrack — duck look-clip audio and wipe SFX that would ride PGM.
		muteLookClipAudioForRestOfPart(pieces)
		mutePgmWipeOverlayAudio(pieces)
	}

	applyLookMediaPostroll(pieces)
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
			if (String(obj.layer) !== (CasparCGLayers.CasparCGPgmEffectsPlayer as string)) continue
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
 * On Take: outgoing L3Ds STOP immediately (no keepalive / no postroll on templates).
 * Incoming look MEDIA waits {@link L3D_OUT_MS} so the out-animation is visible,
 * then the cut/wipe happens. Incoming L3Ds wait until after the cut/wipe so the
 * in-animation is not covered.
 */
function applyL3dTakeOffsets(pieces: IBlueprintPiece[], wipeDurationMs: number): void {
	const lookMediaDelay = L3D_OUT_MS
	const l3dInDelay = L3D_OUT_MS + Math.max(0, wipeDurationMs)

	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			const layer = String(obj.layer)
			const content = obj.content as { type?: string }

			if (L3D_TEMPLATE_LAYERS.has(layer) && isCasparTemplate(content)) {
				shiftEnableStartIfAtTake(obj, l3dInDelay)
				continue
			}

			if (!isLookComposeLayer(layer) || L3D_TEMPLATE_LAYERS.has(layer)) continue
			if (!isCasparMedia(content)) continue
			shiftEnableStartIfAtTake(obj, lookMediaDelay)
		}
	}
}

/** Outgoing look VIDEO stays up through L3D out + wipe cover; L3D templates must not. */
function applyLookMediaPostroll(pieces: IBlueprintPiece[]): void {
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
		piece.postrollDuration = Math.max(piece.postrollDuration ?? 0, LOOK_MEDIA_POSTROLL_MS)
	}
}

/**
 * Full logical CLEAR of the Full look (ch4): EMPTY leftover SYN/CAM/`db_loop` so
 * `wipe_pocasie` cannot keep the last sport VID playing under weather HTML.
 * Weather keeps ILU (`bg_pocasie`) + L3D; those layers are not EMPTYed for the part.
 */
function appendLookChannelClear(
	pieces: IBlueprintPiece[],
	partExternalId: string,
	lookSlot: LookSlot,
	startMs: number
): void {
	const layers = getLookLayers(lookSlot)
	const clearLayers = [layers.clip, layers.camera, layers.doubleBoxLoop]
	const timelineObjects = clearLayers.map((layer) =>
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
			id: '',
			enable: { start: startMs },
			layer,
			priority: 2,
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				file: 'EMPTY',
			},
		})
	)

	pieces.push(
		literal<IBlueprintPiece>({
			enable: { start: startMs },
			externalId: `${partExternalId}_look_channel_clear`,
			name: 'Look CLEAR (ch4 SYN/CAM/db_loop)',
			lifespan: PieceLifespan.WithinPart,
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			content: { timelineObjects },
		})
	)
}
