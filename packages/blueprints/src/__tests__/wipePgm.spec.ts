import { PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { PartType, VOProps, VTProps, PartProps } from '../base/showstyle/definitions/index.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import { generateVTPart } from '../base/showstyle/part-adapters/vt.js'
import { generateLayeredVideoPart } from '../base/showstyle/part-adapters/layeredVideo.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { CasparCGLayers, SisyfosLayers } from '../base/studio/layers.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { normalizeLayeredVideoFileName } from '../base/showstyle/helpers/clips.js'
import { AudioSourceType } from '../base/studio/helpers/config.js'
import {
	loadSmokeRundownExport,
	hybridCasparConfig,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

/** Smoke SYN parts are hard cuts — inject a wipe for wipe-routing unit tests. */
function withWipeOnSyn(exportData: ReturnType<typeof loadSmokeRundownExport>, synExternalId = 'part-tema-1-syn-1') {
	const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
	const syn = ingest.parts.find((part) => part.externalId === synExternalId)
	expect(syn).toBeDefined()
	if (!syn) throw new Error(`missing ${synExternalId}`)

	const payload = syn.payload as {
		type: string
		pieces: Array<{
			id: string
			objectType: string
			objectTime?: number
			duration?: number
			clipName?: string
			attributes: Record<string, unknown>
		}>
	}
	if (!payload.pieces.some((p) => p.objectType.toLowerCase() === 'wipe')) {
		payload.pieces.push({
			id: `${synExternalId}-wipe`,
			objectType: 'wipe',
			objectTime: 0,
			duration: 0,
			clipName: '',
			attributes: { fileName: 'wipes/wipe', transition: 'ILU TO SYN CLUSTER' },
		})
	}
	return { ingest, synExternalId }
}

describe('wipe piece type → PGM effects player', () => {
	const exportData = loadSmokeRundownExport()

	it('normalizes lowercase wipe onto PGM layer 200 for SYN (VO) parts', () => {
		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === synExternalId)

		expect(synPart?.type).toBe(PartType.VO)
		const wipe = synPart?.objects.find(
			(obj) => obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'wipe'
		)
		expect(wipe?.clipName).toBe('wipes/wipe')
		expect((wipe?.attributes as { transition?: string }).transition).toBe('ILU TO SYN CLUSTER')

		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>)
		const wipePiece = result.pieces.find((piece) => piece.name.startsWith('Wipe'))

		expect(wipePiece?.lifespan).toBe(PieceLifespan.WithinPart)
		expect(wipePiece?.enable.duration).toBe(2500)
		expect(wipePiece?.sourceLayerId).toBe(SourceLayer.PgmWipe)
		expect(wipePiece?.outputLayerId).toBe('gfx')
		expect(wipePiece?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(wipePiece?.content.ignoreMediaObjectStatus).toBe(true)
		expect((wipePiece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGMedia).file).toBe('wipes/wipe')
		// Main VO clip must stay the story video, not the wipe.
		expect(result.pieces[0]?.name).toContain('clips/')
		expect(result.pieces[0]?.name).not.toContain('wipe')
	})

	it('prefixes bare wipe basenames with wipes/', () => {
		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const synPayload = ingest.parts.find((part) => part.externalId === synExternalId)?.payload as {
			pieces: Array<{ objectType: string; attributes: Record<string, unknown> }>
		}
		const wipePiece = synPayload.pieces.find((piece) => piece.objectType.toLowerCase() === 'wipe')
		expect(wipePiece).toBeDefined()
		if (!wipePiece) return
		wipePiece.attributes.fileName = 'wipe'

		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === synExternalId)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>)
		const generated = result.pieces.find((piece) => piece.name.startsWith('Wipe'))
		expect((generated?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGMedia).file).toBe('wipes/wipe')
	})

	it('accepts uppercase WIPE piece type ids from ingest', () => {
		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const synPayload = ingest.parts.find((part) => part.externalId === synExternalId)?.payload as {
			pieces: Array<{ objectType: string; attributes: Record<string, unknown> }>
		}
		const wipePiece = synPayload.pieces.find((piece) => piece.objectType.toLowerCase() === 'wipe')
		expect(wipePiece).toBeDefined()
		if (!wipePiece) return
		wipePiece.objectType = 'WIPE'

		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === synExternalId)
		const wipe = synPart?.objects.find(
			(obj) => obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'wipe'
		)

		expect(wipe?.clipName).toBe('wipes/wipe')
	})

	it('does not steal the main VT clip when wipe is listed first', () => {
		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const syn = ingest.parts.find((part) => part.externalId === synExternalId)
		expect(syn).toBeDefined()
		if (!syn) return

		const payload = syn.payload as {
			type: string
			pieces: Array<{ id: string; objectType: string; attributes: Record<string, unknown> }>
		}
		payload.type = 'VT'
		const wipeIdx = payload.pieces.findIndex((piece) => piece.objectType.toLowerCase() === 'wipe')
		const videoIdx = payload.pieces.findIndex((piece) => piece.objectType.toLowerCase() === 'video')
		expect(wipeIdx).toBeGreaterThanOrEqual(0)
		expect(videoIdx).toBeGreaterThanOrEqual(0)
		const [wipe] = payload.pieces.splice(wipeIdx, 1)
		payload.pieces.unshift(wipe)

		const segment = convertIngestData(mockIngestContext, ingest)
		const vtPart = segment.parts.find((part) => part.payload.externalId === synExternalId)
		expect(vtPart?.type).toBe(PartType.VT)
		expect((vtPart as PartProps<VTProps>)?.payload.clipProps.fileName).toMatch(/clips\//)

		if (!vtPart || vtPart.type !== PartType.VT) return
		const partContext = new PartContext(mockSegmentContext(), vtPart.payload.externalId)
		const result = generateVTPart(partContext, vtPart as PartProps<VTProps>)
		expect(result.pieces.some((piece) => piece.name.startsWith('Wipe'))).toBe(true)
		expect(
			result.pieces[0]?.content.timelineObjects?.some((obj) => obj.layer === CasparCGLayers.CasparCGClipPlayer2)
		).toBe(true)
	})

	it('routes wipe-only GFX parts to LayeredVideo (not Invalid GFX)', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		ingest.parts.push({
			externalId: 'part-wipe-only',
			name: 'Wipe only',
			payload: {
				segmentId: 'seg-tema-1',
				externalId: 'part-wipe-only',
				rank: 99,
				name: 'Wipe only',
				type: 'GFX',
				float: false,
				script: '',
				duration: 0,
				pieces: [
					{
						id: 'wipe-only-1',
						objectType: 'wipe',
						objectTime: 0,
						duration: 0,
						clipName: '',
						attributes: { fileName: 'wipes/360_wipe', transition: 'Test' },
					},
				],
			},
		} as (typeof ingest.parts)[number])

		const segment = convertIngestData(mockIngestContext, ingest)
		const wipeOnly = segment.parts.find((part) => part.payload.externalId === 'part-wipe-only')
		expect(wipeOnly?.type).toBe(PartType.LayeredVideo)

		if (!wipeOnly || wipeOnly.type !== PartType.LayeredVideo) return
		const partContext = new PartContext(mockSegmentContext(), wipeOnly.payload.externalId)
		const result = generateLayeredVideoPart(partContext, wipeOnly)
		expect(result.pieces).toHaveLength(1)
		expect(result.pieces[0]?.content.timelineObjects?.[0]?.layer).toBe(CasparCGLayers.CasparCGPgmEffectsPlayer)
	})

	it('generates ForceMute timeline for playback channels during wipe', () => {
		const configWithPlayback = {
			...hybridCasparConfig,
			sisyfosSources: {
				playback0: { source: 10, type: AudioSourceType.Playback },
				playback1: { source: 11, type: AudioSourceType.Playback },
			},
		}

		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === synExternalId)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(
			{ ...mockSegmentContext(), getStudioConfig: () => ({ studio: configWithPlayback }) },
			synPart.payload.externalId
		)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>)
		const wipePiece = result.pieces.find((piece) => piece.name.startsWith('Wipe'))
		expect(wipePiece).toBeDefined()

		expect(wipePiece?.enable.duration).toBe(2500)

		const muteObj = wipePiece?.content.timelineObjects?.find((obj) => obj.layer === SisyfosLayers.ForceMute)
		expect(muteObj).toBeDefined()
		expect(muteObj?.enable).toEqual({ start: 0, duration: 2500 })
		const muteContent = muteObj?.content as TSR.TimelineContentSisyfosChannels
		expect(muteContent.type).toBe(TSR.TimelineContentTypeSisyfos.CHANNELS)
		expect(muteContent.channels).toHaveLength(2)
		// isPgm: 0 is the timeline mute (helper supplies isOn: false for each Playback channel).
		// mappedLayer identities correspond to configured playback0/playback1 (sources 10 and 11).
		expect(muteContent.channels).toEqual([
			{ mappedLayer: 'sisyfos_source_playback0', isPgm: 0 },
			{ mappedLayer: 'sisyfos_source_playback1', isPgm: 0 },
		])
	})
})

describe('normalizeLayeredVideoFileName', () => {
	it('preserves valid two-level demo paths', () => {
		expect(normalizeLayeredVideoFileName('wipe', 'wipes/wipe')).toBe('wipes/wipe')
		expect(normalizeLayeredVideoFileName('background', 'loops/bg_loop')).toBe('loops/bg_loop')
		expect(normalizeLayeredVideoFileName('effects', 'assets/intro_michal')).toBe('assets/intro_michal')
	})

	it('prefixes bare basenames with the playLayer subdir', () => {
		expect(normalizeLayeredVideoFileName('wipe', 'wipe')).toBe('wipes/wipe')
		expect(normalizeLayeredVideoFileName('background', 'bg_loop')).toBe('loops/bg_loop')
	})

	it('flattens nested paths to two levels', () => {
		expect(normalizeLayeredVideoFileName('wipe', 'spravy/r1/clips/nested_wipe.mov')).toBe('wipes/nested_wipe')
		expect(normalizeLayeredVideoFileName('effects', 'deep/nested/intro.mov')).toBe('assets/intro')
	})
})
