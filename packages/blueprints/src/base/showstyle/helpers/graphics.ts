import {
	IBlueprintAdLibPiece,
	IBlueprintPiece,
	ICommonContext,
	PieceLifespan,
	TSR,
} from '@sofie-automation/blueprints-integration'
import {
	GraphicObject,
	GraphicObjectAttributes,
	GraphicObjectBase,
	ObjectType,
	SomeObject,
	SteppedGraphicObject,
} from '../../../common/definitions/objects.js'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { getClipPlayerInput } from './clips.js'
import { createVisionMixerObjects } from './visionMixer.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { createMediaFileExpectedPackage, toCasparPlayPath } from './mediaPackages.js'

export interface GraphicsResult {
	pieces: IBlueprintPiece[]
	adLibPieces: IBlueprintAdLibPiece[]
}

function isFullscreenGraphic(clipName: string): boolean {
	return !!clipName.match(/fullscreen|outro/i)
}

function getTemplateAttributes(clipName: string, attributes: GraphicObjectAttributes): GraphicObjectAttributes {
	const { pieceName: _pieceName, ...templateAttributes } = attributes
	delete templateAttributes.iluFallback

	if (clipName === 'gfx/l3d-headline') {
		const mapped: GraphicObjectAttributes = { ...templateAttributes }
		if (mapped.headline !== undefined && mapped.title === undefined) {
			mapped.title = mapped.headline
		}
		if (mapped.subline !== undefined && mapped.subtitle === undefined) {
			mapped.subtitle = mapped.subline
		}
		delete mapped.headline
		delete mapped.subline
		return mapped
	}

	return templateAttributes
}

function useHeadlineIluFallback(object: GraphicObjectBase): boolean {
	const rawFallback = object.attributes.iluFallback
	const fallbackEnabled =
		rawFallback === true || (typeof rawFallback === 'string' && rawFallback.toLowerCase() === 'true')
	return object.clipName === 'gfx/headline' && fallbackEnabled && !!object.attributes.iluFile
}

function getGraphicSourceLayer(object: GraphicObjectBase): SourceLayer {
	if (object.clipName.match(/logo-bug/i)) {
		return SourceLayer.Logo
	} else if (object.clipName.match(/ticker/i)) {
		return SourceLayer.Ticker
	} else if (object.clipName.match(/strap/i)) {
		return SourceLayer.Strap
	} else if (object.clipName.match(/fullscreen|outro/i)) {
		return SourceLayer.GFX
	} else {
		return SourceLayer.LowerThird
	}
}
function getGraphicTlLayer(object: GraphicObjectBase): CasparCGLayers {
	if (object.clipName.match(/logo-bug/i)) {
		return CasparCGLayers.CasparCGGraphicsLogo
	} else if (object.clipName.match(/ticker/i)) {
		return CasparCGLayers.CasparCGGraphicsTicker
	} else if (object.clipName.match(/strap/i)) {
		return CasparCGLayers.CasparCGGraphicsStrap
	} else if (object.clipName.match(/fullscreen|outro/i)) {
		return CasparCGLayers.CasparCGClipPlayer1
	} else {
		return CasparCGLayers.CasparCGGraphicsLowerThird
	}
}

function getGraphicTlObject(
	config: StudioConfig,
	object: GraphicObjectBase,
	isAdlib?: boolean
): TimelineBlueprintExt[] {
	const iluFallback = useHeadlineIluFallback(object)
	const clipName = iluFallback ? 'gfx/headline-fallback' : object.clipName
	const iluFile = typeof object.attributes.iluFile === 'string' ? object.attributes.iluFile : undefined
	const fullscreenAtemInput = getClipPlayerInput(config)
	const isFullscreen = isFullscreenGraphic(clipName)
	const fallbackIluMediaObject =
		iluFallback && iluFile
			? [
					literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
						id: '',
						enable: {
							start: 0,
						},
						layer: CasparCGLayers.CasparCGClipPlayer1,
						priority: 1 + (isAdlib ? 10 : 0),
						content: {
							deviceType: TSR.DeviceType.CASPARCG,
							type: TSR.TimelineContentTypeCasparCg.MEDIA,
							file: toCasparPlayPath(iluFile),
						},
					}),
				]
			: []

	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGTemplate>>({
			id: '',
			enable: {
				start: 0, // TODO - this might not be quite right
			},
			layer: getGraphicTlLayer(object),
			priority: 1 + (isAdlib ? 10 : 0),
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.TEMPLATE,

				templateType: 'html',
				name: clipName,
				data: {
					...getTemplateAttributes(clipName, object.attributes),
				},
				useStopCommand: isFullscreen ? false : true,
			},
		}),
		...fallbackIluMediaObject,
		...(isFullscreen ? createVisionMixerObjects(config, fullscreenAtemInput?.input || 0, config.casparcgLatency) : []),
	]
}
function isHeadlineWithIlu(object: GraphicObjectBase): boolean {
	return object.clipName === 'gfx/headline' && !!object.attributes.iluFile
}

