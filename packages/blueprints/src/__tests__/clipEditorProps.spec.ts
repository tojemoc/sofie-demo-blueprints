import { describe, expect, it } from 'vitest'
import { ObjectType, VideoObject } from '../common/definitions/objects.js'
import {
	parseClipEditorProps,
	parseClipProps,
	resolveClipPlayback,
	getVideoPlayLayer,
	resolveWipeCutPointMs,
	resolveWipeAirCutMs,
	resolveWipeDurationMs,
	applyCrossSlotWipeAirCutBias,
	pgmWipeEffectsLayerForFile,
	snapMsToFrame,
	isClassicalWipeFile,
	THEMED_WIPE_ANIMATION_MS,
	WIPE_CUT_POINT_MS,
	WIPE_PLAYOUT_LATENCY_MS,
	WIPE_COVER_CENTER_OFFSET_MS,
	WIPE_FILE_COVER_START_MS,
	WIPE_FILE_COVER_CENTER_MS,
	WIPE_FRAME_MS,
	CROSS_SLOT_WIPE_AIR_CUT_BIAS_MS,
} from '../base/showstyle/helpers/clips.js'
import { CasparCGLayers } from '../base/studio/layers.js'

function makeVideo(overrides: Partial<VideoObject> & { attributes?: VideoObject['attributes'] }): VideoObject {
	return {
		id: 'v1',
		objectType: ObjectType.Video,
		objectTime: 0,
		duration: 5000,
		clipName: '',
		attributes: {},
		...overrides,
	}
}

describe('parseClipEditorProps', () => {
	it('uses attributes.fileName and keeps duration in ms (no second *1000)', () => {
		const props = parseClipEditorProps(
			makeVideo({
				duration: 12000,
				attributes: { fileName: 'clips/vo.mp4', sourceDuration: 11000 },
			})
		)

		expect(props).toEqual({
			fileName: 'clips/vo.mp4',
			duration: 12000,
			sourceDuration: 11000,
			trimInMs: undefined,
			trimOutMs: undefined,
			volume: 1,
		})
	})

	it('falls back to clipName when fileName is empty', () => {
		const props = parseClipEditorProps(
			makeVideo({
				clipName: 'clips/fallback.mp4',
				attributes: { fileName: '' },
			})
		)

		expect(props?.fileName).toBe('clips/fallback.mp4')
	})

	it('returns undefined when no path is set (avoids Sofie stripExtension crash)', () => {
		expect(parseClipEditorProps(makeVideo({ attributes: {} }))).toBeUndefined()
		expect(parseClipProps(makeVideo({ clipName: '', attributes: {} }))).toBeUndefined()
	})

	it('parses trim in/out seconds and percent volume', () => {
		const props = parseClipEditorProps(
			makeVideo({
				duration: 20000,
				attributes: {
					fileName: 'clips/syn.mp4',
					sourceDuration: 18000,
					trimIn: 1.5,
					trimOut: 0.5,
					volume: 80,
				},
			})
		)

		expect(props?.trimInMs).toBe(1500)
		expect(props?.trimOutMs).toBe(500)
		expect(props?.volume).toBe(0.8)
	})
})

describe('resolveClipPlayback', () => {
	it('subtracts trim in/out from source duration', () => {
		expect(
			resolveClipPlayback({
				fileName: 'clips/syn.mp4',
				sourceDuration: 12000,
				trimInMs: 2000,
				trimOutMs: 1000,
			})
		).toEqual({ seekMs: 2000, durationMs: 9000, volume: 1 })
	})

	it('uses the shorter of editorial duration and trimmed source', () => {
		expect(
			resolveClipPlayback({
				fileName: 'clips/syn.mp4',
				duration: 5000,
				sourceDuration: 12000,
				trimInMs: 1000,
			})
		).toEqual({ seekMs: 1000, durationMs: 5000, volume: 1 })
	})

	it('falls back to editorial minus trims when sourceDuration is absent', () => {
		expect(
			resolveClipPlayback({
				fileName: 'clips/syn.mp4',
				duration: 10000,
				trimInMs: 1500,
				trimOutMs: 500,
			})
		).toEqual({ seekMs: 1500, durationMs: 8000, volume: 1 })
	})

	it('represents a fully consumed trim as an empty window', () => {
		expect(
			resolveClipPlayback({
				fileName: 'clips/syn.mp4',
				duration: 10000,
				sourceDuration: 3000,
				trimInMs: 2000,
				trimOutMs: 1500,
			})
		).toEqual({ seekMs: 2000, durationMs: 0, volume: 1 })
	})
})

describe('getVideoPlayLayer', () => {
	it('normalizes playLayer to lowercase', () => {
		expect(getVideoPlayLayer(makeVideo({ attributes: { playLayer: 'WIPE' } }))).toBe('wipe')
		expect(getVideoPlayLayer(makeVideo({ attributes: { playLayer: 'Effects' } }))).toBe('effects')
		expect(getVideoPlayLayer(makeVideo({ attributes: { playLayer: 'unknown' } }))).toBeUndefined()
	})
})

