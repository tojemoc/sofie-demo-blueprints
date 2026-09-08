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
	DEFAULT_WIPE_DURATION_MS,
	WIPE_CUT_POINT_MS,
	getVideoPlayLayer,
	normalizeLayeredVideoFileName,
} from './clips.js'
import { getAudioObjectOnLayer } from './audio.js'
import { getPlaybackForceMuteChannels } from './backgroundMusic.js'
import { DEFAULT_WIPE_FILE } from '../../../common/definitions/rundownEditorTypes.js'

export type LookSlot = 'A' | 'B'

/** Caspar channel format for STING delay (720p50 / 1080p50). */
export const WIPE_STING_FRAME_RATE = 50

/** Default wait so CEF + clips can cue on the idle BG channel before a wiped Take. */
export const DEFAULT_LOOK_PREROLL_MS = 1500

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

/** Live dshow/v4l2 producers — must not LOADBG on the idle BG channel during preroll. */
function isLiveCameraProducerFile(file: unknown): boolean {
	if (typeof file !== 'string') return false
	const lower = file.toLowerCase()
	return lower.startsWith('dshow://') || lower.startsWith('v4l2://') || lower.startsWith('decklink://')
}

function pieceUsesLiveCameraProducer(piece: IBlueprintPiece): boolean {
	return (piece.content.timelineObjects ?? []).some((obj) => {
		const content = obj.content as { type?: string; file?: unknown }
		return content?.type === TSR.TimelineContentTypeCasparCg.MEDIA && isLiveCameraProducerFile(content.file)
	})
}

function applyLookPreroll(pieces: IBlueprintPiece[], prerollMs: number): void {
	if (prerollMs <= 0) return

	for (const piece of pieces) {
		const usesLook = (piece.content.timelineObjects ?? []).some((obj) => isLookComposeLayer(String(obj.layer)))
		if (!usesLook) continue
		// DoubleBox CAM1 is baseline-warmed on ch3. Still skip live-cam preroll on Full (ch4)
		// pieces so we do not open a second OBS Virtual Camera capture early during lookahead.
		if (pieceUsesLiveCameraProducer(piece)) continue
		piece.prerollDuration = Math.max(piece.prerollDuration ?? 0, prerollMs)
	}
}

/**
 * Full-channel underlay as MEDIA `route://N` (not TSR ROUTE).
 * casparcg-state `setDefaultValue` coerces ROUTE `layer` null/undefined → 0, so AMCP
 * becomes `route://N-0` (empty layer → black PGM) instead of the full mix `route://N`.
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
							delay: wipeStingDelayFrames(),
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

function createPgmWipeOverlayTimelineObject(wipeFile: string): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { start: 0, duration: DEFAULT_WIPE_DURATION_MS },
		layer: CasparCGLayers.CasparCGPgmEffectsPlayer,
		priority: 1,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: toCasparPlayPath(wipeFile),
			mixer: { volume: 1 },
		},
	})
}

/**
 * DoubleBox wipes: Caspar STING on the route (pre-built idle look).
 * Full-section wipes (SJV / ŠPORT / Počasie / tip): wipe PLAY on PGM EffectsPlayer;
 * route hard-cuts at {@link WIPE_CUT_POINT_MS} under the cover.
 */
export function wipeUsesPgmOverlay(slot: LookSlot): boolean {
	return slot === 'B'
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
	const transitionLabel =
		typeof wipe?.attributes?.transition === 'string' && wipe.attributes.transition.trim()
			? wipe.attributes.transition.trim()
			: undefined

	const timelineObjects: TimelineBlueprintExt[] = []
	if (overlayWipe && wipeFile) {
		timelineObjects.push(createPgmWipeOverlayTimelineObject(wipeFile))
		timelineObjects.push(
			createPgmRouteTimelineObject(config, slot, wipeFile, {
				sting: false,
				routeStartMs: WIPE_CUT_POINT_MS,
			})
		)
	} else {
		timelineObjects.push(
			createPgmRouteTimelineObject(config, slot, wipeFile, {
				sting: hasWipe,
			})
		)
	}

	if (hasWipe) {
		const playbackMutes = getPlaybackForceMuteChannels(config)
		if (playbackMutes.length > 0) {
			timelineObjects.push({
				...getAudioObjectOnLayer(config, SisyfosLayers.ForceMute, playbackMutes),
				enable: {
					start: 0,
					duration: DEFAULT_WIPE_DURATION_MS,
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
		prerollDuration: config.casparcgLatency,
	})
}

function attachRouteToWipePiece(
	context: ICommonContext,
	config: StudioConfig,
	wipePiece: IBlueprintPiece,
	slot: LookSlot,
	wipeFile: string
): void {
	const mutes = (wipePiece.content.timelineObjects ?? []).filter(
		(obj) => String(obj.layer) === (SisyfosLayers.ForceMute as string)
	)
	const overlayWipe = wipeUsesPgmOverlay(slot)
	wipePiece.content.timelineObjects = overlayWipe
		? [
				createPgmWipeOverlayTimelineObject(wipeFile),
				createPgmRouteTimelineObject(config, slot, wipeFile, {
					sting: false,
					routeStartMs: WIPE_CUT_POINT_MS,
				}),
				...mutes,
			]
		: [createPgmRouteTimelineObject(config, slot, wipeFile, { sting: true }), ...mutes]
	wipePiece.enable = { start: 0 }
	wipePiece.prerollDuration = config.casparcgLatency
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
 * DoubleBox wiped Takes STING onto ch3; Full-section wiped Takes PLAY wipe on PGM and
 * hard-cut `route://4` at the wipe cut point. Hard cuts re-assert `route://N` with no
 * transition. Logo / intro stay on PGM above the route.
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

	if (wipe) {
		applyLookPreroll(pieces, getLookPrerollMs(config))
		part.inTransition = {
			blockTakeDuration: DEFAULT_WIPE_DURATION_MS,
			previousPartKeepaliveDuration: DEFAULT_WIPE_DURATION_MS,
			partContentDelayDuration: 0,
		}
	}

	const alreadyRouted = pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some(
			(obj) => String(obj.layer) === (CasparCGLayers.CasparCGPgmRoute as string)
		)
	)
	if (alreadyRouted) return

	const wipePiece = pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))
	if (wipePiece && wipeFile) {
		attachRouteToWipePiece(context, config, wipePiece, lookSlot, wipeFile)
		return
	}

	pieces.push(createPgmRoutePiece(context, config, partExternalId, lookSlot, wipe, wipe ? wipeFile : undefined))
}
