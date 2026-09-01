import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { ObjectType } from '../common/definitions/objects.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { getBaseline } from '../base/showstyle/rundown/baseline.js'

const hybridCasparConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 50,
	casparcgMediaFolder: 'c:/casparcg/sofie-demo-media',
	ingestMediaFolder: 'c:/casparcg/sofie-demo-media',
	httpProxyBaseUrl: 'http://localhost:8080/package',
	visionMixer: {
		type: VisionMixerDevice.Atem,
		host: '127.0.0.1',
		port: 9910,
		deviceId: 'atem0',
	},
	audioMixer: {
		host: 'localhost',
		port: 1176,
		deviceId: 'sisyfos0',
	},
	casparcg: {
		host: 'localhost',
		port: 5250,
	},
	sisyfosSources: {},
	vmixSources: {},
	atemOutputs: {},
	atemSources: {
		camera1: { input: 1, type: SourceType.Camera },
	},
}

function mockRundownContext() {
	return {
		getStudioConfig: () => ({ studio: hybridCasparConfig }),
		getShowStyleConfig: () => ({ dvePresets: {} }),
		logDebug: () => undefined,
		logInfo: () => undefined,
		logWarning: () => undefined,
		logError: () => undefined,
	} as unknown as Parameters<typeof getBaseline>[0]
}

