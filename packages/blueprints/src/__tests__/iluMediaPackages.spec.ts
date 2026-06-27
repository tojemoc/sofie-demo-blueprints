import { ExpectedPackage, ICommonContext } from '@sofie-automation/blueprints-integration'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
} from '../base/showstyle/helpers/mediaPackages.js'

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
		expect(expectedPackage?.layers).toEqual([CasparCGLayers.CasparCGGraphicsLowerThird])
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

type SmokeRundownExport = {
	segments: Array<{ id: string; name: string; payload?: { type?: string } }>
	parts: Array<{
		id: string
		name: string
		segmentId: string
		payload: { type: string; duration?: number; script?: string }
		duration?: number
		script?: string
	}>
	pieces: Array<{
		id: string
		partId: string
		pieceType: string
		start?: number
		duration?: number
		payload: Record<string, string | number>
	}>
}

function smokeExportToIngestSegment(
	exportData: SmokeRundownExport,
	segmentId: string
): Parameters<typeof convertIngestData>[1] {
	const segment = exportData.segments.find((s) => s.id === segmentId)
	if (!segment) throw new Error(`Missing segment ${segmentId}`)

	const parts = exportData.parts
		.filter((part) => part.segmentId === segmentId)
		.map((part) => ({
			externalId: part.id,
			name: part.name,
			payload: {
				segmentId,
				externalId: part.id,
				rank: 0,
				name: part.name,
				type: part.payload.type,
				float: false,
				script: part.script ?? part.payload.script ?? '',
				duration: part.duration ?? part.payload.duration ?? 0,
				pieces: exportData.pieces
					.filter((piece) => piece.partId === part.id)
					.map((piece) => ({
						id: piece.id,
						objectType: piece.pieceType,
						...(piece.start !== undefined ? { objectTime: piece.start } : {}),
						duration: piece.duration ?? 0,
						clipName: '',
						attributes: piece.payload,
					})),
			},
		}))

	return {
		externalId: segment.id,
		name: segment.name,
		payload: {
			rundownId: 'smoke',
			externalId: segment.id,
			rank: 0,
			name: segment.name,
			float: false,
			type: segment.payload?.type ?? 'normal',
		},
		parts,
	} as Parameters<typeof convertIngestData>[1]
}

const mockIngestContext = {
	logError: () => undefined,
	logWarning: () => undefined,
} as never

function mockSegmentContext() {
	return {
		getStudioConfig: () => ({ studio: hybridCasparConfig }),
		getShowStyleConfig: () => ({ dvePresets: {} }),
		getStudioMappings: () => ({}),
		getShowStyleSourceLayers: () => ({}),
		getShowStyleOutputLayers: () => ({}),
		getPackageInfo: () => [],
		hackGetMediaObjectDuration: async () => undefined,
		rundownId: 'spravy-v3-smoke',
		studioId: 'studio0',
		playlistId: 'playlist0',
		rundown: { _id: 'spravy-v3-smoke' },
		logDebug: () => undefined,
		logInfo: () => undefined,
		logWarning: () => undefined,
		logError: () => undefined,
		notifyUserError: () => undefined,
		notifyUserWarning: () => undefined,
		notifyUserInfo: () => undefined,
		getHashId: (origin: string) => `hash_${origin}`,
		unhashId: (hash: string) => hash,
	} as never
}

describe('spravy-v3-smoke expectedPackages', () => {
	const exportData: SmokeRundownExport = JSON.parse(
		readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../../../assets/spravy-v3-smoke-rundown.json'),
			'utf8'
		)
	)

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
