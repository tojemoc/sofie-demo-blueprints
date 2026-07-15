import { IBlueprintAdLibPiece, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { ObjectType, SomeObject, VideoObject } from '../../../common/definitions/objects.js'
import { assertUnreachable, literal } from '../../../common/util.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createVisionMixerObjects } from './visionMixer.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { InputConfig, VmixInputConfig } from '../../..//$schemas/generated/main-studio-config.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'

export interface ClipProps {
	fileName: string
	duration?: number
	sourceDuration?: number
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

export function clipToAdlib(
	context: ICommonContext,
	config: StudioConfig,
	clipObject: VideoObject
): IBlueprintAdLibPiece | undefined {
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