describe('casparV2Graphics', () => {
	it('routes gfx/l3d-tema to PGM lower-third with headline data', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'tema1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-tema',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					headline: 'R. Fico o M. Ficovi',
				},
			},
		])

		const piece = result.pieces[0]
		expect(piece?.sourceLayerId).toBe(SourceLayer.PgmLowerThird)
		expect(piece?.lifespan).toBe(PieceLifespan.WithinPart)

		const caspar = piece?.content.timelineObjects?.find(
			(obj): obj is typeof obj & { content: TSR.TimelineContentCCGTemplate } =>
				obj.content.deviceType === TSR.DeviceType.CASPARCG &&
				'type' in obj.content &&
				obj.content.type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)

		expect(caspar?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)
		expect(caspar?.content.name).toBe('gfx/l3d-tema')
		expect(caspar?.content.data).toEqual({ headline: 'R. Fico o M. Ficovi' })
		expect(piece?.content).toMatchObject({
			templateData: { headline: 'R. Fico o M. Ficovi' },
		})
	})

	it('maps gfx/l3d-tema title-only ingest to headline and omits title', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'tema-title',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-tema',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					title: 'R. Fico o M. Ficovi',
				},
			},
		])

		const caspar = result.pieces[0]?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.data).toEqual({ headline: 'R. Fico o M. Ficovi' })
		expect(caspar?.data).not.toHaveProperty('title')
	})

	it('prefers gfx/l3d-tema headline over title when both are set', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'tema-both',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-tema',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					headline: 'Canonical headline',
					title: 'Fallback title',
				},
			},
		])

		const caspar = result.pieces[0]?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.data).toEqual({ headline: 'Canonical headline' })
		expect(caspar?.data).not.toHaveProperty('title')
	})

	it('routes gfx/l3d-mod and gfx/l3d-headline with full attribute payloads', () => {
		const mod = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'mod1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-mod',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { name: 'Moderátor', title: 'Anchor' },
			},
		]).pieces[0]

		const headline = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'head1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-headline',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { headline: 'Breaking', subline: 'Tonight' },
			},
		]).pieces[0]

		const syn = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'syn1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-syn',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { name: 'Guest', role: 'Expert' },
			},
		]).pieces[0]

		const modCaspar = mod?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		const headCaspar = headline?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		const synCaspar = syn?.content.timelineObjects?.[0]

		expect(modCaspar.data).toEqual({ name: 'Moderátor', title: 'Anchor' })
		expect(headCaspar.data).toEqual({ title: 'Breaking', subtitle: 'Tonight' })
		expect(mod?.sourceLayerId).toBe(SourceLayer.PgmLowerThird)
		expect(headline?.sourceLayerId).toBe(SourceLayer.PgmLowerThird)
		expect(syn?.sourceLayerId).toBe(SourceLayer.PgmLowerThird)
		expect(mod?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)
		expect(headline?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)
		expect(synCaspar?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)
		expect((synCaspar?.content as TSR.TimelineContentCCGTemplate).data).toEqual({
			name: 'Guest',
			role: 'Expert',
		})
	})

	it('normalizes mixed-case L3D clipNames and drops alias fields for predstavovak', () => {
		const piece = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'pred-mixed',
				objectType: ObjectType.Graphic,
				clipName: 'GFX/L3D-Predstavovak',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { headline: 'Gabi', subline: 'moderátorka' },
			},
		]).pieces[0]

		const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.name).toBe('gfx/l3d-predstavovak')
		expect(caspar?.data).toEqual({ name: 'Gabi', title: 'moderátorka' })
		expect(caspar?.data).not.toHaveProperty('headline')
		expect(caspar?.data).not.toHaveProperty('subline')
	})

	it('defaults l3d-sport kicker to ŠPORT when missing', () => {
		const piece = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'sport1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-sport',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { headline: 'Slovan' },
			},
		]).pieces[0]

		const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.data).toEqual({ headline: 'Slovan', kicker: 'ŠPORT' })
	})

	it('routes gfx/source to PGM lower-third with source field only', () => {
		const piece = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'src1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/source',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { source: 'TASR', sourceEnabled: false },
			},
		]).pieces[0]

		expect(piece?.sourceLayerId).toBe(SourceLayer.PgmLowerThird)
		expect(piece?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)
		const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.name).toBe('gfx/source')
		expect(caspar?.data).toEqual({ source: 'TASR' })
	})

	it('routes legacy gfx/fullscreen to PGM clip player like weather HTML', () => {
		const piece = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'fs1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/fullscreen',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: { url: 'https://example.com/image.png' },
			},
		]).pieces[0]

		expect(piece?.sourceLayerId).toBe(SourceLayer.GFX)
		const template = piece?.content.timelineObjects?.find(
			(obj) =>
				obj.content.deviceType === TSR.DeviceType.CASPARCG &&
				'type' in obj.content &&
				obj.content.type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)
		expect(template?.layer).toBe(CasparCGLayers.CasparCGClipPlayer2)
		const caspar = template?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.name).toBe('gfx/fullscreen')
		expect(caspar?.useStopCommand).toBe(false)
		expect(piece?.content.timelineObjects?.some((obj) => obj.content.deviceType === TSR.DeviceType.ATEM)).toBe(true)
	})

	it('routes mixed-case gfx/l3d-syn to PGM lower-third', () => {
		const syn = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'syn-mixed',
				objectType: ObjectType.Graphic,
				clipName: 'GFX/L3D-Syn',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { name: 'Guest', role: 'Expert' },
			},
		]).pieces[0]

		expect(syn?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)
	})

	it('routes whitespace-padded L3D clipNames to PgmLowerThird', () => {
		const syn = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'syn-padded',
				objectType: ObjectType.Graphic,
				clipName: '  gfx/l3d-syn  ',
				objectTime: 0,
				duration: 3000,
				isAdlib: false,
				attributes: { name: 'Guest', role: 'Expert' },
			},
		]).pieces[0]

		expect(syn?.sourceLayerId).toBe(SourceLayer.PgmLowerThird)
		expect(syn?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)
		const caspar = syn?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.name).toBe('gfx/l3d-syn')
	})

	it('routes gfx/logo-bug to logo layer with OutOnRundownEnd lifespan', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'logo1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/logo-bug',
				objectTime: 0,
				duration: 0,
				isAdlib: false,
				attributes: {},
			},
		])

		const piece = result.pieces[0]
		expect(piece?.sourceLayerId).toBe(SourceLayer.Logo)
		expect(piece?.lifespan).toBe(PieceLifespan.OutOnRundownEnd)

		const caspar = piece?.content.timelineObjects?.[0]
		expect(caspar?.layer).toBe(CasparCGLayers.CasparCGGraphicsLogo)
		expect((caspar?.content as TSR.TimelineContentCCGTemplate).name).toBe('gfx/logo-bug')
	})

	it('loops assets/countup from rundown start on the PGM logo layer', () => {
		const baseline = getBaseline(mockRundownContext())
		const countup = baseline.timelineObjects?.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGGraphicsLogo &&
				obj.content.deviceType === TSR.DeviceType.CASPARCG &&
				'type' in obj.content &&
				obj.content.type === TSR.TimelineContentTypeCasparCg.MEDIA
		)

		expect(countup?.enable).toEqual({ while: 1 })
		expect(countup?.priority).toBe(0)
		expect(countup?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'assets/countup',
			loop: true,
		})
		expect(countup?.keyframes).toBeUndefined()
	})

	it('does not start gfx/logo-bug HTML in rundown baseline', () => {
		const baseline = getBaseline(mockRundownContext())
		const logo = baseline.timelineObjects?.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGGraphicsLogo &&
				obj.content.deviceType === TSR.DeviceType.CASPARCG &&
				'type' in obj.content &&
				obj.content.type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)

		expect(logo).toBeUndefined()
	})

	it('loops background clip on LED clip player only in rundown baseline', () => {
		const baseline = getBaseline(mockRundownContext())
		const ledLoop = baseline.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGClipPlayer1)
		const pgmLoop = baseline.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGClipPlayer2)
		const bgOnAnyPgm = baseline.timelineObjects?.filter(
			(obj) =>
				obj.content.deviceType === TSR.DeviceType.CASPARCG &&
				'file' in obj.content &&
				(obj.content as { file?: string }).file === 'loops/bg_loop' &&
				obj.layer !== CasparCGLayers.CasparCGClipPlayer1
		)

		expect(pgmLoop).toBeUndefined()
		expect(bgOnAnyPgm).toEqual([])
		expect(ledLoop?.enable).toEqual({ while: 1 })
		expect(ledLoop?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'loops/bg_loop',
			loop: true,
		})
	})

	it('excludes internal pieceName from Caspar data and templateData', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'tema1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-tema',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					headline: 'Test headline',
					pieceName: 'Topic label',
				},
			},
		])

		const piece = result.pieces[0]
		const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate

		expect(caspar.data).toEqual({ headline: 'Test headline' })
		expect(piece?.content).toMatchObject({
			templateData: { headline: 'Test headline' },
		})
	})

	it('maps l3d-odporucanie to gfx/outro Caspar template on disk', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'odp1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/l3d-odporucanie',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					headline: 'Sledujte na www.360tka.sk',
				},
			},
		])

		const caspar = result.pieces[0]?.content.timelineObjects?.[0]
		expect((caspar?.content as TSR.TimelineContentCCGTemplate).name).toBe('gfx/outro')
		expect((caspar?.content as TSR.TimelineContentCCGTemplate).data).toEqual({
			headline: 'Sledujte na www.360tka.sk',
		})
	})

	it('plays gfx/pocasie HTML over assets/bg_pocasie blind-map video', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'wx1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/pocasie',
				objectTime: 0,
				duration: 10000,
				isAdlib: false,
				attributes: {},
			},
		])

		const timeline = result.pieces[0]?.content.timelineObjects ?? []
		const bg = timeline.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGClipPlayer2 &&
				(obj.content as TSR.TimelineContentCCGMedia).type === TSR.TimelineContentTypeCasparCg.MEDIA
		)
		const html = timeline.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGGraphicsPgmLowerThird &&
				(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)

		expect((bg?.content as TSR.TimelineContentCCGMedia).file).toBe('assets/bg_pocasie')
		expect((html?.content as TSR.TimelineContentCCGTemplate).name).toBe('gfx/pocasie')
	})

	it('decodes legacy cities JSON for gfx/pocasie template data', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'wx-cities',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/pocasie',
				objectTime: 0,
				duration: 10000,
				isAdlib: false,
				attributes: {
					cities: '[{"name":"Bratislava","temp":12}]',
				},
			},
		])

		const piece = result.pieces[0]
		const caspar = piece?.content.timelineObjects?.find(
			(obj) =>
				obj.layer === CasparCGLayers.CasparCGGraphicsPgmLowerThird &&
				(obj.content as TSR.TimelineContentCCGTemplate).type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)?.content as TSR.TimelineContentCCGTemplate

		expect(caspar.data).toEqual({ cities: [{ name: 'Bratislava', temp: 12 }] })
		expect(piece?.content).toMatchObject({
			templateData: { cities: [{ name: 'Bratislava', temp: 12 }] },
		})
	})

	it('applies casparcgLatency preroll to headline ILU adlibs', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'ilu-adlib',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/headline',
				objectTime: 0,
				duration: 8000,
				isAdlib: true,
				attributes: { iluFile: 'clips/headline1.mp4' },
			},
		])

		expect(result.adLibPieces[0]?.prerollDuration).toBe(hybridCasparConfig.casparcgLatency)
	})

	it('maps Rundown Editor v2 piece types to gfx clipNames and template data', () => {
		const segment = convertIngestData(
			{
				logError: () => undefined,
				logWarning: () => undefined,
			} as never,
			{
				externalId: 'seg1',
				name: 'News',
				payload: { type: 'normal', name: 'News' },
				parts: [
					{
						externalId: 'part1',
						name: 'GFX',
						payload: {
							segmentId: 'seg1',
							externalId: 'part1',
							rank: 0,
							name: 'GFX',
							type: 'GFX',
							float: false,
							script: '',
							pieces: [
								{
									id: 'piece-tema',
									objectType: 'l3d-tema',
									objectTime: 0,
									duration: 5,
									clipName: '',
									attributes: { headline: 'Test headline' },
								},
								{
									id: 'piece-mod',
									objectType: 'l3d-mod',
									objectTime: 5,
									duration: 5,
									clipName: '',
									attributes: { name: 'Anchor' },
								},
							],
						},
					},
				],
			} as never
		)

		const gfxPart = segment.parts[0]
		const objects = gfxPart?.objects ?? []

		expect(objects[0]?.clipName).toBe('gfx/l3d-tema')
		expect(objects[0]?.attributes).toMatchObject({ headline: 'Test headline' })
		expect(objects[1]?.clipName).toBe('gfx/l3d-mod')
		expect(objects[1]?.attributes).toMatchObject({ name: 'Anchor' })
	})

	it('normalizes generic graphic template names without gfx/ prefixes', () => {
		const segment = convertIngestData(
			{
				logError: () => undefined,
				logWarning: () => undefined,
			} as never,
			{
				externalId: 'seg-generic',
				name: 'Generic GFX',
				payload: { type: 'normal', name: 'Generic GFX' },
				parts: [
					{
						externalId: 'part-generic',
						name: 'Generic GFX',
						payload: {
							segmentId: 'seg-generic',
							externalId: 'part-generic',
							rank: 0,
							name: 'Generic GFX',
							type: 'GFX',
							float: false,
							script: '',
							pieces: [
								{
									id: 'piece-predstavovak-generic',
									objectType: 'graphic',
									objectTime: 0,
									duration: 5,
									clipName: '',
									attributes: { template: 'l3d-predstavovak', headline: 'Gabi', subline: 'moderátorka' },
								},
							],
						},
					},
				],
			} as never
		)

		const object = segment.parts[0]?.objects[0]
		expect(object?.clipName).toBe('gfx/l3d-predstavovak')

		const piece = parseGraphicsFromObjects(hybridCasparConfig, segment.parts[0]?.objects ?? []).pieces[0]
		expect(piece?.sourceLayerId).toBe(SourceLayer.PgmLowerThird)
		expect(piece?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGGraphicsPgmLowerThird)

		const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		expect(caspar?.name).toBe('gfx/l3d-predstavovak')
		expect(caspar?.data).toEqual({ name: 'Gabi', title: 'moderátorka', template: 'l3d-predstavovak' })
	})
})
