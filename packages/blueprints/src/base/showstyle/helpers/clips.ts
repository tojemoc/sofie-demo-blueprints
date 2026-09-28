import {
	IBlueprintAdLibPiece,
	IBlueprintPiece,
	IBlueprintPieceType,
	ICommonContext,
	PieceLifespan,
	TSR,
} from '@sofie-automation/blueprints-integration'
import { ObjectType, SomeObject, VideoObject, VideoPlayLayer } from '../../../common/definitions/objects.js'
import { DEFAULT_WIPE_FILE } from '../../../common/definitions/rundownEditorTypes.js'
import { assertUnreachable, literal } from '../../../common/util.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../../studio/helpers/config.js'
import { CasparCGLayers, SisyfosLayers } from '../../studio/layers.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createVisionMixerObjects } from './visionMixer.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { InputConfig, VmixInputConfig } from '../../..//$schemas/generated/main-studio-config.js'
import { createMediaFileExpectedPackage, isDemoMediaPath, toCasparPlayPath } from './mediaPackages.js'
import { getAudioObjectOnLayer } from './audio.js'
import { getWipeForceMuteChannels } from './backgroundMusic.js'

export interface ClipProps {
	fileName: string
	duration?: number
	sourceDuration?: number
	/** Milliseconds to SEEK into the file. */
	trimInMs?: number
	/** Milliseconds to drop from the tail. */
	trimOutMs?: number
	/** Caspar mixer volume 0–1. */
	volume?: number
}

/** Same path as baseline `LED_BACKGROUND_LOOP_FILE`. Do not import baseline here (webpack CJS cycle). */
export const DEFAULT_BG_LOOP_FILE = 'loops/bg_loop'

/** Fallback wipe length when RE leaves duration empty/0 (full stinger overlay). */
export const DEFAULT_WIPE_DURATION_MS = 2500

/**
 * Editorial cover frame within the wipe file — ms from the start of `wipes/wipe*.mov`
 * (Resolve frame-by-frame). Frame 19 @ 50fps = 380 ms. Override per wipe via RE
 * `attributes.cutPoint` (**milliseconds into the file**, not seconds like piece.duration).
 *
 * Softie schedules the route / look hard-cut at {@link resolveWipeAirCutMs} (= this
 * value + optional cover-centre bias + {@link WIPE_PLAYOUT_LATENCY_MS}), because Caspar
 * still lags PLAY→first-frame after PRELOAD LOADBG. Without that offset, Resolve’s
 * 380 ms lands ~400 ms too early on air.
 *
 * Softie/TSR cannot ACK “frame N is on PGM” from Caspar — timing is open-loop. Classical
 * `wipes/wipe` therefore lands the air cut in the **middle of a 2-frame cover window**
 * ({@link WIPE_COVER_CENTER_OFFSET_MS}) and snaps to the 50fps grid so ±½-frame jitter
 * still falls on one of those two cover frames.
 */
export const WIPE_CUT_POINT_MS = 380

/** Studio / wipe editorial frame rate (Caspar 1080p5000). */
export const WIPE_FRAME_RATE = 50

/** One frame at {@link WIPE_FRAME_RATE} (20 ms). */
export const WIPE_FRAME_MS = 1000 / WIPE_FRAME_RATE

/**
 * Classical `wipes/wipe` keeps two fully covering frames at the Resolve cut
 * (frame 19 + 20). Air cut targets the centre so ±½ frame still hits cover.
 */
export const WIPE_COVER_FRAMES = 2

/** Half-frame bias into the 2-frame cover (= 10 ms @ 50fps). */
export const WIPE_COVER_CENTER_OFFSET_MS = WIPE_FRAME_MS / 2

/**
 * Caspar decode / compositor lag from Take (PLAY after PRELOAD LOADBG) until wipe
 * frame 0 is actually on PGM. `route://` and look MEDIA switch instantly at their
 * enable times, so the air cut must be editorial file-ms + this latency.
 *
 * Tuned for PRELOAD’d `wipes/wipe` (~19f). Cold PLAY without LOADBG is 40–60f and
 * cannot be absorbed by the 2-frame cover — EffectsPlayer PRELOAD + wipe preroll
 * must stay reliable. Adjust here if PRELOAD/ffmpeg latency changes — not by
 * padding RE cutPoint.
 */
