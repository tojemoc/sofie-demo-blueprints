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
	resolveWipeCutPointMs,
	resolveWipeDurationMs,
	isWipePocasieFile,
	partHasOutroOverlay,
} from './clips.js'
import { getAudioObjectOnLayer } from './audio.js'
import { createWipeBackgroundMusicMutePiece, getWipeForceMuteChannels } from './backgroundMusic.js'
import { DEFAULT_WIPE_FILE } from '../../../common/definitions/rundownEditorTypes.js'
import { createLookCameraClearTimelineObject } from './pgmCamera.js'
import { createFullBgLoopPiece } from './fullBgLoop.js'

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
 * Hard-cut only: brief beat after outgoing `CG STOP` before the next L3D ADDs.
 * Wiped Takes must not use this — the wipe covers from frame 0; delaying the
 * overlay/route made Take look like a hard cut (tear/glitch) then a late sting.
 */
export const L3D_OUT_MS = 200

/**
 * Keep outgoing look MEDIA on the timeline through the wipe cover-frame.
 * 760 is {@link WIPE_CUT_POINT_MS}; inlined so this const does not read clips.ts
 * during module init (webpack CJS: clips → baseline → pgmLook cycle).
 */
export const LOOK_MEDIA_POSTROLL_MS = 760

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
		const objs = piece.content.timelineObjects ?? []
		const usesLook = objs.some((obj) => isLookComposeLayer(String(obj.layer)))
		if (!usesLook) continue
		// L3D HTML templates: ADD timing is Take-relative via applyL3dTakeOffsets.
		// Inflating prerollDuration on those pieces made Softie hold the CG until
		// Take+preroll+enable (~4s after wipe CLEAR). Media LOADBG preroll stays.
		const hasL3dTemplate = objs.some((obj) => {
			const layer = String(obj.layer)
			if (!L3D_TEMPLATE_LAYERS.has(layer)) return false
			return isCasparTemplate(obj.content as { type?: string })
		})
		if (hasL3dTemplate) continue
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
export function createFullChannelRouteContent(
	channel: number,
	stingFile?: string,
	cutPointMs: number = WIPE_CUT_POINT_MS
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
	const cutPointMs = options?.cutPointMs ?? WIPE_CUT_POINT_MS

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
			videoFilter: PGM_WIPE_STRAIGHT_TO_PREMUL_FILTER,
			mixer: { ...PGM_WIPE_OVERLAY_MIXER },
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
	const wipeCutPointMs = resolveWipeCutPointMs(wipe?.attributes, wipeDurationMs)
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
	wipeDurationMs: number,
	wipeCutPointMs: number = WIPE_CUT_POINT_MS
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
	const wipeCutPointMs = resolveWipeCutPointMs(wipe?.attributes, wipeDurationMs)
	const wipeFile = wipe
		? normalizeLayeredVideoFileName(
				'wipe',
				(typeof wipe.attributes?.fileName === 'string' && wipe.attributes.fileName.trim()) ||
					wipe.clipName ||
					DEFAULT_WIPE_FILE
			)
		: undefined
	const hasWipe = Boolean(wipe && wipeFile)
	const wipePocasie = Boolean(wipeFile && isWipePocasieFile(wipeFile))

	if (hasWipe) {
		applyLookPreroll(pieces, getLookPrerollMs(config))
		// Keep previous look VIDEO only until the cover cut — not the full sting.
		// Full-sting keepalive left DB→DB / Full→Full switches until wipe CLEAR
		// (new look could not win while the previous part still occupied the channel).
		// L3D templates are CLEARed separately at Take — keepalive must not stack them.
		part.inTransition = {
			blockTakeDuration: wipeDurationMs,
			previousPartKeepaliveDuration: wipeCutPointMs,
			partContentDelayDuration: 0,
		}
		muteEditorialClipAudioDuringWipe(pieces, wipeDurationMs)
		// Kolíska beds ride Caspar audio layers — Sisyfos ForceMute does not duck them.
		pieces.push(createWipeBackgroundMusicMutePiece(config, partExternalId, wipeDurationMs))
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

	// Kill any keepalive'd / leftover L3D before the delayed ADD. Same-template Takes
	// (SJV→SJV, ŠPORT→ŠPORT) otherwise become CG UPDATE (text swap, no IN anim).
	// All Caspar EMPTYs share {@link SourceLayer.PgmLayerClear} (not GFX) so SYN VO is
	// not pruned by exclusiveGroup `pgm`.
	const clearObjects: TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] = []
	if (hasIncomingL3d || hasWipe) {
		// Duration only until the delayed CG ADD. Wiped Takes with no incoming L3D must
		// hold EMPTY for the whole part — otherwise previous L3D returns after
		// the clear window while the sting/keepalive still covers.
		clearObjects.push(...buildL3dLayerClearObjects(lookSlot, l3dClearDurationMs))
	}
	if (wipePocasie) {
		// EMPTY leftover sport SYN under wipe_pocasie until the cover cut, then
		// restore loops/bg_loop on the clip layer (weather stack: bg_loop + bg_pocasie + GFX).
		clearObjects.push(...buildLookChannelClearObjects(lookSlot, wipeCutPointMs))
	}
	// Leaving Počasie: clear bg_pocasie at the wipe cutpoint (while covered), not from
	// Take. Duration must be finite — an open-ended EMPTY rides keepalive into the
	// *next* Take and (priority 2) suppresses incoming weather `bg_pocasie`.
	if (!partHasLookIluMedia(pieces, lookSlot)) {
		if (hasWipe) {
			clearObjects.push(
				...buildLookIluClearObjects(lookSlot, Math.max(0, wipeDurationMs - wipeCutPointMs), wipeCutPointMs)
			)
		} else {
			clearObjects.push(...buildLookIluClearObjects(lookSlot, LOOK_MEDIA_POSTROLL_MS))
		}
	}
	if (clearObjects.length > 0) {
		appendPgmLayerClearPiece(pieces, partExternalId, clearObjects)
	}

	if (wipePocasie) {
		// Priority 1 WithinPart bg_loop under weather map — baseline prio-0 alone loses to
		// open-ended CLEAR; finite clip EMPTY above lets this take the clip layer at cut.
		// Push after remapLookLayers, so remap this piece onto Full (B) explicitly.
		const bgLoop = createFullBgLoopPiece(context, config, partExternalId)
		remapLookLayers([bgLoop], lookSlot)
		pieces.push(bgLoop)
	}

	applyL3dTakeOffsets(pieces, hasWipe ? wipeDurationMs : 0, wipePocasie, wipeCutPointMs)

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
 * On Take: previous L3D is EMPTYed (see {@link appendL3dLayerClear}) so keepalive
 * cannot stack two templates. Incoming L3Ds ADD after a gap — never CG UPDATE.
 *
 * Wiped Takes: wipe overlay covers from 0. Look MEDIA (clips / CAM / ILU / db_loop /
 * weather map / bg_loop) hard-cuts at the cover frame so same-channel rebuilds are not
 * visible under a still-open route. Incoming L3Ds ADD after the sting ends so the
 * in-anim is not buried under wipe SFX — except `wipe_pocasie`, where weather GFX lands
 * with `bg_pocasie` at the cover cut.
 *
 * Object `enable.start` is **Take-relative** (same as the wipe route cut).
 * `piece.prerollDuration` only cues media lookahead — it does **not** shift the
 * piece’s timeline origin. Adding preroll into these delays made look MEDIA / L3D
 * land ~preroll after wipe CLEAR (blank after `wipe_sjv`, leftover SYN after
 * `wipe_sport` / `wipe_pocasie`). Live AMCP 2026-09-16: route cut at Take+760,
 * SYN PLAY at Take+~3760 with the old formula. L3D template pieces also must not
 * inherit look preroll (see {@link applyLookPreroll}) or Softie holds the CG late.
 *
 * Hard cuts: look MEDIA at 0; L3Ds wait a short {@link L3D_OUT_MS} after CLEAR.
 */
function applyL3dTakeOffsets(
	pieces: IBlueprintPiece[],
	wipeDurationMs: number,
	wipePocasie = false,
	wipeCutPointMs: number = WIPE_CUT_POINT_MS
): void {
	const hasWipe = wipeDurationMs > 0

	for (const piece of pieces) {
		const lookMediaDelay = hasWipe ? wipeCutPointMs : 0
		const pieceStartMs =
			typeof piece.enable?.start === 'number' && Number.isFinite(piece.enable.start)
				? Math.max(0, Math.floor(piece.enable.start))
				: 0

		for (const obj of piece.content.timelineObjects ?? []) {
			const layer = String(obj.layer)
			const content = obj.content as { type?: string }

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
			// except leave-weather ILU EMPTY which is scheduled at the cutpoint below.
			if ((content as { file?: string }).file === 'EMPTY') continue
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
 * EMPTY the look L3D layer at Take so a keepalive'd previous template cannot stack
 * under the wipe / hard-cut gap. Duration covers until the delayed CG ADD; omit
 * duration when there is no incoming L3D (wiped Take into a graphic-free part).
 */
function buildL3dLayerClearObjects(
	lookSlot: LookSlot,
	clearDurationMs?: number
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	return [emptyLookMediaObject(getLookLayers(lookSlot).lowerThird, clearDurationMs)]
}

/**
 * Full logical CLEAR of the Full look (ch4): EMPTY leftover SYN/CAM/`db_loop` so
 * `wipe_pocasie` cannot keep the last sport VID playing under weather HTML.
 * Weather keeps ILU (`bg_pocasie`) + L3D; those layers are not EMPTYed for the part.
 * When `clipClearMs` is set, clip EMPTY is finite so {@link createFullBgLoopPiece} can
 * restore `loops/bg_loop` under the weather stack after the cover cut.
 */
function buildLookChannelClearObjects(
	lookSlot: LookSlot,
	clipClearMs?: number
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	const layers = getLookLayers(lookSlot)
	return [
		emptyLookMediaObject(layers.clip, clipClearMs),
		emptyLookMediaObject(layers.camera),
		emptyLookMediaObject(layers.doubleBoxLoop),
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
