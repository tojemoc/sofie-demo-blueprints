import { ExpectedPackage, ICommonContext } from '@sofie-automation/blueprints-integration'
import { changeExtension, literal } from '../../../common/util.js'
import { MediaPackagesConfig, StudioConfig } from '../../studio/helpers/config.js'

/** Package container id for the ingest/staging folder (source for copy workflow). */
export const INGEST_PACKAGE_CONTAINER_ID = 'ingest0'

/** Package container id for the CasparCG playout media folder (copy target). */
export const CASPARCG_PACKAGE_CONTAINER_ID = 'casparcg0'

/** Package container id for the HTTP proxy used by preview/thumbnail side effects. */
export const HTTP_PROXY_PACKAGE_CONTAINER_ID = 'httpProxy0'

/**
 * SPRÁVY per-rundown media path convention on CasparCG:
 *   spravy/<rundownExternalId>/clips/<file>.mp4
 *
 * VT `fileName` and gfx/headline `iluFile` should use this layout so Package Manager
 * can stage files under the ingest folder and copy them into the CasparCG media tree.
 */
export const SPRAVY_CLIPS_PATH_PATTERN = /^spravy\/[^/]+\/clips\/.+/

export function isSpravyClipPath(filePath: string): boolean {
	return SPRAVY_CLIPS_PATH_PATTERN.test(filePath)
}

export function getSpravyClipPath(rundownExternalId: string, fileName: string): string {
	const basename = fileName.replace(/^.*[/\\]/, '')
	return `spravy/${rundownExternalId}/clips/${basename}`
}

export function getMediaPackagesConfig(config: StudioConfig): Required<MediaPackagesConfig> {
	return {
		casparcgMediaFolder: config.mediaPackages?.casparcgMediaFolder ?? 'c:/casparcg/sofie-demo-media',
		ingestMediaFolder: config.mediaPackages?.ingestMediaFolder ?? 'c:/casparcg/sofie-demo-media-ingest',
		httpProxyBaseUrl: config.mediaPackages?.httpProxyBaseUrl ?? 'http://localhost:8080/package',
	}
}

export function createIngestMediaFileSource(filePath: string): ExpectedPackage.ExpectedPackageMediaFile['sources'] {
	return [
		{
			containerId: INGEST_PACKAGE_CONTAINER_ID,
			accessors: {
				ingest0: {
					filePath,
				},
			},
		},
	]
}

export function createMediaFileExpectedPackage(
	context: ICommonContext,
	filePath: string,
	layers: string[],
	options?: { includeSideEffects?: boolean }
): ExpectedPackage.ExpectedPackageMediaFile {
	const includeSideEffects = options?.includeSideEffects !== false

	return literal<ExpectedPackage.ExpectedPackageMediaFile>({
		_id: context.getHashId(filePath, true),
		layers,
		type: ExpectedPackage.PackageType.MEDIA_FILE,
		content: {
			filePath,
		},
		version: {},
		contentVersionHash: '',
		sources: createIngestMediaFileSource(filePath),
		sideEffect: includeSideEffects
			? {
					previewPackageSettings: {
						path: `previews/${changeExtension(filePath, 'webm')}`,
					},
					thumbnailPackageSettings: {
						path: `thumbnails/${changeExtension(filePath, 'jpg')}`,
						seekTime: 0,
					},
				}
			: {},
	})
}
