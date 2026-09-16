import { IBlueprintPieceType, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
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
import { normalizeLayeredVideoFileName, WIPE_CUT_POINT_MS } from '../base/showstyle/helpers/clips.js'
import { LOOK_B_LAYERS } from '../base/showstyle/helpers/pgmLook.js'
import { AudioSourceType } from '../base/studio/helpers/config.js'
import {
	loadSmokeRundownExport,
	hybridCasparConfig,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

/** Smoke SYN parts are hard cuts — inject a wipe for wipe-routing unit tests. */
function withWipeOnSyn(exportData: ReturnType<typeof loadSmokeRundownExport>, synExternalId?: string) {
	const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
	const syn =
		(synExternalId ? ingest.parts.find((part) => part.externalId === synExternalId) : undefined) ??
		ingest.parts.find((part) => {
			const payload = part.payload as { type?: string; pieces?: Array<{ objectType: string }> }
			return (
				/^(vo|syn)$/i.test(payload.type || '') ||
				(payload.pieces ?? []).some((piece) => /^(video|vo)$/i.test(piece.objectType))
			)
		})
	expect(syn, 'tema-1 should have a SYN/VO part').toBeDefined()
	if (!syn) throw new Error(`missing SYN in seg-tema-1`)

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
			id: `${syn.externalId}-wipe`,
			objectType: 'wipe',
			objectTime: 0,
			duration: 0,
			clipName: '',
			attributes: { fileName: 'wipes/wipe', transition: 'ILU TO SYN CLUSTER' },
		})
	}

	return { ingest, synExternalId: syn.externalId }
}

