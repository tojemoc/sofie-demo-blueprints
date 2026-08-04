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

describe('demo media paths', () => {
	it('builds flat clips/ paths (rundown id ignored)', () => {
		expect(getSpravyClipPath('my-rundown', 'foo.mp4')).toBe('clips/foo.mp4')
		expect(getSpravyClipPath('my-rundown', 'nested/foo.mp4')).toBe('clips/foo.mp4')
	})

	it('recognises flat demo media paths', () => {
		expect(isSpravyClipPath('clips/foo.mp4')).toBe(true)
		expect(isSpravyClipPath('loops/360_loop.mp4')).toBe(true)
		expect(isSpravyClipPath('wipes/360_wipe.mov')).toBe(true)
		expect(isSpravyClipPath('assets/foo.mp4')).toBe(true)
		expect(isSpravyClipPath('nested/too/deep.mp4')).toBe(false)
		expect(isSpravyClipPath('spravy/rundown-1/clips/foo.mp4')).toBe(true) // legacy
	})

	it('strips extensions for Caspar PLAY paths', () => {
		expect(toCasparPlayPath('clips/foo.mp4')).toBe('clips/foo')
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
		const iluFile = 'clips/foo.mp4'

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
		expect(expectedPackage?.layers).toEqual([CasparCGLayers.CasparCGIluPlayer])
		expect(expectedPackage?.sources).toEqual([
			{
				containerId: INGEST_PACKAGE_CONTAINER_ID,
				accessors: {
					ingest0: {
						type: 'local_folder',
						filePath: iluFile,
					},
				},
			},
		])
		expect(expectedPackage?.sideEffect).toMatchObject({
			previewContainerId: 'httpProxy0',
			thumbnailContainerId: 'httpProxy0',
		})
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
					iluFile: 'clips/foo.mp4',
				},
			},
		])

		expect(result.pieces[0]?.expectedPackages).toBeUndefined()
	})

	it('crops full-frame ILU mp4 into the slot FILL when prerendered/bypass is OFF', () => {
		const iluFile = 'clips/foo.mp4'

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

		const media = piece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGIluPlayer)
		expect(media?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'clips/foo',
			mixer: {
				fill: { x: 0.08, y: 0.15, xScale: 0.62, yScale: 0.73 },
				crop: {
					left: expect.any(Number),
					top: 0,
					right: expect.any(Number),
					bottom: 0,
				},
			},
		})
		const crop = (media?.content as TSR.TimelineContentCCGMedia).mixer?.crop as {
			left: number
			right: number
		}
		expect(crop.left).toBeCloseTo(crop.right, 5)
		expect(crop.left).toBeGreaterThan(0.2)
		expect(crop.left).toBeLessThan(0.3)

		const template = piece?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGGraphicsLowerThird
		)
		expect(template?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.TEMPLATE,
			name: 'gfx/headline-fallback',
		})
		expect((template?.content as TSR.TimelineContentCCGTemplate).data).toEqual({
			source: 'Reuters',
		})
		expect(piece?.expectedPackages?.[0]?.layers).toEqual([CasparCGLayers.CasparCGIluPlayer])
	})

	it('plays prerendered alpha ILU fullscreen (FILL 0 0 1 1) and skips HTML chrome', () => {
		const iluFile = 'clips/foo.mov'

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
						iluPrerendered: true,
						source: 'Reuters',
					},
				},
			],
			context
		)

		const piece = result.pieces[0]
		expect(piece?.content.timelineObjects).toHaveLength(1)

		const template = piece?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGGraphicsLowerThird
		)
		expect(template).toBeUndefined()

		const media = piece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGIluPlayer)
		expect(media?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'clips/foo',
			mixer: {
				fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
			},
		})
		expect(piece?.expectedPackages?.[0]?.layers).toEqual([CasparCGLayers.CasparCGIluPlayer])
	})

	it('treats legacy iluFallback as prerendered/bypass ON', () => {
		const iluFile = 'clips/foo.mov'

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
					},
				},
			],
			context
		)

		const piece = result.pieces[0]
		expect(piece?.content.timelineObjects).toHaveLength(1)
		const media = piece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGIluPlayer)
		expect(media?.content).toMatchObject({
			mixer: {
				fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
			},
		})
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
		expect(defaults.ingestMediaFolder).toBe('c:/casparcg/sofie-demo-media')
	})

	it('normalizes Windows backslashes to forward slashes', () => {
		const config: StudioConfig = {
			...hybridCasparConfig,
			casparcgMediaFolder: 'c:\\casparcg\\sofie-demo-media',
			ingestMediaFolder: 'c:\\casparcg\\sofie-demo-media',
		}

		expect(getMediaPackagesConfig(config)).toMatchObject({
			casparcgMediaFolder: 'c:/casparcg/sofie-demo-media',
			ingestMediaFolder: 'c:/casparcg/sofie-demo-media',
		})
	})

	it('reads legacy nested mediaPackages when flat fields are absent', () => {
		const { casparcgMediaFolder: _c, ingestMediaFolder: _i, httpProxyBaseUrl: _h, ...withoutFlat } = hybridCasparConfig
		const config = {
			...withoutFlat,
			mediaPackages: {
				casparcgMediaFolder: 'e:/legacy/media',
				ingestMediaFolder: 'e:/legacy/ingest',
				httpProxyBaseUrl: 'http://legacy/package',
			},
		} as unknown as StudioConfig

		expect(getMediaPackagesConfig(config)).toEqual({
			casparcgMediaFolder: 'e:/legacy/media',
			ingestMediaFolder: 'e:/legacy/ingest',
			httpProxyBaseUrl: 'http://legacy/package',
		})
	})

	it('generates config-driven ingest and caspar containers for copy workflow', () => {
		const config: StudioConfig = {
			...hybridCasparConfig,
			casparcgMediaFolder: 'd:/playout/media',
			ingestMediaFolder: 'd:/playout/ingest',
			httpProxyBaseUrl: 'http://pm.example/package',
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

		const mediaPaths = segment.parts
			.filter((part) => part.type === PartType.Camera)
			.flatMap((part) => {
				const partContext = new PartContext(segmentContext, part.payload.externalId)
				const result = generateCameraPart(partContext, part as never)
				return result.pieces.flatMap(
					(piece) =>
						piece.expectedPackages?.map((pkg) => ('filePath' in pkg.content ? pkg.content.filePath : undefined)) ?? []
				)
			})
			.filter((path): path is string => typeof path === 'string')

		// Headlines carry ILU media only (no wipe pieces on HEADLINE parts in smoke).
		expect(mediaPaths.filter((path) => path.includes('/headline'))).toEqual([
			'clips/headline1.mp4',
			'clips/headline2.mp4',
			'clips/headline3.mp4',
		])
		expect(mediaPaths.filter((path) => path.includes('wipes/'))).toEqual([])
	})

	it('emits expectedPackages for SYN video pieces in tema-1', () => {
		const segment = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, 'seg-tema-1'))
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
		const synPaths = mediaPaths.filter((path): path is string => typeof path === 'string' && path.includes('/syn-'))

		expect(synPaths.length).toBeGreaterThanOrEqual(2)
		expect(synPaths.every((path) => path.includes('/syn-'))).toBe(true)
		// Story-block wipes share the VO part and also emit expectedPackages.
		expect(mediaPaths.some((path) => typeof path === 'string' && path.includes('wipes/'))).toBe(true)
	})
})