export const WIPE_PLAYOUT_LATENCY_MS = 380

/**
 * Sofie preroll so Caspar can LOADBG the alpha wipe before Take.
 * Wipe pieces must be {@link IBlueprintPieceType.InTransition} so this value is
 * **excluded** from Softie `calculatePartPreroll` / `toPartDelay` — otherwise every
 * normal look piece (ILU, SYN, bed C) lands ~3s late (after wipe CLEAR). The wipe
 * child-group still starts at `control.start − preroll` for LOADBG ahead of Take.
 */
export const DEFAULT_WIPE_PREROLL_MS = 3000

/**
 * Animation length of themed story wipes (ms @ 50fps), shorter than the generic
 * 2500 ms RE default. Softie overlay duration longer than the mov freezes the last
 * frame on PGM (operators reported SJV +7f / ŠPORT +8f / Počasie +8f of hold).
 * Keys are Caspar PLAY paths (no extension), matching {@link toCasparPlayPath}.
 */
export const THEMED_WIPE_ANIMATION_MS: Readonly<Record<string, number>> = {
	'wipes/wipe_sjv': 2500 - 7 * 20, // 2360 — 7 frames of freeze on last frame
	'wipes/wipe_sport': 2500 - 8 * 20, // 2340
	'wipes/wipe_pocasie': 2500 - 8 * 20, // 2340
}

function normalizeWipePlayPath(fileName: string | undefined): string | undefined {
	if (!fileName) return undefined
	const trimmed = fileName.trim().replace(/\\/g, '/')
	if (!trimmed) return undefined
	return trimmed.replace(/\.(mov|mp4|mxf|mkv|webm)$/i, '')
}

/** True for the classical story wipe (`wipes/wipe`), not themed SJV/ŠPORT/Počasie. */
export function isClassicalWipeFile(fileName?: string): boolean {
	const playPath = normalizeWipePlayPath(fileName)
	if (!playPath) return true
	if (playPath === DEFAULT_WIPE_FILE || playPath === 'wipe') return true
	// Reject themed keys explicitly; any other `wipe_*` is not classical.
	if (playPath in THEMED_WIPE_ANIMATION_MS) return false
	return /(?:^|\/)wipe$/i.test(playPath)
}

/** Snap Softie enable times onto the 50fps grid (nearest frame). */
export function snapMsToFrame(ms: number, frameMs: number = WIPE_FRAME_MS): number {
	if (!Number.isFinite(ms) || ms <= 0) return 0
	return Math.round(ms / frameMs) * frameMs
}

/**
 * How long Host/Playback ForceMute + editorial Caspar duck last.
 * Must end with the wipe SFX — not an oversized tail after the stinger.
 * Defaults to the visual wipe length; override via RE wipe piece duration when set.
 * Themed `wipe_sjv` / `_sport` / `_pocasie` are capped to their animation length so
 * Caspar does not freeze the last frame past the sting.
 */
export function resolveWipeDurationMs(wipeDurationFromIngest?: number, wipeFile?: string): number {
	let duration = DEFAULT_WIPE_DURATION_MS
	if (
		typeof wipeDurationFromIngest === 'number' &&
		Number.isFinite(wipeDurationFromIngest) &&
		wipeDurationFromIngest > 0
	) {
		duration = Math.floor(wipeDurationFromIngest)
	}
	const playPath = normalizeWipePlayPath(wipeFile)
	if (playPath) {
		const themed = THEMED_WIPE_ANIMATION_MS[playPath]
		if (typeof themed === 'number' && themed > 0) {
			duration = Math.min(duration, themed)
		}
	}
	return duration
}

/**
 * Editorial wipe cut point — **ms into the wipe file** (Resolve), from RE `cutPoint`,
 * else {@link WIPE_CUT_POINT_MS}. Clamped to `[0, wipeDurationMs]`.
 *
 * Do **not** schedule timeline enables with this alone — use {@link resolveWipeAirCutMs}.
 */
