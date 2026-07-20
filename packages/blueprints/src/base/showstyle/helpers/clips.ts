import {
	IBlueprintAdLibPiece,
	IBlueprintPiece,
	ICommonContext,
	PieceLifespan,
	TSR,
} from '@sofie-automation/blueprints-integration'
import { ObjectType, SomeObject, VideoObject, VideoPlayLayer } from '../../../common/definitions/objects.js'
import { assertUnreachable, literal } from '../../../common/util.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createVisionMixerObjects } from './visionMixer.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { InputConfig, VmixInputConfig } from '../../..//$schemas/generated/main-studio-config.js'
import { createMediaFileExpectedPackage, toCasparPlayPath } from './mediaPackages.js'
import { LED_BACKGROUND_LOOP_FILE } from '../rundown/baseline.js'

export interface ClipProps {
	fileName: string
	duration?: number
	sourceDuration?: number
}

export const DEFAULT_BG_LOOP_FILE = LED_BACKGROUND_LOOP_FILE

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
	}
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

function isTruthyAttribute(value: boolean | string | undefined): boolean {
	return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
}

export function getVideoPlayLayer(object: VideoObject): VideoPlayLayer | undefined {
	const raw = object.attributes?.playLayer
	if (raw === 'effects' || raw === 'background') {
		return raw
	}
	return undefined
}

export function isLayeredVideoObject(object: VideoObject): boolean {
	return getVideoPlayLayer(object) !== undefined
}

function layeredVideoSourceLayer(playLayer: VideoPlayLayer): SourceLayer {
	return playLayer === 'effects' ? SourceLayer.Titles : SourceLayer.VT
}

function layeredVideoCasparLayer(playLayer: VideoPlayLayer): CasparCGLayers {
	return playLayer === 'effects' ? CasparCGLayers.CasparCGEffectsPlayer : CasparCGLayers.CasparCGClipPlayer1
}

function layeredVideoLifespan(playLayer: VideoPlayLayer): PieceLifespan {
	// Overlay intros are within the part; bg-loop sticks so operators can see/control it across takes.
	return playLayer === 'effects' ? PieceLifespan.WithinPart : PieceLifespan.OutOnRundownEnd
}

/**
 * Timeline pieces for Intro overlay (EffectsPlayer / 200) and BG loop (ClipPlayer1 / 110).
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

		const fileName = resolveVideoFileName(object) ?? (playLayer === 'background' ? DEFAULT_BG_LOOP_FILE : undefined)
		if (!fileName) {
			return []
		}

		const casparLayer = layeredVideoCasparLayer(playLayer)
		const sourceLayer = layeredVideoSourceLayer(playLayer)
		const loop = playLayer === 'background' || isTruthyAttribute(object.attributes?.loop)

		return [
			literal<IBlueprintPiece>({
				enable: {
					start: object.objectTime ?? 0,
					duration: object.duration > 0 ? object.duration : undefined,
				},
				externalId: object.id,
				name: playLayer === 'effects' ? `Intro | ${fileName}` : `BG loop | ${fileName}`,
				lifespan: layeredVideoLifespan(playLayer),
				sourceLayerId: sourceLayer,
				outputLayerId: getOutputLayerForSourceLayer(sourceLayer),
				content: {
					fileName,
					ignoreAudioFormat: playLayer === 'effects',
					timelineObjects: [
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
							},
						}),
					],
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
			createMediaFileExpectedPackage(context, props.fileName, [CasparCGLayers.CasparCGClipPlayer1], {
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
					layer: CasparCGLayers.CasparCGClipPlayer1,
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
