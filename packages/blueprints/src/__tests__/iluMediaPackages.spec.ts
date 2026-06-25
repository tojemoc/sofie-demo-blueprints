import { ExpectedPackage, ICommonContext } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { ObjectType } from '../common/definitions/objects.js'
import { applyConfig } from '../base/studio/applyConfig/index.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import {
	CASPARCG_PACKAGE_CONTAINER_ID,
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