function getIluExpectedPackages(context: ICommonContext | undefined, object: GraphicObjectBase) {
	if (!context || !isHeadlineWithIlu(object)) {
		return undefined
	}

	const targetLayer = useHeadlineIluFallback(object)
		? CasparCGLayers.CasparCGClipPlayer1
		: CasparCGLayers.CasparCGGraphicsLowerThird

	return [createMediaFileExpectedPackage(context, object.attributes.iluFile as string, [targetLayer])]
}

function parseGraphic(
	config: StudioConfig,
	object: GraphicObject | SteppedGraphicObject,
	context?: ICommonContext
): IBlueprintPiece {
	const sourceLayer = getGraphicSourceLayer(object)
	const lifespan = getGraphicLifespan(sourceLayer, object)

	return {
		externalId: object.id,
		name: `${object.clipName} | ${Object.values<any>(object.attributes)
			.filter((v) => v !== 'true' && v !== 'false')
			.join(', ')}`, // todo - add info
		lifespan,
		sourceLayerId: sourceLayer,
		outputLayerId: getOutputLayerForSourceLayer(sourceLayer),
		content: {
			timelineObjects: getGraphicTlObject(config, object, false),

			// Be careful the numbering of the current step is 1-based
			// so it should start from 1 for `NoraContent` (stepped graphics) !
			step: 'stepCount' in object.attributes ? { current: 1, count: object.attributes.stepCount } : undefined,
			templateData: {
				...getTemplateAttributes(object.clipName, object.attributes),
			},
			// ToDo: This was the old way of doing it, but it doesn't work in R53:
			// payload: {
			// 	content: {
			// 		...object.attributes,
			// 		adlib: undefined,
			// 	},
			// 	manifest: '',
			// 	template: {
			// 		event: '',
			// 		layer: '',
			// 		name: object.clipName,
			// 	},
			// },
			previewRenderer: config.previewRenderer,
		},
		enable: {
			start: object.objectTime,
			duration: object.duration > 0 ? object.duration : undefined,
		},
		prerollDuration: config.casparcgLatency,
		expectedPackages: getIluExpectedPackages(context, object),
	}
}
export function parseAdlibGraphic(
	config: StudioConfig,
	object: GraphicObjectBase,
	index: number,
	context?: ICommonContext
): IBlueprintAdLibPiece {
	const sourceLayer = getGraphicSourceLayer(object)
	const lifespan = getGraphicLifespan(sourceLayer, object)
	const isFullscreen = isFullscreenGraphic(object.clipName)

	return {
		externalId: object.id,
		name: `${object.clipName} | ${Object.values<string | number | boolean | undefined>(object.attributes)
			.map((v) => (typeof v === 'string' ? v : v?.toString()))
			.filter((v) => v !== 'true' && v !== 'false' && v !== undefined)
			.join(', ')}`, // todo - add info
		lifespan,
		sourceLayerId: sourceLayer,
		outputLayerId: getOutputLayerForSourceLayer(sourceLayer),
		prerollDuration: isFullscreen ? config.casparcgLatency : 0,
		content: {
			timelineObjects: getGraphicTlObject(config, object, true),

			templateData: {
				...getTemplateAttributes(object.clipName, object.attributes),
			},
			// payload: {
			// 	content: {
			// 		...object.attributes,
			// 		adlib: undefined,
			// 	},
			// 	manifest: '',
			// 	template: {
			// 		event: '',
			// 		layer: '',
			// 		name: object.clipName,
			// 	},
			// },
		},
		_rank: index, // todo - probably some offset for ordering
		expectedDuration: object.duration,
		expectedPackages: getIluExpectedPackages(context, object),
	}
}

export function parseGraphicsFromObjects(
	config: StudioConfig,
	objects: SomeObject[],
	context?: ICommonContext
): GraphicsResult {
	const graphicsObjects = objects.filter((o): o is GraphicObject => o.objectType === ObjectType.Graphic)

	return {
		pieces: graphicsObjects.filter((o) => !o.isAdlib).map((o) => parseGraphic(config, o, context)),
		adLibPieces: graphicsObjects.filter((o) => !!o.isAdlib).map((o, i) => parseAdlibGraphic(config, o, i, context)),
	}
}
function getGraphicLifespan(sourceLayer: SourceLayer, object: GraphicObjectBase): PieceLifespan {
	if (sourceLayer === SourceLayer.Ticker) {
		return PieceLifespan.OutOnRundownEnd
	}

	if (sourceLayer === SourceLayer.Logo) {
		return PieceLifespan.OutOnRundownEnd
	}

	if (
		sourceLayer === SourceLayer.Strap &&
		(!object.attributes['text'] ||
			(typeof object.attributes['text'] === 'string' && object.attributes['text'].match(/live/i)))
	) {
		return PieceLifespan.OutOnSegmentEnd
	}

	return PieceLifespan.WithinPart
}
