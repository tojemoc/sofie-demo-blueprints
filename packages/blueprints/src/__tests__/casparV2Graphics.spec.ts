import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { ObjectType } from '../common/definitions/objects.js'
import { SourceType, StudioConfig, VisionMixerDevice, PlayoutRouting } from '../base/studio/helpers/config.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { getBaseline } from '../base/showstyle/rundown/baseline.js'

const hybridCasparConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 50,
	playoutRouting: PlayoutRouting.Hybrid,
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
	vmixAutomationMacros: {},
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
	it('routes gfx/l3d-tema to lower-third Caspar layer with headline data', () => {
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
		expect(piece?.sourceLayerId).toBe(SourceLayer.LowerThird)
		expect(piece?.lifespan).toBe(PieceLifespan.WithinPart)

		const caspar = piece?.content.timelineObjects?.find(
			(obj): obj is typeof obj & { content: TSR.TimelineContentCCGTemplate } =>
				obj.content.deviceType === TSR.DeviceType.CASPARCG &&
				'type' in obj.content &&
				obj.content.type === TSR.TimelineContentTypeCasparCg.TEMPLATE
		)

		expect(caspar?.layer).toBe(CasparCGLayers.CasparCGGraphicsLowerThird)
		expect(caspar?.content.name).toBe('gfx/l3d-tema')
		expect(caspar?.content.data).toEqual({ headline: 'R. Fico o M. Ficovi' })
		expect(piece?.content).toMatchObject({
			templateData: { headline: 'R. Fico o M. Ficovi' },
		})
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
				attributes: { name: 'Moderátor' },
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
				attributes: { title: 'Správy', subtitle: '18:00' },
			},
		]).pieces[0]

		const modCaspar = mod?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
		const headCaspar = headline?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate

		expect(modCaspar.data).toEqual({ name: 'Moderátor' })
		expect(headCaspar.data).toEqual({ title: 'Správy', subtitle: '18:00' })
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

	it('starts persistent gfx/logo-bug in rundown baseline', () => {
		const baseline = getBaseline(mockRundownContext())
		const logo = baseline.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGGraphicsLogo)

		expect(logo?.enable).toEqual({ while: 1 })
		expect((logo?.content as TSR.TimelineContentCCGTemplate).name).toBe('gfx/logo-bug')
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
})
