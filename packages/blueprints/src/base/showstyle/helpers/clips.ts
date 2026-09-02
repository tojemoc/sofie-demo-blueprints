import {
	IBlueprintAdLibPiece,
	IBlueprintPiece,
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
import { LED_BACKGROUND_LOOP_FILE } from '../rundown/baseline.js'
import { getAudioObjectOnLayer } from './audio.js'
import { getPlaybackForceMuteChannels } from './backgroundMusic.js'

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

export const DEFAULT_BG_LOOP_FILE = LED_BACKGROUND_LOOP_FILE

/** Fallback wipe length when RE leaves duration empty/0 (full stinger overlay). */
export const DEFAULT_WIPE_DURATION_MS = 2500

/** Cut point within the wipe stinger — when the screen is fully covered and content switches. */
export const WIPE_CUT_POINT_MS = 760

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

function layeredVideoLifespan(playLayer: VideoPlayLayer): PieceLifespan {
	// Overlay intros are within the part; bg-loop sticks so operators can see/control it across takes.
	// Wipes are within-part (fire on take into the story).
	if (playLayer === 'effects' || playLayer === 'wipe') return PieceLifespan.WithinPart
	return PieceLifespan.OutOnRundownEnd
}

/**
 * Ensure layered video paths carry the Caspar media-folder prefix.
 * RE mediaPick sometimes stores a bare basename (`wipe`) even when `subdir` is set.
 */
/** Labelled story wipes fall back to the default stinger until dedicated media exists on disk. */
const WIPE_MEDIA_ALIASES = Object.freeze(
	Object.fromEntries([
		['wipes/wipe_sjv', 'wipes/wipe'],
		['wipes/wipe_sport', 'wipes/wipe'],
		['wipes/wipe_pocasie', 'wipes/wipe'],
	] as const)
)

function resolveWipeMediaAlias(trimmed: string): string | undefined {
	if (!Object.prototype.hasOwnProperty.call(WIPE_MEDIA_ALIASES, trimmed)) {
		return undefined
	}
	return WIPE_MEDIA_ALIASES[trimmed as keyof typeof WIPE_MEDIA_ALIASES]
}

export function normalizeLayeredVideoFileName(playLayer: VideoPlayLayer, fileName: string): string {
	const trimmed = toCasparPlayPath(fileName.trim())
	if (!trimmed) {
		return playLayer === 'wipe' ? DEFAULT_WIPE_FILE : playLayer === 'background' ? DEFAULT_BG_LOOP_FILE : trimmed
	}
	if (playLayer === 'wipe') {
		const aliased = resolveWipeMediaAlias(trimmed)
		if (aliased) return aliased
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

/**
 * Timeline pieces for Intro overlay (PgmIntroPlayer / 210), BG loop (ClipPlayer1 / 110),
 * and PGM wipe (PgmEffectsPlayer / 200).
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
				? `Intro | ${fileName}`
				: playLayer === 'wipe'
					? `Wipe${transitionLabel ? ` · ${transitionLabel}` : ''} | ${fileName}`
					: `BG loop | ${fileName}`

		// Wipes are short PGM transitions: never leave an open-ended piece covering layer 200.
		const enableDuration =
			object.duration > 0 ? object.duration : playLayer === 'wipe' ? DEFAULT_WIPE_DURATION_MS : undefined

		const timelineObjects: TimelineBlueprintExt[] = [
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
					// Force PLAY even when Package Manager has not verified the file yet.
					...(playLayer === 'wipe' || playLayer === 'effects' ? { mixer: { volume: 1 } } : {}),
				},
			}),
		]

		if (playLayer === 'wipe') {
			const playbackMutes = getPlaybackForceMuteChannels(config)
			if (playbackMutes.length > 0) {
				timelineObjects.push({
					...getAudioObjectOnLayer(config, SisyfosLayers.ForceMute, playbackMutes),
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
				lifespan: layeredVideoLifespan(playLayer),
				sourceLayerId: sourceLayer,
				outputLayerId: getOutputLayerForSourceLayer(sourceLayer),
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
				prerollDuration: config.casparcgLatency,
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