describe('wipe piece type → PGM route / overlay', () => {
	const exportData = loadSmokeRundownExport()

	it('Full SYN wipe plays on PGM EffectsPlayer; route://4 hard-cuts at wipe cut point', () => {
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
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		const wipePiece = result.pieces.find((piece) => piece.name.startsWith('Wipe'))

		expect(wipePiece?.lifespan).toBe(PieceLifespan.WithinPart)
		expect(wipePiece?.sourceLayerId).toBe(SourceLayer.PgmWipe)
		expect(wipePiece?.outputLayerId).toBe('gfx')
		const overlay = wipePiece?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer
		)
		expect(overlay?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'wipes/wipe',
			// Straight-alpha .mov → premul before Caspar composites (layer straightAlpha is a no-op).
			videoFilter: 'premultiply=inplace=1',
			mixer: {
				keyer: false,
				blend: TSR.BlendMode.NORMAL,
				opacity: 1,
				fill: { x: 0, y: 0, xScale: 1, yScale: 1 },
				volume: 1,
			},
		})
		expect((overlay?.content as TSR.TimelineContentCCGMedia).mixer?.chroma).toBeUndefined()
		expect((overlay?.content as TSR.TimelineContentCCGMedia).mixer?.straightAlpha).toBeUndefined()
		expect((overlay?.content as TSR.TimelineContentCCGMedia).mixer?.keyer).toBe(false)
		expect(overlay?.enable).toEqual({ start: 0, duration: 2500 })
		expect(overlay?.keyframes).toBeUndefined()
		const routeObj = wipePiece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(routeObj).toBeDefined()
		expect(routeObj?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect(routeObj?.content).toMatchObject({
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://4',
		})
		expect((routeObj?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
		expect(wipePiece?.content.ignoreMediaObjectStatus).toBe(true)
		// Preroll so Caspar LOADBGs the alpha wipe before Take (~3s cue otherwise).
		expect(wipePiece?.prerollDuration).toBeGreaterThanOrEqual(3000)
		// InTransition: Softie must not fold wipe preroll into toPartDelay (look MEDIA late).
		expect(wipePiece?.pieceType).toBe(IBlueprintPieceType.InTransition)
		// Main VO clip must stay the story video, not the wipe.
		expect(result.pieces[0]?.name).toContain('clips/')
		expect(result.pieces[0]?.name).not.toContain('wipe')
	})

	it('honours editorial wipe cutPoint from RE payload for route + keepalive', () => {
		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === synExternalId)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const wipe = synPart.objects.find(
			(obj) => obj.objectType === ObjectType.Video && (obj.attributes as { playLayer?: string }).playLayer === 'wipe'
		)
		expect(wipe).toBeDefined()
		if (!wipe) return
		;(wipe.attributes as { cutPoint?: number }).cutPoint = 1100

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		expect(result.part.inTransition?.previousPartKeepaliveDuration).toBe(1100)

		const wipePiece = result.pieces.find((piece) => piece.name.startsWith('Wipe'))
		const routeObj = wipePiece?.content.timelineObjects?.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(routeObj?.enable).toEqual({ start: 1100 })

		const lookClip = result.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find(
				(obj) =>
					(obj.layer === LOOK_B_LAYERS.clip || obj.layer === LOOK_B_LAYERS.camera) &&
					(obj.content as { type?: string; file?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA &&
					(obj.content as { file?: string }).file !== 'EMPTY' &&
					!(obj.content as { file?: string }).file?.startsWith('route://')
			)
		expect(lookClip).toBeDefined()
		expect(!Array.isArray(lookClip?.enable) && lookClip?.enable.start).toBe(1100)
		// Look MEDIA postroll must match resolved cutPoint so Softie keepalive can hold picture.
		const lookClipPiece = result.pieces.find((piece) =>
			(piece.content.timelineObjects ?? []).some((obj) => obj === lookClip)
		)
		expect(lookClipPiece?.postrollDuration ?? 0).toBeGreaterThanOrEqual(1100)
	})

	it('keeps previous look through the wipe (no pre-sting hard cut)', () => {
		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === synExternalId)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		expect(result.part.inTransition?.previousPartKeepaliveDuration).toBe(WIPE_CUT_POINT_MS)
		expect(result.part.inTransition?.blockTakeDuration).toBe(2500)
		const overlay = result.pieces
			.flatMap((piece) => piece.content.timelineObjects ?? [])
			.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(overlay?.enable).toEqual({ start: 0, duration: 2500 })
	})

	it('Full wiped Takes EMPTY clip through cut so previous SYN audio dies under wipe_sport', () => {
		const { ingest, synExternalId } = withWipeOnSyn(exportData)
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === synExternalId)
		expect(synPart).toBeDefined()
		if (!synPart) return

		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		expect(result.part.autoNext).toBe(true)
		const clearPiece = result.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		const clipEmpty = clearPiece?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.clip && (obj.content as { file?: string }).file === 'EMPTY'
		)
		expect(clipEmpty?.enable).toEqual({ start: 0, duration: WIPE_CUT_POINT_MS })
		const voPiece = result.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.VO as string))
		// Softie must not hold editorial MEDIA until Take+lookPreroll.
		expect(voPiece?.prerollDuration ?? 0).toBeLessThan(1500)
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
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		const generated = result.pieces.find((piece) => piece.name.startsWith('Wipe'))
		const overlay = generated?.content.timelineObjects?.find(
			(obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer
		)
		expect((overlay?.content as TSR.TimelineContentCCGMedia).file).toBe('wipes/wipe')
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
			result.pieces[0]?.content.timelineObjects?.some((obj) => obj.layer === CasparCGLayers.CasparCGClipPlayer2B)
		).toBe(true)
		// SourceLayer.VT → clear Full-look CAM so clip on 4-110 is not covered by baseline route://5
		const timeline = result.pieces.flatMap((piece) => piece.content.timelineObjects ?? [])
		expect(
			timeline.some(
				(obj) => obj.layer === CasparCGLayers.CasparCGPgmCameraB && (obj.content as { file?: string }).file === 'EMPTY'
			)
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
		const result = generateLayeredVideoPart(partContext, wipeOnly, 'B')
		const wipePiece = result.pieces.find((piece) => piece.name.startsWith('Wipe'))
		expect(wipePiece).toBeDefined()
		const l3dClear = result.pieces.find((piece) => piece.externalId?.endsWith('_l3d_clear'))
		expect(l3dClear).toBeDefined()
		expect(l3dClear?.sourceLayerId).toBe(SourceLayer.PgmLayerClear)
		const l3dEmpty = l3dClear?.content.timelineObjects?.find(
			(obj) => obj.layer === LOOK_B_LAYERS.lowerThird && (obj.content as { file?: string }).file === 'EMPTY'
		)
		// No incoming L3D: EMPTY must not expire at WIPE_CUT_POINT_MS (keepalive continues).
		expect(l3dEmpty?.enable).toEqual({ start: 0 })
		const timeline = wipePiece?.content.timelineObjects ?? []
		expect(timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmEffectsPlayer)?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'wipes/360_wipe',
		})
		const route = timeline.find((obj) => obj.layer === CasparCGLayers.CasparCGPgmRoute)
		expect(route?.enable).toEqual({ start: WIPE_CUT_POINT_MS })
		expect(route?.content).toMatchObject({
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: 'route://4',
		})
		expect((route?.content as TSR.TimelineContentCCGMedia).transitions?.inTransition).toBeUndefined()
	})

	it('generates ForceMute timeline for playback + host channels during wipe', () => {
		const configWithPlayback = {
			...hybridCasparConfig,
			sisyfosSources: {
				playback0: { source: 10, type: AudioSourceType.Playback },
				playback1: { source: 11, type: AudioSourceType.Playback },
				host0: { source: 1, type: AudioSourceType.Host },
				guest0: { source: 2, type: AudioSourceType.Guest },
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

		const muteObj = wipePiece?.content.timelineObjects?.find((obj) => obj.layer === SisyfosLayers.ForceMute)
		expect(muteObj).toBeDefined()
		expect(muteObj?.enable).toEqual({ start: 0, duration: 2500 })
		const muteContent = muteObj?.content as TSR.TimelineContentSisyfosChannels
		expect(muteContent.type).toBe(TSR.TimelineContentTypeSisyfos.CHANNELS)
		expect(muteContent.channels).toEqual([
			{ mappedLayer: 'sisyfos_source_playback0', isPgm: 0 },
			{ mappedLayer: 'sisyfos_source_playback1', isPgm: 0 },
			{ mappedLayer: 'sisyfos_source_host0', isPgm: 0 },
		])
		expect(muteContent.channels.some((ch) => ch.mappedLayer.includes('guest'))).toBe(false)

		// SYN/ILU Caspar mixer volume ducks for the wipe window (route:// audio).
		const synClip = result.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.VO as string))
		const mediaObj = synClip?.content.timelineObjects?.find(
			(obj) => (obj.content as TSR.TimelineContentCCGMedia)?.type === TSR.TimelineContentTypeCasparCg.MEDIA
		)
		expect(
			mediaObj?.keyframes?.some((kf) => (kf.content as { mixer?: { volume?: number } })?.mixer?.volume === 0)
		).toBe(true)

		// Kolíska beds must mute for the sting (bg_music_c under wipe_sport).
		const bgMute = result.pieces.find((piece) => piece.name === 'BG music mute (Wipe)')
		expect(bgMute).toBeDefined()
		const mutePreroll = configWithPlayback.casparcgLatency
		expect(bgMute?.enable).toEqual({ start: 0, duration: mutePreroll + 2500 })
		expect(bgMute?.prerollDuration).toBe(mutePreroll)
		expect(
			(bgMute?.content.timelineObjects ?? []).every(
				(obj) =>
					!Array.isArray(obj.enable) &&
					obj.enable.start === mutePreroll &&
					obj.enable.duration === 2500 &&
					(obj.content as TSR.TimelineContentCCGMedia).mixer?.volume === 0
			)
		).toBe(true)
	})

	it('hard-cut PGM route pieces use only casparcgLatency (no look/wipe preroll)', () => {
		const ingest = smokeExportToIngestSegment(exportData, 'seg-tema-1')
		const syn = ingest.parts.find((part) => {
			const payload = part.payload as { type?: string; pieces?: Array<{ objectType: string }> }
			return (
				/^(vo|syn)$/i.test(payload.type || '') ||
				(payload.pieces ?? []).some((piece) => /^(video|vo)$/i.test(piece.objectType))
			)
		})
		expect(syn).toBeDefined()
		if (!syn) return
		const payload = syn.payload as { pieces: Array<{ objectType: string }> }
		payload.pieces = payload.pieces.filter((piece) => piece.objectType.toLowerCase() !== 'wipe')
		const segment = convertIngestData(mockIngestContext, ingest)
		const synPart = segment.parts.find((part) => part.payload.externalId === syn.externalId)
		expect(synPart).toBeDefined()
		if (!synPart) return
		const partContext = new PartContext(mockSegmentContext(), synPart.payload.externalId)
		const result = generateVOPart(partContext, synPart as PartProps<VOProps>, 'B')
		const routePiece = result.pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmRoute as string))
		expect(routePiece).toBeDefined()
		// Softie holds Take by max piece preroll — look/wipe ms here made every hard cut lag ~1.5–3s.
		expect(routePiece?.prerollDuration).toBe(hybridCasparConfig.casparcgLatency)
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

	it('preserves themed story wipe paths for demo-assets media', () => {
		expect(normalizeLayeredVideoFileName('wipe', 'wipes/wipe_sjv')).toBe('wipes/wipe_sjv')
		expect(normalizeLayeredVideoFileName('wipe', 'wipes/wipe_sport')).toBe('wipes/wipe_sport')
		expect(normalizeLayeredVideoFileName('wipe', 'wipes/wipe_pocasie')).toBe('wipes/wipe_pocasie')
	})

	it('does not treat inherited object keys as wipe aliases', () => {
		expect(normalizeLayeredVideoFileName('wipe', 'toString')).toBe('wipes/toString')
		expect(normalizeLayeredVideoFileName('wipe', 'constructor')).toBe('wipes/constructor')
	})
})
