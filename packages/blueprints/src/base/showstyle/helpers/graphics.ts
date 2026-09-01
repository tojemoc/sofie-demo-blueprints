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
import {
	PGM_DOUBLEBOX_ILU_CROP,
	PGM_DOUBLEBOX_ILU_FILL,
	coverCropForFill,
} from '../../studio/applyConfig/mappings/casparcgLayers.js'

export interface GraphicsResult {
	pieces: IBlueprintPiece[]
	adLibPieces: IBlueprintAdLibPiece[]
}

function isFullscreenGraphic(clipName: string): boolean {
	return !!clipName.match(/fullscreen|pocasie|weather/i)
}

function isTruthyAttribute(value: boolean | string | undefined): boolean {
	return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
}

function normalizeGraphicClipName(clipName: string): string {
	return clipName.trim().toLowerCase()
}

/** Map Sofie clipNames to on-disk Caspar template paths from demo-assets `template/gfx/`. */
function resolveCasparTemplateName(clipName: string): string {
	const normalized = normalizeGraphicClipName(clipName)
	if (normalized === 'gfx/l3d-odporucanie') {
		return 'gfx/outro'
	}
	return normalized
}

function isPocasieGraphic(object: GraphicObjectBase): boolean {
	const clip = normalizeGraphicClipName(object.clipName)
	return clip === 'gfx/pocasie' || clip === 'gfx/weather'
}

function isDoubleboxIlu(object: GraphicObjectBase): boolean {
	return normalizeGraphicClipName(object.clipName) === 'gfx/doublebox-ilu' && !!object.attributes.iluFile
}

function getTemplateAttributes(
	clipName: string,
	attributes: GraphicObjectAttributes,
	options?: { omitIluFile?: boolean }
): GraphicObjectAttributes {
	const normalizedClip = clipName.trim().toLowerCase()
	const { pieceName: _pieceName, ...templateAttributes } = attributes
	delete templateAttributes.iluFallback
	delete templateAttributes.iluPrerendered
	delete templateAttributes.bypass

	if (normalizedClip === 'gfx/source') {
		const source = typeof templateAttributes.source === 'string' ? templateAttributes.source.trim() : ''
		return source ? { source } : {}
	}

	const rawSourceEnabled = templateAttributes.sourceEnabled
	delete templateAttributes.sourceEnabled

	const trimmedSource = typeof templateAttributes.source === 'string' ? templateAttributes.source.trim() : undefined
	const sourceEnabled =
		rawSourceEnabled === undefined
			? !!trimmedSource // legacy: keep non-empty source when toggle is absent
			: isTruthyAttribute(rawSourceEnabled)
	if (!sourceEnabled || !trimmedSource) {
		delete templateAttributes.source
	} else {
		templateAttributes.source = trimmedSource
	}

	if (options?.omitIluFile) {
		delete templateAttributes.iluFile
	}

	if (normalizedClip === 'gfx/l3d-headline') {
		const mapped: GraphicObjectAttributes = { ...templateAttributes }
		// Stock demo blueprints + v2 templates expect headline/subline on Caspar (not title/subtitle).
		if (mapped.headline === undefined && mapped.title !== undefined) {
			mapped.headline = mapped.title
		}
		if (mapped.subline === undefined && mapped.subtitle !== undefined) {
			mapped.subline = mapped.subtitle
		}
		delete mapped.title
		delete mapped.subtitle
		return mapped
	}

	if (normalizedClip === 'gfx/l3d-tema' || normalizedClip === 'gfx/l3d-odporucanie' || normalizedClip === 'gfx/outro') {
		const mapped: GraphicObjectAttributes = { ...templateAttributes }
		if (mapped.headline === undefined && mapped.title !== undefined) {
			mapped.headline = mapped.title
		}
		delete mapped.title
		return mapped
	}

	if (normalizedClip === 'gfx/l3d-predstavovak' || normalizedClip === 'gfx/l3d-mod') {
		const mapped: GraphicObjectAttributes = { ...templateAttributes }
		if (mapped.name === undefined && mapped.headline !== undefined) {
			mapped.name = mapped.headline
		}
		if (mapped.title === undefined && mapped.subline !== undefined) {
			mapped.title = mapped.subline
		}
		// Empty subline leaves the previous Caspar field value — send whitespace to clear.
		if (typeof mapped.title === 'string' && mapped.title.trim() === '') {
			mapped.title = '\u00a0'
		}
		// Drop aliases so templates only see the canonical name/title contract.
		delete mapped.headline
		delete mapped.subline
		return mapped
	}

	if (normalizedClip === 'gfx/l3d-syn') {
		const mapped: GraphicObjectAttributes = { ...templateAttributes }
		if (mapped.name === undefined && mapped.headline !== undefined) {
			mapped.name = mapped.headline
		}
		if (mapped.title === undefined && mapped.subline !== undefined) {
			mapped.title = mapped.subline
		}
		// Rundown Editor field is `role`; l3d-syn.html binds the second line from `title`.
		if (mapped.title === undefined && mapped.role !== undefined) {
			mapped.title = mapped.role
		}
		delete mapped.headline
		delete mapped.subline
		delete mapped.role
		return mapped
	}

	if (normalizedClip === 'gfx/l3d-sjv' || normalizedClip === 'gfx/l3d-sport') {
		const mapped: GraphicObjectAttributes = { ...templateAttributes }
		if (mapped.headline === undefined && mapped.title !== undefined) {
			mapped.headline = mapped.title
		}
		if (mapped.kicker === undefined && mapped.rubrika !== undefined) {
			mapped.kicker = mapped.rubrika
		}
		if (normalizedClip === 'gfx/l3d-sport') {
			const kicker = typeof mapped.kicker === 'string' ? mapped.kicker.trim() : ''
			if (!kicker) {
				mapped.kicker = 'ŠPORT'
			}
		}
		delete mapped.title
		delete mapped.rubrika
		return mapped
	}

	if (
		(normalizedClip === 'gfx/weather' || normalizedClip === 'gfx/pocasie') &&
		typeof templateAttributes.cities === 'string'
	) {
		try {
			const parsed = JSON.parse(templateAttributes.cities) as unknown
			if (Array.isArray(parsed)) {
				const { cities: _citiesJson, ...rest } = templateAttributes
				return { ...rest, cities: parsed } as unknown as GraphicObjectAttributes
			}
		} catch {
			// leave raw string for the template bridge
		}
	}

	return templateAttributes
}