export function resolveWipeCutPointMs(
	attributes?: { cutPoint?: unknown } | null,
	wipeDurationMs: number = DEFAULT_WIPE_DURATION_MS
): number {
	const raw = attributes?.cutPoint
	let cut = WIPE_CUT_POINT_MS
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
		cut = Math.floor(raw)
	} else if (typeof raw === 'string' && raw.trim() !== '') {
		const parsed = Number(raw)
		if (Number.isFinite(parsed) && parsed >= 0) {
			cut = Math.floor(parsed)
		}
	}
	const max = Math.max(0, Math.floor(wipeDurationMs))
	if (max > 0) {
		cut = Math.min(cut, max)
	}
	return cut
}

/**
 * Take-relative ms when PGM should hard-cut under the sting (route / look / countup /
 * keepalive).
 *
 * Classical `wipes/wipe`: editorial file cut + half-frame cover centre + playout
 * latency, snapped to {@link WIPE_FRAME_MS}, so the hard-cut lands in the middle of
 * the 2-frame cover (380 ± ½ frame when PRELOAD latency is stable).
 *
 * Themed wipes keep file cut + latency only (their cover frames differ per asset).
 * Clamped to the wipe duration so the switch cannot land after CLEAR.
 */
export function resolveWipeAirCutMs(
	attributes?: { cutPoint?: unknown } | null,
	wipeDurationMs: number = DEFAULT_WIPE_DURATION_MS,
	wipeFile?: string
): number {
	const fileCutMs = resolveWipeCutPointMs(attributes, wipeDurationMs)
	const coverBiasMs = isClassicalWipeFile(wipeFile) ? WIPE_COVER_CENTER_OFFSET_MS : 0
	const airCutMs = snapMsToFrame(fileCutMs + coverBiasMs + Math.max(0, Math.floor(WIPE_PLAYOUT_LATENCY_MS)))
	const max = Math.max(0, Math.floor(wipeDurationMs))
	if (max > 0) {
		return Math.min(airCutMs, max)
	}
	return airCutMs
}

function resolveVideoFileName(object: VideoObject): string | undefined {
	const fromAttributes = object.attributes?.fileName
	if (typeof fromAttributes === 'string' && fromAttributes.trim()) {
		return fromAttributes.trim()
	}
	if (typeof object.clipName === 'string' && object.clipName.trim()) {
		return object.clipName.trim()
	}
	return undefined
}

export function parseClipProps(object: VideoObject): ClipProps | undefined {
	const fileName = resolveVideoFileName(object)
	if (!fileName) {
		return undefined
	}

	return {
		fileName,
		duration: object.duration,
	}
}

/**
 * Clip props from Rundown Editor ingest.
 * Duration is already milliseconds after sofie-editor-parsers/index.ts conversion — do not multiply again.
 */
export function parseClipEditorProps(object: VideoObject): ClipProps | undefined {
	const fileName = resolveVideoFileName(object)
	if (!fileName) {
		return undefined
	}

	const sourceDurationRaw = object.attributes?.sourceDuration
	const sourceDuration = typeof sourceDurationRaw === 'number' ? sourceDurationRaw : undefined

	return {
		fileName,
		duration: object.duration,
		sourceDuration,
		trimInMs: secondsAttributeToMs(object.attributes?.trimIn),
		trimOutMs: secondsAttributeToMs(object.attributes?.trimOut),
		volume: parseClipVolume(object.attributes?.volume),
	}
}

function secondsAttributeToMs(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return undefined
	}
	return Math.round(value * 1000)
}

/** Caspar mixer volume. Values in (1, 100] are treated as percent. */
export function parseClipVolume(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return 1
	}
	if (value > 1 && value <= 100) {
		return Math.min(1, Math.max(0, value / 100))
	}
	return Math.min(1, Math.max(0, value))
}

export interface ClipPlayback {
	seekMs: number
	durationMs: number | undefined
	volume: number
}

/**
 * Apply trim-in / trim-out / editorial duration to the playable window.
 * `sourceDuration` is ms; missing source falls back to editorial `duration`.
 */