describe('resolveWipeCutPointMs', () => {
	it('defaults to open-loop cover calibration (380 ms) — pairs with playout latency', () => {
		expect(WIPE_CUT_POINT_MS).toBe(380)
		expect(resolveWipeCutPointMs(undefined)).toBe(380)
		expect(resolveWipeCutPointMs({})).toBe(WIPE_CUT_POINT_MS)
		expect(resolveWipeCutPointMs({ cutPoint: -1 })).toBe(WIPE_CUT_POINT_MS)
	})

	it('reads editorial cutPoint ms and clamps to wipe duration', () => {
		expect(resolveWipeCutPointMs({ cutPoint: 900 })).toBe(900)
		expect(resolveWipeCutPointMs({ cutPoint: '1100' }, 2500)).toBe(1100)
		expect(resolveWipeCutPointMs({ cutPoint: 4000 }, 2500)).toBe(2500)
		expect(resolveWipeCutPointMs({ cutPoint: 0 }, 2500)).toBe(0)
		expect(resolveWipeCutPointMs({ cutPoint: 380 }, 2500)).toBe(380)
	})
})

describe('resolveWipeAirCutMs', () => {
	it('lands wipe.mov on Resolve cover centre (~780 ms = source frames 19–20 @25fps)', () => {
		expect(WIPE_PLAYOUT_LATENCY_MS).toBe(380)
		expect(WIPE_COVER_CENTER_OFFSET_MS).toBe(10)
		expect(WIPE_FILE_COVER_START_MS).toBe(760)
		expect(WIPE_FILE_COVER_CENTER_MS).toBe(800)
		expect(isClassicalWipeFile('wipes/wipe.mov')).toBe(true)
		expect(isClassicalWipeFile('wipes/wipe_sjv')).toBe(false)
		// Resolve calibration 380 + half-frame cover + latency 380 → 770 → snap to 780.
		expect(resolveWipeAirCutMs(undefined)).toBe(780)
		expect(resolveWipeAirCutMs({ cutPoint: 380 }, 2500, 'wipes/wipe')).toBe(780)
		expect(resolveWipeAirCutMs({ cutPoint: 500 })).toBe(900)
		expect(resolveWipeAirCutMs({ cutPoint: 0 })).toBe(400)
		// Never schedule after wipe CLEAR.
		expect(resolveWipeAirCutMs({ cutPoint: 2400 }, 2500)).toBe(2500)
	})

	it('applies the same cover-centre bias to themed SJV / ŠPORT / Počasie wipes', () => {
		expect(resolveWipeAirCutMs({ cutPoint: 380 }, 2500, 'wipes/wipe_sjv')).toBe(780)
		expect(resolveWipeAirCutMs({ cutPoint: 380 }, 2500, 'wipes/wipe_sport.mov')).toBe(780)
		expect(resolveWipeAirCutMs({ cutPoint: 380 }, 2500, 'wipes/wipe_pocasie')).toBe(780)
		expect(snapMsToFrame(770)).toBe(780)
		expect(WIPE_FRAME_MS).toBe(20)
	})

	it('honours an explicit playoutLatencyMs override (studio Setting)', () => {
		expect(resolveWipeAirCutMs({ cutPoint: 380 }, 2500, 'wipes/wipe', 380)).toBe(780)
		expect(resolveWipeAirCutMs({ cutPoint: 380 }, 2500, 'wipes/wipe', 600)).toBe(1000)
	})
})

describe('applyCrossSlotWipeAirCutBias', () => {
	it('is a no-op (early cross-slot cuts were cold PLAY, not Full↔DB LOAD)', () => {
		expect(CROSS_SLOT_WIPE_AIR_CUT_BIAS_MS).toBe(0)
		expect(applyCrossSlotWipeAirCutBias(780, 2500, false)).toBe(780)
		expect(applyCrossSlotWipeAirCutBias(780, 2500, true)).toBe(780)
		expect(applyCrossSlotWipeAirCutBias(2400, 2500, true)).toBe(2400)
	})
})

describe('pgmWipeEffectsLayerForFile', () => {
	it('maps each wipe file to its own EffectsPlayer Sofie layer', () => {
		expect(pgmWipeEffectsLayerForFile('wipes/wipe')).toBe(CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(pgmWipeEffectsLayerForFile('wipes/wipe.mov')).toBe(CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(pgmWipeEffectsLayerForFile('wipes/wipe_sjv')).toBe(CasparCGLayers.CasparCGPgmEffectsPlayerSjv)
		expect(pgmWipeEffectsLayerForFile('wipes/wipe_sport.mov')).toBe(CasparCGLayers.CasparCGPgmEffectsPlayerSport)
		expect(pgmWipeEffectsLayerForFile('wipes/wipe_pocasie')).toBe(CasparCGLayers.CasparCGPgmEffectsPlayerPocasie)
	})
})

describe('resolveWipeDurationMs', () => {
	it('caps themed story wipes so Sofie does not freeze the last mov frame', () => {
		expect(resolveWipeDurationMs(2500, 'wipes/wipe_sjv.mov')).toBe(THEMED_WIPE_ANIMATION_MS['wipes/wipe_sjv'])
		expect(resolveWipeDurationMs(2500, 'wipes/wipe_sport')).toBe(THEMED_WIPE_ANIMATION_MS['wipes/wipe_sport'])
		expect(resolveWipeDurationMs(2500, 'wipes/wipe_pocasie.mov')).toBe(THEMED_WIPE_ANIMATION_MS['wipes/wipe_pocasie'])
		// Generic wipe.mov keeps the RE / default length.
		expect(resolveWipeDurationMs(2500, 'wipes/wipe.mov')).toBe(2500)
		expect(resolveWipeDurationMs(undefined)).toBe(2500)
	})
})
