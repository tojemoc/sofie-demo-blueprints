import { IBlueprintAdLibPiece, IShowStyleUserContext } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { SourceType, VmixSourceCategory } from '../../studio/helpers/config.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { parseConfig } from '../helpers/config.js'
import {
	createVMixExternalTimelineObject,
	createVMixInputPlaybackTimelineObject,
	createVMixOverlayOffTimelineObject,
	createVMixOverlayTimelineObject,
	createVMixPreviewTimelineObject,
	createVMixProgramCutPieceContent,
	createVMixRecordingTimelineObject,
	createVMixStreamingTimelineObject,
	getDefaultVmixAdlibLifespan,
} from '../helpers/vmixOperations.js'
import { getVmixSources, isVmixStudio, resolveVmixOverlayChannel } from '../helpers/vmixSources.js'

const CATEGORY_RANK: Record<VmixSourceCategory, number> = {
	[VmixSourceCategory.Video]: 400,
	[VmixSourceCategory.Technical]: 500,
	[VmixSourceCategory.Graphics]: 600,
}

function categoryRank(category?: VmixSourceCategory): number {
	return category ? CATEGORY_RANK[category] : CATEGORY_RANK[VmixSourceCategory.Video]
}

function sourceLayerForType(type: SourceType): SourceLayer {
	switch (type) {
		case SourceType.Camera:
			return SourceLayer.Camera
		case SourceType.Remote:
			return SourceLayer.Remote
		case SourceType.MediaPlayer:
			return SourceLayer.VT
		case SourceType.Graphics:
			return SourceLayer.GFX
		default:
			return SourceLayer.GFX
	}
}