export function resolveClipPlayback(clip: ClipProps): ClipPlayback {
	const seekMs = clip.trimInMs && clip.trimInMs > 0 ? clip.trimInMs : 0
	const trimOutMs = clip.trimOutMs && clip.trimOutMs > 0 ? clip.trimOutMs : 0
	const volume = clip.volume === undefined ? 1 : parseClipVolume(clip.volume)
	const editorial = clip.duration && clip.duration > 0 ? clip.duration : undefined

	let sourceWindow: number | undefined
	if (clip.sourceDuration !== undefined && clip.sourceDuration > 0) {
		sourceWindow = clip.sourceDuration > seekMs + trimOutMs ? clip.sourceDuration - seekMs - trimOutMs : 0
	} else if (editorial !== undefined) {
		const trimmedEditorial = editorial - seekMs - trimOutMs
		sourceWindow = trimmedEditorial > 0 ? trimmedEditorial : 0
	}

	let durationMs: number | undefined
	if (sourceWindow !== undefined && editorial !== undefined) {
		durationMs = Math.min(sourceWindow, editorial)
	} else {
		durationMs = sourceWindow ?? editorial
	}

	return { seekMs, durationMs, volume }
}

export function getClipPlayerInput(config: StudioConfig): StudioConfig['atemSources'][any] | undefined {
	if (config.visionMixer.type === VisionMixerDevice.Atem) {
		const mediaplayerInput = Object.values<InputConfig>(config.atemSources).find(
			(s) => s.type === SourceType.MediaPlayer
		)

		return mediaplayerInput
	} else if (config.visionMixer.type === VisionMixerDevice.VMix) {
		const mediaplayerInput = Object.values<VmixInputConfig>(config.vmixSources).find(
			(s) => s.type === SourceType.MediaPlayer
		)

		return mediaplayerInput
	} else {
		assertUnreachable(config.visionMixer.type)
	}
}

/**
 * Editorial VT / VO / SYN / fullscreen graphics play on PGM ClipPlayer2 when
 * hypercomposed (LED≠PGM). That keeps LED ClipPlayer1 free for the baseline
 * `bg_loop` so the wall loop is never displaced by a story clip.
 */
export function getEditorialClipCasparLayer(config: StudioConfig): CasparCGLayers {
	if (config.casparcg.hypercomposed) {
		return CasparCGLayers.CasparCGClipPlayer2
	}
	return CasparCGLayers.CasparCGClipPlayer1
}

function isTruthyAttribute(value: boolean | string | undefined): boolean {
	return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
}

export function getVideoPlayLayer(object: VideoObject): VideoPlayLayer | undefined {
	const raw = object.attributes?.playLayer
	if (typeof raw !== 'string') {
		return undefined
	}
	const normalized = raw.toLowerCase()
	if (normalized === 'effects' || normalized === 'background' || normalized === 'wipe') {
		return normalized
	}
	return undefined
}

export function isLayeredVideoObject(object: VideoObject): boolean {
	return getVideoPlayLayer(object) !== undefined
}

/** Main VT/VO takeover clip — excludes intro / bg-loop / wipe layered videos. */
export function findMainVideoObject(objects: SomeObject[]): VideoObject | undefined {
	return objects.find(
		(object): object is VideoObject => object.objectType === ObjectType.Video && !isLayeredVideoObject(object)
	)
}

function layeredVideoSourceLayer(playLayer: VideoPlayLayer): SourceLayer {
	if (playLayer === 'wipe') return SourceLayer.PgmWipe
	if (playLayer === 'effects') return SourceLayer.PgmIntro
	return SourceLayer.VT
}

function layeredVideoCasparLayer(playLayer: VideoPlayLayer): CasparCGLayers {
	if (playLayer === 'effects') return CasparCGLayers.CasparCGPgmIntroPlayer
	if (playLayer === 'wipe') return CasparCGLayers.CasparCGPgmEffectsPlayer
	return CasparCGLayers.CasparCGClipPlayer1
}

function layeredVideoLifespan(playLayer: VideoPlayLayer, fileName?: string): PieceLifespan {
	// Overlay intros are within the part; bg-loop sticks so operators can see/control it across takes.
	// Wipes are within-part (fire on take into the story).
	// Outro jingle freezes on its last frame for the rest of the rundown (no bed restart flash).
	if (playLayer === 'effects' && isOutroVideoFile(fileName)) return PieceLifespan.OutOnRundownEnd
	if (playLayer === 'effects' || playLayer === 'wipe') return PieceLifespan.WithinPart
	return PieceLifespan.OutOnRundownEnd
}

/**
 * Ensure layered video paths carry the Caspar media-folder prefix.
 * RE mediaPick sometimes stores a bare basename (`wipe`) even when `subdir` is set.
 * Themed story wipes (`wipes/wipe_sjv` / `_sport` / `_pocasie`) pass through unchanged —
 * media must exist under the Caspar media folder (demo-assets / megarepo).
 */
