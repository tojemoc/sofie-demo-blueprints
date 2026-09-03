import { BlueprintResultPart, IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { literal, stripExtension } from '../../../common/util.js'
import { AudioSourceType } from '../../studio/helpers/config.js'
import { PartProps, VTProps } from '../definitions/index.js'
import { getAudioPrimaryObject } from '../helpers/audio.js'
import {
	getClipPlayerInput,
	getEditorialClipCasparLayer,
	parseLayeredVideosFromObjects,
	resolveClipPlayback,
} from '../helpers/clips.js'
import { parseGraphicsFromObjects } from '../helpers/graphics.js'
import { createMediaFileExpectedPackage } from '../helpers/mediaPackages.js'
import { createScriptPiece } from '../helpers/script.js'
import { createVisionMixerObjects } from '../helpers/visionMixer.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { parseConfig } from '../helpers/config.js'
import { LookSlot, finalizeHypercomposedPart } from '../helpers/pgmLook.js'

export function generateVTPart(
	context: PartContext,
	part: PartProps<VTProps>,
	lookSlot: LookSlot = 'A'
): BlueprintResultPart {
	const config = parseConfig(context).studio
	const visionMixerInput = getClipPlayerInput(config)
	const playback = resolveClipPlayback(part.payload.clipProps)

	const audioTlObj = getAudioPrimaryObject(config, [{ type: AudioSourceType.Playback, index: 0 }]) // todo: which playback?

	const vtPiece: IBlueprintPiece = {
		enable: {
			start: 0,
			...(playback.durationMs !== undefined ? { duration: playback.durationMs } : {}),
		},
		externalId: part.payload.externalId,
		name: part.payload.clipProps.fileName,
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.VT,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.VT),
		abSessions: [
			{
				sessionName: part.payload.externalId,
				poolName: 'clip',
			},
		],
		content: {
			fileName: part.payload.clipProps.fileName,

			timelineObjects: [
				...createVisionMixerObjects(config, visionMixerInput?.input || 0, config.casparcgLatency),

				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: getEditorialClipCasparLayer(config),
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,

						file: stripExtension(part.payload.clipProps.fileName),
						...(playback.seekMs > 0 ? { seek: playback.seekMs } : {}),
						mixer: {
							volume: playback.volume,
						},
					},
					priority: 1,
				}),

				audioTlObj,
			],

			sourceDuration: part.payload.clipProps.sourceDuration,
			seek: playback.seekMs > 0 ? playback.seekMs : undefined,
		},
		expectedPackages: [
			createMediaFileExpectedPackage(context, part.payload.clipProps.fileName, [getEditorialClipCasparLayer(config)]),
		],
	}

	const pieces = [vtPiece]
	const scriptPiece = createScriptPiece(part.payload.script, part.payload.externalId)
	if (scriptPiece) pieces.push(scriptPiece)

	const graphics = parseGraphicsFromObjects(config, part.objects, context)
	if (graphics.pieces) pieces.push(...graphics.pieces)

	const layeredVideos = parseLayeredVideosFromObjects(context, config, part.objects)
	if (layeredVideos.length) pieces.push(...layeredVideos)

	const result: BlueprintResultPart = {
		part: {
			externalId: part.payload.externalId,
			title: part.payload.name,

			expectedDuration: playback.durationMs ?? (part.payload.duration > 0 ? part.payload.duration : undefined),
			autoNext: true,
		},
		pieces,
		adLibPieces: [...graphics.adLibPieces],
		actions: [],
	}
	finalizeHypercomposedPart(
		context,
		config,
		result.part,
		part.payload.externalId,
		part.objects,
		result.pieces,
		lookSlot
	)
	return result
}
