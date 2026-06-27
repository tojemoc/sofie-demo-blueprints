import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ISegmentUserContext } from '@sofie-automation/blueprints-integration'
import { convertIngestData } from '../../base/showstyle/sofie-editor-parsers/index.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../../base/studio/helpers/config.js'

export type SmokeRundownExport = {
	segments: Array<{ id: string; name: string; payload?: { type?: string } }>
	parts: Array<{
		id: string
		name: string
		segmentId: string
		partType?: string
		duration?: number
		script?: string
		payload: { type: string; duration?: number; script?: string }
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

export const hybridCasparConfig: StudioConfig = {
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

export function loadSmokeRundownExport(): SmokeRundownExport {
	return JSON.parse(
		readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../assets/spravy-v3-smoke-rundown.json'),
			'utf8'
		)
	)
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