export function normalizeLayeredVideoFileName(playLayer: VideoPlayLayer, fileName: string): string {
	const trimmed = toCasparPlayPath(fileName.trim())
	if (!trimmed) {
		return playLayer === 'wipe' ? DEFAULT_WIPE_FILE : playLayer === 'background' ? DEFAULT_BG_LOOP_FILE : trimmed
	}
	// Valid two-level demo paths (clips|loops|wipes|assets/<file>) pass through unchanged.
	if (isDemoMediaPath(trimmed)) {
		return trimmed
	}
	// Nested / legacy paths flatten to <playLayer subdir>/<basename> — never pass depth > 2.
	const basename = trimmed.replace(/^.*[/\\]/, '')
	if (playLayer === 'wipe') return `wipes/${basename}`
	if (playLayer === 'background') return `loops/${basename}`
	if (playLayer === 'effects') return `assets/${basename}`
	return trimmed
}

/** True when a Caspar PLAY path is the weather stinger (`wipes/wipe_pocasie`). */
export function isWipePocasieFile(fileName: string | undefined): boolean {
	return /wipe_pocasie/i.test(fileName || '')
}

/** True when a Caspar PLAY path is the outro jingle overlay. */
export function isOutroVideoFile(fileName: string | undefined): boolean {
	return /(^|\/)outro(\.|$)/i.test((fileName || '').replace(/\\/g, '/'))
}

/** True when this part plays `assets/outro` (or RE piece type outro) on PGM 210. */
export function partHasOutroOverlay(objects: SomeObject[]): boolean {
	return objects.some((obj) => {
		if (obj.objectType !== ObjectType.Video) return false
		if (getVideoPlayLayer(obj) !== 'effects') return false
		return isOutroVideoFile(resolveVideoFileName(obj) ?? obj.clipName)
	})
}

/**
 * Timeline pieces for Intro overlay (PgmIntroPlayer / 210), BG loop (ClipPlayer1 / 110),
 * and PGM wipe (UI + mute; hypercomposed studios attach EffectsPlayer overlay + delayed
 * MEDIA route cut in {@link finalizeHypercomposedPart}).
 * These are NOT adlibs — they play on take so operators have absolute control.
 */