/**
 * ILU headline pieces always use prerendered alpha .mov fullscreen over bg_loop.
 * Cropped ILU + headline-fallback chrome is disabled until further notice.
 */
function useHeadlineIluPrerendered(object: GraphicObjectBase): boolean {
	return hasHeadlineIluFile(object)
}

function hasHeadlineIluFile(object: GraphicObjectBase): boolean {
	return object.clipName === 'gfx/headline' && !!object.attributes.iluFile
}

/** Crop a full-frame 16:9 clip into the HTML #ilu-slide window (cover, no squish). */
const HEADLINE_ILU_SLOT_FILL = {
	x: 0.08,
	y: 0.15,
	xScale: 0.62,
	yScale: 0.73,
}

/** Cover-crop into the ILU slot — never stretch/squish 16:9 media. */
const HEADLINE_ILU_SLOT_CROP = coverCropForFill(HEADLINE_ILU_SLOT_FILL, 'center')

/** Full-screen FILL for prerendered alpha .mov bypass. */
const HEADLINE_ILU_FULLSCREEN_FILL = {
	x: 0,
	y: 0,
	xScale: 1,
	yScale: 1,
}

/** Blind-map video under the pocasie HTML animation (fullscreen PGM). */
export const DEFAULT_POCASIE_BG_FILE = 'assets/bg_pocasie'

/** Default Caspar path for outro jingle overlay (on top of everything). */
export const DEFAULT_OUTRO_FILE = 'assets/outro'

function createHeadlineIluMediaTimelineObject(
	iluFile: string,
	mode: 'slot' | 'fullscreen',
	isAdlib?: boolean
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	const fill = mode === 'fullscreen' ? HEADLINE_ILU_FULLSCREEN_FILL : HEADLINE_ILU_SLOT_FILL
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: {
			start: 0,
		},
		// Dedicated ILU layer (115) — never ClipPlayer1 (110), so FILL does not affect the bg loop.
		layer: CasparCGLayers.CasparCGIluPlayer,
		priority: 1 + (isAdlib ? 10 : 0),
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: toCasparPlayPath(iluFile),
			mixer: {
				fill,
				...(mode === 'slot' ? { crop: HEADLINE_ILU_SLOT_CROP } : {}),
			},
		},
	})
}

