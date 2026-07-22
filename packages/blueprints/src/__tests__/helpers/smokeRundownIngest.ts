import { readFileSync } from 'node:fs'
import { ISegmentUserContext } from '@sofie-automation/blueprints-integration'
import { convertIngestData } from '../../base/showstyle/sofie-editor-parsers/index.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../../base/studio/helpers/config.js'
import { resolveMegarepoAsset } from './megarepoAssets.js'

/** Rundown Editor SerializedRundown export (also used as blueprint smoke-test fixture). */
export type SmokeRundownExport = {
	rundown: {
		id: string
		name: string
		playlistId: string | null
		sync: boolean
		isTemplate?: boolean
		payload?: Record<string, unknown>
	}
	segments: Array<{
		id: string
		name: string
		rundownId: string
		playlistId: string | null
		rank: number
		float?: boolean
		isTemplate?: boolean
		segmentType?: string
		payload?: { type?: string; name?: string }
	}>
	parts: Array<{
		id: string
		name: string
		segmentId: string
		rundownId: string
		playlistId: string | null
		rank: number
		float?: boolean
		partType?: string
		duration?: number
		script?: string
		fromPreset?: boolean
		payload: { type: string; duration?: number; script?: string }
	}>
	pieces: Array<{
		id: string
		partId: string
		segmentId: string
		rundownId: string
		playlistId: string | null
		name: string
		pieceType: string
		start?: number
		duration?: number
		payload: Record<string, string | number | boolean>
	}>
}

export const hybridCasparConfig: StudioConfig = {
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

function resolveSmokeRundownPath(): string {
	return resolveMegarepoAsset('spravy-v3-smoke-rundown.json')
}

export function loadSmokeRundownExport(): SmokeRundownExport {
	return JSON.parse(readFileSync(resolveSmokeRundownPath(), 'utf8'))
}

export function smokeExportToIngestSegment(
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

export const mockIngestContext = {
	logError: () => undefined,
	logWarning: () => undefined,
} as never

export function mockSegmentContext(options?: {
	getHashId?: (origin: string, isNotUnique?: boolean) => string
	unhashId?: (hash: string) => string
}): ISegmentUserContext {
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
		getHashId: options?.getHashId ?? ((origin: string) => `hash_${origin}`),
		unhashId: options?.unhashId ?? ((hash: string) => hash),
	} as unknown as ISegmentUserContext
}