export function parseLayeredVideosFromObjects(
	context: ICommonContext,
	config: StudioConfig,
	objects: SomeObject[]
): IBlueprintPiece[] {
	const videos = objects.filter((o): o is VideoObject => o.objectType === ObjectType.Video)

	return videos.flatMap((object) => {
		const playLayer = getVideoPlayLayer(object)
		if (!playLayer) {
			return []
		}

		const rawFileName =
			resolveVideoFileName(object) ??
			(playLayer === 'background' ? DEFAULT_BG_LOOP_FILE : playLayer === 'wipe' ? DEFAULT_WIPE_FILE : undefined)
		if (!rawFileName) {
			return []
		}

		const fileName = normalizeLayeredVideoFileName(playLayer, rawFileName)

		const casparLayer = layeredVideoCasparLayer(playLayer)
		const sourceLayer = layeredVideoSourceLayer(playLayer)
		const loop = playLayer === 'background' || isTruthyAttribute(object.attributes?.loop)
		const transitionLabel =
			typeof object.attributes?.transition === 'string' && object.attributes.transition.trim()
				? object.attributes.transition.trim()
				: undefined

		const displayName =
			playLayer === 'effects'
				? `${isOutroVideoFile(fileName) ? 'Outro' : 'Intro'} | ${fileName}`
				: playLayer === 'wipe'
					? `Wipe${transitionLabel ? ` · ${transitionLabel}` : ''} | ${fileName}`
					: `BG loop | ${fileName}`

		// Wipes are short PGM transitions: never leave an open-ended piece covering the wipe layer.
		// Outro holds last frame for the rundown — do not end the piece when the mov ends.
		// Always resolve wipe duration through resolveWipeDurationMs so themed caps apply even
		// when RE/ingest supplies a positive duration (e.g. 2500 on wipe_sport).
		const enableDuration =
			playLayer === 'effects' && isOutroVideoFile(fileName)
				? undefined
				: playLayer === 'wipe'
					? resolveWipeDurationMs(object.duration > 0 ? object.duration : undefined, fileName)
					: object.duration > 0
						? object.duration
						: undefined

		const skipWipeOverlay = playLayer === 'wipe' && Boolean(config.casparcg.hypercomposed)

		const timelineObjects: TimelineBlueprintExt[] = skipWipeOverlay
			? []
			: [
					literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
						id: '',
						enable: { start: 0 },
						layer: casparLayer,
						priority: 1,
						content: {
							deviceType: TSR.DeviceType.CASPARCG,
							type: TSR.TimelineContentTypeCasparCg.MEDIA,
							file: toCasparPlayPath(fileName),
							...(loop ? { loop: true } : {}),
							// Outro: hold last frame after the jingle ends (piece OutOnRundownEnd).
							...(playLayer === 'effects' && isOutroVideoFile(fileName) ? { loop: false } : {}),
							// Force PLAY even when Package Manager has not verified the file yet.
							...(playLayer === 'effects' ? { mixer: { volume: 1 } } : {}),
						},
					}),
				]

		if (playLayer === 'wipe') {
			const wipeMutes = getWipeForceMuteChannels(config)
			if (wipeMutes.length > 0) {
				timelineObjects.push({
					...getAudioObjectOnLayer(config, SisyfosLayers.ForceMute, wipeMutes),
					enable: {
						start: 0,
						...(enableDuration !== undefined ? { duration: enableDuration } : {}),
					},
				})
			}
		}

		return [
			literal<IBlueprintPiece>({
				enable: {
					start: object.objectTime ?? 0,
					duration: enableDuration,
				},
				externalId: object.id,
				name: displayName,
				lifespan: layeredVideoLifespan(playLayer, fileName),
				sourceLayerId: sourceLayer,
				outputLayerId: getOutputLayerForSourceLayer(sourceLayer),
				// InTransition: Softie ignores this piece's preroll when computing part
				// toPartDelay, so look MEDIA / bed C stay Take-relative while wipe still
				// LOADBGs via childGroup = control − preroll.
				...(playLayer === 'wipe' ? { pieceType: IBlueprintPieceType.InTransition } : {}),
				content: {
					fileName,
					ignoreAudioFormat: playLayer === 'effects' || playLayer === 'wipe',
					ignoreMediaObjectStatus: playLayer === 'wipe' || playLayer === 'effects',
					timelineObjects,
				},
				expectedPackages: [
					createMediaFileExpectedPackage(context, fileName, [casparLayer], {
						includeSideEffects: playLayer !== 'background',
					}),
				],
				prerollDuration:
					playLayer === 'wipe' ? Math.max(config.casparcgLatency, DEFAULT_WIPE_PREROLL_MS) : config.casparcgLatency,
			}),
		]
	})
}

export function clipToAdlib(
	context: ICommonContext,
	config: StudioConfig,
	clipObject: VideoObject
): IBlueprintAdLibPiece | undefined {
	if (isLayeredVideoObject(clipObject)) {
		// Layered videos are timeline pieces, not adlibs.
		return undefined
	}

	const props = parseClipProps(clipObject)
	if (!props) {
		return undefined
	}

	const visionMixerInput = getClipPlayerInput(config)

	return literal<IBlueprintAdLibPiece>({
		_rank: 0,
		externalId: clipObject.id,
		name: props.fileName,
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.VO,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.VO),
		expectedPackages: [
			createMediaFileExpectedPackage(context, props.fileName, [getEditorialClipCasparLayer(config)], {
				includeSideEffects: false,
			}),
		],
		content: {
			fileName: props.fileName,

			timelineObjects: [
				...createVisionMixerObjects(config, visionMixerInput?.input || 0, config.casparcgLatency),

				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: getEditorialClipCasparLayer(config),
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,

						file: props.fileName,
					},
					priority: 1,
				}),
			],
		},
	})
}

export function parseClipsFromObjects(
	context: ICommonContext,
	config: StudioConfig,
	objects: SomeObject[]
): IBlueprintAdLibPiece[] {
	const clips = objects.filter((o): o is VideoObject => o.objectType === ObjectType.Video)

	return clips.flatMap((o) => {
		const adlib = clipToAdlib(context, config, o)
		return adlib ? [adlib] : []
	})
}
