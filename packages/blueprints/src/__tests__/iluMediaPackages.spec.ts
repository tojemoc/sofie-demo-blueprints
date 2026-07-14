import { ExpectedPackage, ICommonContext, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { PartType } from '../base/showstyle/definitions/index.js'
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { applyConfig } from '../base/studio/applyConfig/index.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import {
	CASPARCG_PACKAGE_CONTAINER_ID,
	getMediaPackagesConfig,
	getSpravyClipPath,
	INGEST_PACKAGE_CONTAINER_ID,
	isSpravyClipPath,
	toCasparPlayPath,
} from '../base/showstyle/helpers/mediaPackages.js'
import {
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

const hybridCasparConfig: StudioConfig = {
	previewRenderer: '',
	casparcgLatency: 50,
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

describe('spravy media paths', () => {
	it('builds per-rundown clip paths', () => {
		expect(getSpravyClipPath('my-rundown', 'foo.mp4')).toBe('spravy/my-rundown/clips/foo.mp4')
		expect(getSpravyClipPath('my-rundown', 'nested/foo.mp4')).toBe('spravy/my-rundown/clips/foo.mp4')
	})

	it('recognises spravy clip paths', () => {
		expect(isSpravyClipPath('spravy/rundown-1/clips/foo.mp4')).toBe(true)
		expect(isSpravyClipPath('assets/foo.mp4')).toBe(false)
	})

	it('strips extensions for Caspar PLAY paths', () => {
		expect(toCasparPlayPath('spravy/rundown-1/clips/foo.mp4')).toBe('spravy/rundown-1/clips/foo')
	})
})

describe('gfx/headline ILU expectedPackages', () => {
	const context: ICommonContext = {
		getHashId: (origin) => `hash_${origin}`,
		unhashId: (hash) => hash,
		logDebug: () => undefined,
		logInfo: () => undefined,
		logWarning: () => undefined,
		logError: () => undefined,
	}

	it('emits a MEDIA_FILE expected package when iluFile is set', () => {
		const iluFile = 'spravy/rundown-1/clips/foo.mp4'

		const result = parseGraphicsFromObjects(
			hybridCasparConfig,
			[
				{
					id: 'headline1',
					objectType: ObjectType.Graphic,
					clipName: 'gfx/headline',
					objectTime: 0,
					duration: 5000,
					isAdlib: false,
					attributes: {
						iluFile,
						source: 'Reuters',
					},
				},
			],
			context
		)

		const piece = result.pieces[0]
		expect(piece?.expectedPackages).toHaveLength(1)

		const expectedPackage = piece?.expectedPackages?.[0]
		expect(expectedPackage?.type).toBe(ExpectedPackage.PackageType.MEDIA_FILE)
		expect(expectedPackage?.content).toEqual({ filePath: iluFile })
		expect(expectedPackage?.layers).toEqual([CasparCGLayers.CasparCGClipPlayer1])
		expect(expectedPackage?.sources).toEqual([
			{
				containerId: INGEST_PACKAGE_CONTAINER_ID,
				accessors: {
					ingest0: {
						filePath: iluFile,
					},
				},
			},
		])
	})

	it('does not emit expectedPackages without iluFile', () => {
		const result = parseGraphicsFromObjects(
			hybridCasparConfig,
			[
				{
					id: 'headline1',
					objectType: ObjectType.Graphic,
					clipName: 'gfx/headline',
					objectTime: 0,
					duration: 5000,
					isAdlib: false,
					attributes: {
						source: 'Reuters',
					},
				},
			],
			context
		)

		expect(result.pieces[0]?.expectedPackages).toBeUndefined()
	})

	it('does not emit expectedPackages when context is missing', () => {
		const result = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'headline1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/headline',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					iluFile: 'spravy/rundown-1/clips/foo.mp4',
				},
			},
		])

		expect(result.pieces[0]?.expectedPackages).toBeUndefined()
	})

	it('emits a Caspar MEDIA timeline object for iluFile on the clip player layer', () => {
		const iluFile = 'spravy/rundown-1/clips/foo.mp4'

		const result = parseGraphicsFromObjects(
			hybridCasparConfig,
			[
				{
					id: 'headline1',
					objectType: ObjectType.Graphic,
					clipName: 'gfx/headline',
					objectTime: 0,
					duration: 5000,
					isAdlib: false,
					attributes: {
						iluFile,
						source: 'Reuters',
					},
				},
			],
			context
		)

		const piece = result.pieces[0]
		expect(piece?.content.timelineObjects).toHaveLength(2)

		const media = piece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGClipPlayer1)
		expect(media?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'spravy/rundown-1/clips/foo',
			mixer: {
				fill: { x: 0.08, y: 0.15, xScale: 0.62, yScale: 0.73 },
			},
		})

		const template = piece?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGGraphicsLowerThird
		)
		expect(template?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.TEMPLATE,
			name: 'gfx/headline',
		})
		expect((template?.content as TSR.TimelineContentCCGTemplate).data).toEqual({
			source: 'Reuters',
		})
		expect(piece?.expectedPackages?.[0]?.layers).toEqual([CasparCGLayers.CasparCGClipPlayer1])
	})

	it('emits a Caspar MEDIA timeline object when iluFallback is enabled', () => {
		const iluFile = 'spravy/rundown-1/clips/foo.mp4'

		const result = parseGraphicsFromObjects(
			hybridCasparConfig,
			[
				{
					id: 'headline1',
					objectType: ObjectType.Graphic,
					clipName: 'gfx/headline',
					objectTime: 0,
					duration: 5000,
					isAdlib: false,
					attributes: {
						iluFile,
						iluFallback: true,
						source: 'Reuters',
					},
				},
			],
			context
		)

		const piece = result.pieces[0]
		expect(piece?.content.timelineObjects).toHaveLength(2)

		const template = piece?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGGraphicsLowerThird
		)
		expect(template?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.TEMPLATE,
			name: 'gfx/headline-fallback',
		})

		const media = piece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGClipPlayer1)
		expect(media?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'spravy/rundown-1/clips/foo',
			mixer: {
				fill: { x: 0.08, y: 0.15, xScale: 0.62, yScale: 0.73 },
			},
		})
		expect(piece?.expectedPackages?.[0]?.layers).toEqual([CasparCGLayers.CasparCGClipPlayer1])
	})

	it('omits source from template data when sourceEnabled is false or source is empty', () => {
		const resultDisabled = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'headline1',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/headline',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					text: 'Hello',
					sourceEnabled: false,
					source: 'Reuters',
				},
			},
		])

		const templateDisabled = resultDisabled.pieces[0]?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGGraphicsLowerThird
		)
		expect((templateDisabled?.content as TSR.TimelineContentCCGTemplate).data).toEqual({
			text: 'Hello',
		})

		const resultEmpty = parseGraphicsFromObjects(hybridCasparConfig, [
			{
				id: 'headline2',
				objectType: ObjectType.Graphic,
				clipName: 'gfx/headline',
				objectTime: 0,
				duration: 5000,
				isAdlib: false,
				attributes: {
					text: 'Hello',
					sourceEnabled: true,
					source: '   ',
				},
			},
		])

		const templateEmpty = resultEmpty.pieces[0]?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGGraphicsLowerThird
		)
		expect((templateEmpty?.content as TSR.TimelineContentCCGTemplate).data).toEqual({
			text: 'Hello',
		})
	})
})

