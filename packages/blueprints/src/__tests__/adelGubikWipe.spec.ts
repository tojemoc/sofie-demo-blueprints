/**
 * SYN CLUSTER ADEL → ILU GUBIK: cross-segment Full→DB wipe.
 * Air cut is the baseline (cutPoint + cover centre + PRELOAD latency). Early cuts
 * on air were cold PLAY after Sofie PRELOAD of wipe_sjv evicted LOADBG'd wipe.mov
 * on shared layer 205 — fixed by per-file EffectsPlayer layers (205–208).
 *
 * Fixture: pinned megarepo `spravy-v3-smoke-rundown.json` (same ADEL/GUBIK ids as
 * Export). Do not load `Export rundown.json` — it is not in the CI asset pin.
 */
import { TSR } from '@sofie-automation/blueprints-integration'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import {
	LOOK_HARD_CUT_INCOMING_DELAY_MS,
	LOOK_HARD_CUT_KEEPALIVE_MS,
	LOOK_HARD_CUT_POSTROLL_MS,
	LOOK_MEDIA_POSTROLL_MS,
	LOOK_B_LAYERS,
	createLookSlotSequence,
} from '../base/showstyle/helpers/pgmLook.js'
import {
	applyCrossSlotWipeAirCutBias,
	resolveWipeAirCutMs,
	WIPE_PLAYOUT_LATENCY_MS,
	CROSS_SLOT_WIPE_AIR_CUT_BIAS_MS,
	pgmWipeEffectsLayerForFile,
} from '../base/showstyle/helpers/clips.js'
import { CasparCGLayers } from '../base/studio/layers.js'
import { resolveMegarepoAsset } from './helpers/megarepoAssets.js'
import {
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
	type SmokeRundownExport,
} from './helpers/smokeRundownIngest.js'

function loadSmokeRundown(): SmokeRundownExport {
	const path = resolveMegarepoAsset('spravy-v3-smoke-rundown.json')
	return JSON.parse(readFileSync(path, 'utf8'))
}

describe('SYN CLUSTER ADEL → ILU GUBIK wipe (smoke rundown)', () => {
	it('Full→DB air cut matches baseline; classical wipe stays on layer 205', () => {
		const smoke = loadSmokeRundown()
		const slots = createLookSlotSequence()
		const ctx = mockSegmentContext()

		const tema4 = generateParts(
			ctx,
			convertIngestData(mockIngestContext, smokeExportToIngestSegment(smoke, 'seg-tema-4')),
			undefined,
			slots
		)
		const tema5 = generateParts(
			ctx,
			convertIngestData(mockIngestContext, smokeExportToIngestSegment(smoke, 'seg-tema-5')),
			undefined,
			slots
		)

		const adel = tema4.parts.find((p) => p.part.externalId === 'part-tema-4-2-syn-cluster-adel')
		const gubik = tema5.parts.find((p) => p.part.externalId === 'part-tema-5-1-ilu-gubik')
		expect(adel).toBeDefined()
		expect(gubik).toBeDefined()
		if (!adel || !gubik) return

		expect(WIPE_PLAYOUT_LATENCY_MS).toBe(380)
		expect(CROSS_SLOT_WIPE_AIR_CUT_BIAS_MS).toBe(0)
		expect(pgmWipeEffectsLayerForFile('wipes/wipe')).toBe(CasparCGLayers.CasparCGPgmEffectsPlayer)
		expect(pgmWipeEffectsLayerForFile('wipes/wipe_sjv')).toBe(CasparCGLayers.CasparCGPgmEffectsPlayerSjv)

		const baselineAirCut = resolveWipeAirCutMs({ cutPoint: 380 }, 2500, 'wipes/wipe')
		expect(baselineAirCut).toBe(780)
		const expectedAirCut = applyCrossSlotWipeAirCutBias(baselineAirCut, 2500, true)
		expect(expectedAirCut).toBe(780)

		const adelClip = adel.pieces.find((piece) =>
			(piece.content.timelineObjects ?? []).some(
				(obj) =>
					String(obj.layer) === (LOOK_B_LAYERS.clip as string) &&
					(obj.content as { file?: string }).file?.includes('SYN CLUSTER ADEL')
			)
		)
		expect(adelClip?.postrollDuration ?? 0).toBeGreaterThanOrEqual(LOOK_MEDIA_POSTROLL_MS)
		expect(LOOK_HARD_CUT_POSTROLL_MS).toBeLessThan(expectedAirCut)

		expect(gubik.part.inTransition?.previousPartKeepaliveDuration).toBe(expectedAirCut)

		const timeline = gubik.pieces.flatMap((p) => p.content.timelineObjects ?? [])
		const wipeOverlay = timeline.find(
			(obj) =>
				String(obj.layer) === (CasparCGLayers.CasparCGPgmEffectsPlayer as string) &&
				typeof (obj.content as { file?: string }).file === 'string' &&
				/wipe/i.test((obj.content as { file: string }).file)
		)
		expect(wipeOverlay).toBeDefined()
		expect(!Array.isArray(wipeOverlay?.enable) && wipeOverlay?.enable.start).toBe(0)

		const route = timeline.find(
			(obj) =>
				String(obj.layer) === (CasparCGLayers.CasparCGPgmRoute as string) &&
				(obj.content as { type?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA
		)
		expect(route).toBeDefined()
		expect(!Array.isArray(route?.enable) && route?.enable.start).toBe(expectedAirCut)
		expect((route?.content as { file?: string }).file).toBe('route://3')
	})

	it('same-slot hard cuts use true overlap (keepalive > incoming delay)', () => {
		expect(LOOK_HARD_CUT_INCOMING_DELAY_MS).toBe(40)
		expect(LOOK_HARD_CUT_KEEPALIVE_MS).toBe(80)
		expect(LOOK_HARD_CUT_KEEPALIVE_MS).toBeGreaterThan(LOOK_HARD_CUT_INCOMING_DELAY_MS)
		expect(LOOK_HARD_CUT_POSTROLL_MS).toBeGreaterThanOrEqual(LOOK_HARD_CUT_KEEPALIVE_MS)
	})
})