function getHeadlineIluMediaObject(
	object: GraphicObjectBase,
	isAdlib?: boolean
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	const iluFile = typeof object.attributes.iluFile === 'string' ? object.attributes.iluFile : undefined
	if (!iluFile || !hasHeadlineIluFile(object)) {
		return []
	}

	const mode = useHeadlineIluPrerendered(object) ? 'fullscreen' : 'slot'
	return [createHeadlineIluMediaTimelineObject(iluFile, mode, isAdlib)]
}

function createDoubleboxIluMediaTimelineObject(
	iluFile: string,
	isAdlib?: boolean
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: {
			start: 0,
		},
		layer: CasparCGLayers.CasparCGPgmIluPlayer,
		priority: 1 + (isAdlib ? 10 : 0),
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: toCasparPlayPath(iluFile),
			mixer: {
				crop: { ...PGM_DOUBLEBOX_ILU_CROP },
				fill: { ...PGM_DOUBLEBOX_ILU_FILL },
			},
		},
	})
}

function getDoubleboxIluMediaObject(
	object: GraphicObjectBase,
	isAdlib?: boolean
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	const iluFile = typeof object.attributes.iluFile === 'string' ? object.attributes.iluFile : undefined
	if (!iluFile || !isDoubleboxIlu(object)) {
		return []
	}
	return [createDoubleboxIluMediaTimelineObject(iluFile, isAdlib)]
}

/** PGM L3D HTML templates — LED allow-list is headline ILU + bg_loop only. */
const PGM_L3D_CLIP_NAMES = new Set([
	'gfx/l3d-headline',
	'gfx/l3d-tema',
	'gfx/l3d-syn',
	'gfx/l3d-mod',
	'gfx/l3d-predstavovak',
	'gfx/l3d-sjv',
	'gfx/l3d-sport',
	'gfx/l3d-odporucanie',
	'gfx/source',
])

function isPgmL3dGraphic(object: GraphicObjectBase): boolean {
	return PGM_L3D_CLIP_NAMES.has(normalizeGraphicClipName(object.clipName))
}

function getGraphicSourceLayer(object: GraphicObjectBase): SourceLayer {
	if (isDoubleboxIlu(object)) {
		// Media-only piece (no HTML); keep off the exclusive pgm group used by Camera/VT.
		return SourceLayer.LowerThird
	} else if (object.clipName.match(/logo-bug/i)) {
		return SourceLayer.Logo
	} else if (isPocasieGraphic(object) || object.clipName.match(/fullscreen/i)) {
		return SourceLayer.GFX
	} else if (isPgmL3dGraphic(object)) {
		// Separate Sofie source layer from LED headline ILU — otherwise processAndPrune
		// keeps only one WithinPart piece on LowerThird at start=0 (H3 dropped ILU PLAY).
		return SourceLayer.PgmLowerThird
	} else {
		return SourceLayer.LowerThird
	}
}
function getGraphicTlLayer(object: GraphicObjectBase): CasparCGLayers {
	if (object.clipName.match(/logo-bug/i)) {
		return CasparCGLayers.CasparCGGraphicsLogo
	} else if (isPocasieGraphic(object) || object.clipName.match(/fullscreen/i)) {
		// Fullscreen story GFX on PGM clip player — never displace LED bg loop.
		return CasparCGLayers.CasparCGClipPlayer2
	} else if (isPgmL3dGraphic(object)) {
		// PGM L3D chrome (channel 2). LED allow-list: headlines ILU + bg_loop only.
		return CasparCGLayers.CasparCGGraphicsPgmLowerThird
	} else {
		return CasparCGLayers.CasparCGGraphicsLowerThird
	}
}