export function getGlobalVmixAdlibs(context: IShowStyleUserContext): IBlueprintAdLibPiece[] {
	const config = parseConfig(context).studio
	if (!isVmixStudio(config)) return []

	const adlibs: IBlueprintAdLibPiece[] = []
	const sources = getVmixSources(config)

	for (const source of sources) {
		if (source.type === SourceType.MultiView) continue

		const baseRank = categoryRank(source.category)
		const tagOffset = (source.tags?.[0]?.charCodeAt(0) ?? 0) % 20
		const sourceLayer = sourceLayerForType(source.type)
		const outputLayer = getOutputLayerForSourceLayer(sourceLayer)

		adlibs.push(
			literal<IBlueprintAdLibPiece>({
				_rank: baseRank + tagOffset,
				externalId: `vmix-cut-${source.key}`,
				name: `Cut: ${source.displayName}`,
				lifespan: getDefaultVmixAdlibLifespan(),
				sourceLayerId: sourceLayer,
				outputLayerId: outputLayer,
				tags: ['vmix', 'program', ...(source.tags ?? [])],
				content: {
					timelineObjects: createVMixProgramCutPieceContent(
						config,
						source.input,
						0,
						source.defaultVolume
					),
				},
			})
		)

		adlibs.push(
			literal<IBlueprintAdLibPiece>({
				_rank: baseRank + 10 + tagOffset,
				externalId: `vmix-preview-${source.key}`,
				name: `Preview: ${source.displayName}`,
				lifespan: getDefaultVmixAdlibLifespan(),
				sourceLayerId: sourceLayer,
				outputLayerId: outputLayer,
				tags: ['vmix', 'preview', ...(source.tags ?? [])],
				content: {
					timelineObjects: [createVMixPreviewTimelineObject(source.input)],
				},
			})
		)

		if (source.type === SourceType.Graphics || source.overlayChannel || source.category === VmixSourceCategory.Graphics) {
			const overlayChannel = resolveVmixOverlayChannel(config, source.key, source.overlayChannel)

			adlibs.push(
				literal<IBlueprintAdLibPiece>({
					_rank: baseRank + 20 + tagOffset,
					externalId: `vmix-overlay-in-${source.key}`,
					name: `Overlay IN: ${source.displayName}`,
					lifespan: getDefaultVmixAdlibLifespan(),
					sourceLayerId: SourceLayer.GFX,
					outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
					tags: ['vmix', 'overlay', ...(source.tags ?? [])],
					content: {
						timelineObjects: [createVMixOverlayTimelineObject(source.input, overlayChannel)],
					},
				}),
				literal<IBlueprintAdLibPiece>({
					_rank: baseRank + 21 + tagOffset,
					externalId: `vmix-overlay-out-${source.key}`,
					name: `Overlay OUT: ${source.displayName}`,
					lifespan: getDefaultVmixAdlibLifespan(),
					sourceLayerId: SourceLayer.GFX,
					outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
					tags: ['vmix', 'overlay', ...(source.tags ?? [])],
					content: {
						timelineObjects: [createVMixOverlayOffTimelineObject(overlayChannel)],
					},
				})
			)
		}

		if (source.type === SourceType.MediaPlayer || source.category === VmixSourceCategory.Video) {
			adlibs.push(
				literal<IBlueprintAdLibPiece>({
					_rank: baseRank + 30 + tagOffset,
					externalId: `vmix-play-${source.key}`,
					name: `Play: ${source.displayName}`,
					lifespan: getDefaultVmixAdlibLifespan(),
					sourceLayerId: SourceLayer.VT,
					outputLayerId: getOutputLayerForSourceLayer(SourceLayer.VT),
					tags: ['vmix', 'playback', ...(source.tags ?? [])],
					content: {
						timelineObjects: [createVMixInputPlaybackTimelineObject(source.input, true)],
					},
				}),
				literal<IBlueprintAdLibPiece>({
					_rank: baseRank + 31 + tagOffset,
					externalId: `vmix-restart-${source.key}`,
					name: `Restart: ${source.displayName}`,
					lifespan: getDefaultVmixAdlibLifespan(),
					sourceLayerId: SourceLayer.VT,
					outputLayerId: getOutputLayerForSourceLayer(SourceLayer.VT),
					tags: ['vmix', 'playback', ...(source.tags ?? [])],
					content: {
						timelineObjects: [createVMixInputPlaybackTimelineObject(source.input, true, true)],
					},
				})
			)
		}
	}

	adlibs.push(
		literal<IBlueprintAdLibPiece>({
			_rank: 900,
			externalId: 'vmix-recording-on',
			name: 'vMix REC ON',
			lifespan: getDefaultVmixAdlibLifespan(),
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			tags: ['vmix', 'studio-master', 'recording'],
			content: { timelineObjects: [createVMixRecordingTimelineObject(true)] },
		}),
		literal<IBlueprintAdLibPiece>({
			_rank: 901,
			externalId: 'vmix-recording-off',
			name: 'vMix REC OFF',
			lifespan: getDefaultVmixAdlibLifespan(),
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			tags: ['vmix', 'studio-master', 'recording'],
			content: { timelineObjects: [createVMixRecordingTimelineObject(false)] },
		}),
		literal<IBlueprintAdLibPiece>({
			_rank: 902,
			externalId: 'vmix-streaming-on',
			name: 'vMix STREAM ON',
			lifespan: getDefaultVmixAdlibLifespan(),
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			tags: ['vmix', 'studio-master', 'streaming'],
			content: { timelineObjects: [createVMixStreamingTimelineObject(true)] },
		}),
		literal<IBlueprintAdLibPiece>({
			_rank: 903,
			externalId: 'vmix-streaming-off',
			name: 'vMix STREAM OFF',
			lifespan: getDefaultVmixAdlibLifespan(),
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			tags: ['vmix', 'studio-master', 'streaming'],
			content: { timelineObjects: [createVMixStreamingTimelineObject(false)] },
		}),
		literal<IBlueprintAdLibPiece>({
			_rank: 904,
			externalId: 'vmix-external-on',
			name: 'vMix EXTERNAL ON',
			lifespan: getDefaultVmixAdlibLifespan(),
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			tags: ['vmix', 'studio-master', 'external'],
			content: { timelineObjects: [createVMixExternalTimelineObject(true)] },
		}),
		literal<IBlueprintAdLibPiece>({
			_rank: 905,
			externalId: 'vmix-external-off',
			name: 'vMix EXTERNAL OFF',
			lifespan: getDefaultVmixAdlibLifespan(),
			sourceLayerId: SourceLayer.GFX,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.GFX),
			tags: ['vmix', 'studio-master', 'external'],
			content: { timelineObjects: [createVMixExternalTimelineObject(false)] },
		})
	)

	return adlibs
}
