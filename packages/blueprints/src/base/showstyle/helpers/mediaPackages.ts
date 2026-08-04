import { Accessor, ExpectedPackage, ICommonContext } from '@sofie-automation/blueprints-integration'
import { changeExtension, literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'

/** Resolved Package Manager folder paths used by applyConfig. */
export interface MediaPackagesConfig {
	casparcgMediaFolder: string
	ingestMediaFolder: string
	httpProxyBaseUrl: string
}

/** Package container id for the ingest/staging folder (source for copy workflow). */
export const INGEST_PACKAGE_CONTAINER_ID = 'ingest0'

/** Package container id for the CasparCG playout media folder (copy target). */
export const CASPARCG_PACKAGE_CONTAINER_ID = 'casparcg0'

/** Package container id for the HTTP proxy used by preview/thumbnail side effects. */
export const HTTP_PROXY_PACKAGE_CONTAINER_ID = 'httpProxy0'

/**
 * Demo media path convention on CasparCG / ingest root (two levels only):
 *   clips/<file>.mp4
 *   loops/<file>
 *   wipes/<file>
 *   assets/<file>
 *
 * VT `fileName` and gfx/headline `iluFile` should use this layout so Package Manager
 * can stage files under the ingest folder and copy them into the CasparCG media tree.
 */
export const DEMO_MEDIA_PATH_PATTERN = /^(clips|loops|wipes|assets)\/[^/]+$/

/** @deprecated Use DEMO_MEDIA_PATH_PATTERN — kept for older ingest payloads. */
export const SPRAVY_CLIPS_PATH_PATTERN = /^spravy\/[^/]+\/clips\/.+/

export function isDemoMediaPath(filePath: string): boolean {
	return DEMO_MEDIA_PATH_PATTERN.test(filePath)
}

/** @deprecated Prefer isDemoMediaPath. */
export function isSpravyClipPath(filePath: string): boolean {
	return isDemoMediaPath(filePath) || SPRAVY_CLIPS_PATH_PATTERN.test(filePath)
}

/** Build a flat `clips/<basename>` path (rundown id is unused — shared media tree). */
export function getDemoClipPath(_rundownExternalId: string | undefined, fileName: string): string {
	const basename = fileName.replace(/^.*[/\\]/, '')
	return `clips/${basename}`
}

/** @deprecated Prefer getDemoClipPath. */
export function getSpravyClipPath(rundownExternalId: string, fileName: string): string {
	return getDemoClipPath(rundownExternalId, fileName)
}

/** Strip container extension for Caspar PLAY / MEDIA timeline (CLS paths omit extension). */
export function toCasparPlayPath(filePath: string): string {
	return filePath.replace(/\.(mp4|mov|mxf|mkv|webm)$/i, '')
}

export function normalizeLocalFolderPath(folderPath: string): string {
	// Sofie studio config is JSON — backslashes are treated as escapes in the UI and
	// often get mangled/dropped on save. Normalize to forward slashes (valid on Windows).
	return folderPath.trim().replace(/\\/g, '/')
}

type LegacyMediaPackages = {
	casparcgMediaFolder?: string
	ingestMediaFolder?: string
	httpProxyBaseUrl?: string
}

/**
 * Resolve Package Manager folder paths from studio config.
 * Prefers flat top-level fields (Sofie UI persists these reliably); falls back to the
 * legacy nested `mediaPackages` object if still present in an older studio config.
 */
export function getMediaPackagesConfig(config: StudioConfig): MediaPackagesConfig {
	const legacy = (config as StudioConfig & { mediaPackages?: LegacyMediaPackages }).mediaPackages

	const casparcgMediaFolder = normalizeLocalFolderPath(
		config.casparcgMediaFolder ?? legacy?.casparcgMediaFolder ?? 'c:/casparcg/sofie-demo-media'
	)
	const ingestMediaFolder = normalizeLocalFolderPath(
		config.ingestMediaFolder ?? legacy?.ingestMediaFolder ?? casparcgMediaFolder
	)

	return {
		casparcgMediaFolder,
		ingestMediaFolder,
		httpProxyBaseUrl: (config.httpProxyBaseUrl ?? legacy?.httpProxyBaseUrl ?? 'http://localhost:8080/package').trim(),
	}
}

export function createIngestMediaFileSource(filePath: string): ExpectedPackage.ExpectedPackageMediaFile['sources'] {
	return [
		{
			containerId: INGEST_PACKAGE_CONTAINER_ID,
			accessors: {
				// `type` must match the studio packageContainer accessor so Package Manager can
				// deep-merge (otherwise type stays undefined → getAccessorStaticHandle throws).
				ingest0: {
					type: Accessor.AccessType.LOCAL_FOLDER,
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
					previewContainerId: HTTP_PROXY_PACKAGE_CONTAINER_ID,
					thumbnailContainerId: HTTP_PROXY_PACKAGE_CONTAINER_ID,
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