function getGraphicTlObject(
	config: StudioConfig,
	object: GraphicObjectBase,
	isAdlib?: boolean
): TimelineBlueprintExt[] {
	// DoubleBox story ILU: MEDIA only on PGM 115 — never headline-fallback chrome.
	if (isDoubleboxIlu(object)) {
		return getDoubleboxIluMediaObject(object, isAdlib)
	}

	// Počasie: blind-map video on PGM clip player + HTML gfx/pocasie overlay.
	if (isPocasieGraphic(object)) {
		const fullscreenAtemInput = getClipPlayerInput(config)
		const templateName = resolveCasparTemplateName('gfx/pocasie')
		const templateData = getTemplateAttributes(templateName, object.attributes)
		return [
			literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
				id: '',
				enable: { start: 0 },
				layer: CasparCGLayers.CasparCGClipPlayer2,
				priority: 0 + (isAdlib ? 10 : 0),
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.MEDIA,
					file: toCasparPlayPath(DEFAULT_POCASIE_BG_FILE),
				},
			}),
			literal<TimelineBlueprintExt<TSR.TimelineContentCCGTemplate>>({
				id: '',
				enable: { start: 0 },
				layer: CasparCGLayers.CasparCGGraphicsPgmLowerThird,
				priority: 1 + (isAdlib ? 10 : 0),
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.TEMPLATE,
					templateType: 'html',
					name: templateName,
					data: { ...templateData },
					useStopCommand: false,
				},
			}),
			...createVisionMixerObjects(config, fullscreenAtemInput?.input || 0, config.casparcgLatency),
		]
	}

	const hasIlu = hasHeadlineIluFile(object)
	// Prerendered ILU: alpha .mov fullscreen on LED ILU layer — no HTML chrome.
	const headlineIluMediaObject = getHeadlineIluMediaObject(object, isAdlib)

	if (hasIlu) {
		return headlineIluMediaObject
	}

	const clipName = resolveCasparTemplateName(object.clipName)
	const fullscreenAtemInput = getClipPlayerInput(config)
	const isFullscreen = isFullscreenGraphic(clipName)

	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentCCGTemplate>>({
			id: '',
			enable: {
				start: 0, // piece.enable carries objectTime/duration
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
		...(isFullscreen ? createVisionMixerObjects(config, fullscreenAtemInput?.input || 0, config.casparcgLatency) : []),
	]
}
function isHeadlineWithIlu(object: GraphicObjectBase): boolean {
	return hasHeadlineIluFile(object)
}

function getIluExpectedPackages(context: ICommonContext | undefined, object: GraphicObjectBase) {
	if (!context) {
		return undefined
	}

	if (isDoubleboxIlu(object)) {
		return [
			createMediaFileExpectedPackage(context, object.attributes.iluFile as string, [
				CasparCGLayers.CasparCGPgmIluPlayer,
			]),
		]
	}

	if (isPocasieGraphic(object)) {
		return [createMediaFileExpectedPackage(context, DEFAULT_POCASIE_BG_FILE, [CasparCGLayers.CasparCGClipPlayer2])]
	}

	if (!isHeadlineWithIlu(object)) {
		return undefined
	}

	return [
		createMediaFileExpectedPackage(context, object.attributes.iluFile as string, [CasparCGLayers.CasparCGIluPlayer]),
	]
}

function getGraphicTemplateData(object: GraphicObjectBase): GraphicObjectAttributes {
	if (isDoubleboxIlu(object)) {
		return getTemplateAttributes(object.clipName, object.attributes, { omitIluFile: true })
	}

	if (isPocasieGraphic(object)) {
		return getTemplateAttributes(resolveCasparTemplateName('gfx/pocasie'), object.attributes)
	}

	if (hasHeadlineIluFile(object)) {
		return getTemplateAttributes(object.clipName, object.attributes, { omitIluFile: true })
	}

	return getTemplateAttributes(resolveCasparTemplateName(object.clipName), object.attributes)
}

function parseGraphic(
	config: StudioConfig,
	object: GraphicObject | SteppedGraphicObject,
	context?: ICommonContext
): IBlueprintPiece {
	const sourceLayer = getGraphicSourceLayer(object)
	const lifespan = getGraphicLifespan(sourceLayer, object)
	const templateData = getGraphicTemplateData(object)

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
			templateData,
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
	const isFullscreen = isFullscreenGraphic(object.clipName) || useHeadlineIluPrerendered(object)
	const templateData = getGraphicTemplateData(object)

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

			templateData,
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