describe('applyConfig package containers', () => {
	it('uses sofie-demo-media paths by default', () => {
		const defaults = getMediaPackagesConfig(hybridCasparConfig)

		expect(defaults.casparcgMediaFolder).toBe('c:/casparcg/sofie-demo-media')
		expect(defaults.ingestMediaFolder).toBe('c:/casparcg/sofie-demo-media-ingest')
	})

	it('generates config-driven ingest and caspar containers for copy workflow', () => {
		const config: StudioConfig = {
			...hybridCasparConfig,
			mediaPackages: {
				casparcgMediaFolder: 'd:/playout/media',
				ingestMediaFolder: 'd:/playout/ingest',
				httpProxyBaseUrl: 'http://pm.example/package',
			},
		}

		const result = applyConfig({} as never, config, {} as never)
		const containers = result.packageContainers

		expect(containers?.[INGEST_PACKAGE_CONTAINER_ID]?.container.accessors.ingest0).toMatchObject({
			allowWrite: true,
			folderPath: 'd:/playout/ingest',
		})
		expect(containers?.[CASPARCG_PACKAGE_CONTAINER_ID]?.container.accessors.casparcg0).toMatchObject({
			allowWrite: true,
			folderPath: 'd:/playout/media',
		})
		expect(containers?.httpProxy0?.container.accessors.http0).toMatchObject({
			baseUrl: 'http://pm.example/package',
		})
	})
})

describe('spravy-v3-smoke expectedPackages', () => {
	const exportData = loadSmokeRundownExport()

	it('emits ILU expectedPackages for all three headline clips', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-headlines'))
		const segmentContext = mockSegmentContext()

		const iluPaths = segment.parts.flatMap((part) => {
			const partContext = new PartContext(segmentContext, part.payload.externalId)
			const result = generateCameraPart(partContext, part as never)
			return result.pieces.flatMap(
				(piece) =>
					piece.expectedPackages?.map((pkg) => ('filePath' in pkg.content ? pkg.content.filePath : undefined)) ?? []
			)
		})

		expect(iluPaths).toEqual([
			'spravy/spravy-v3-smoke/clips/headline1.mp4',
			'spravy/spravy-v3-smoke/clips/headline2.mp4',
			'spravy/spravy-v3-smoke/clips/headline3.mp4',
		])
	})

	it('emits expectedPackages for syn-sot and vo-package video pieces', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-story'))
		const segmentContext = mockSegmentContext()

		const voParts = segment.parts.filter((part) => part.type === PartType.VO)
		const mediaPaths = voParts.flatMap((part) => {
			const partContext = new PartContext(segmentContext, part.payload.externalId)
			const result = generateVOPart(partContext, part as never)
			return result.pieces.flatMap(
				(piece) =>
					piece.expectedPackages?.map((pkg) => ('filePath' in pkg.content ? pkg.content.filePath : undefined)) ?? []
			)
		})

		expect(mediaPaths).toEqual([
			'spravy/spravy-v3-smoke/clips/syn-sot.mp4',
			'spravy/spravy-v3-smoke/clips/vo-package.mp4',
		])
	})
})
