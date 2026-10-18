import { describe, expect, it } from 'vitest'
import { createLookSlotSequence, PGM_ROUTE_LAYERS, getLookCasparChannel } from '../base/showstyle/helpers/pgmLook.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { StudioConfig } from '../base/studio/helpers/config.js'
import {
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
	loadSmokeRundownExport,
	hybridCasparConfig,
} from './helpers/smokeRundownIngest.js'

function stingTrialConfig(): StudioConfig {
	const hyper = hybridCasparConfig.casparcg.hypercomposed as NonNullable<StudioConfig['casparcg']['hypercomposed']>
	return {
		...hybridCasparConfig,
		casparcg: {
			...hybridCasparConfig.casparcg,
			hypercomposed: { ...hyper, wipeUseStingRouteTransition: true },
		},
	}
}

describe('sting contract (end-to-end smoke rundown, STING-trial flag on)', () => {
	it('every STING take plays the producer its dual-route flip brings live; one producer per take', () => {
		const exportData = loadSmokeRundownExport()
		const seq = createLookSlotSequence()
		const tri = stingTrialConfig()
		const trialCtx = { ...mockSegmentContext(), getStudioConfig: () => ({ studio: tri }) } as ReturnType<
			typeof mockSegmentContext
		>
		const segOrder = [...new Set(exportData.parts.map((p) => p.segmentId))]
		let stingTakes = 0

		for (const segId of segOrder) {
			const ingest = smokeExportToIngestSegment(exportData, segId)
			const intermediate = convertIngestData(mockIngestContext, ingest)
			const generated = generateParts(trialCtx, intermediate, undefined, seq)
			for (const p of generated.parts) {
				const objs = p.pieces.flatMap((pc) => pc.content.timelineObjects ?? [])
				const sting = objs.find((o) => String(o.layer) === (PGM_ROUTE_LAYERS.STING as string))
				if (!sting) continue
				stingTakes++
				const route = Number(/route:\/\/(\d+)/.exec(String((sting.content as { file?: string }).file))?.[1])

				// The incoming slot is the dual-route object that flips OPACITY to 1 at the
				// cut (the outgoing holds opacity 1 in its base instead). Evaluate both
				// routes and require exactly one to flip — a broken flip would silently
				// pick the wrong route below.
				const flipsLive = (layer: (typeof PGM_ROUTE_LAYERS)['A' | 'B']) => {
					const o = objs.find((x) => String(x.layer) === (layer as string))
					const kf = (o?.keyframes ?? []) as Array<{ content?: { mixer?: { opacity?: number } } }>
					return kf.some((k) => k.content?.mixer?.opacity === 1)
				}
				const flipsA = flipsLive(PGM_ROUTE_LAYERS.A)
				const flipsB = flipsLive(PGM_ROUTE_LAYERS.B)
				expect({ part: p.part.externalId, flipsA, flipsB }).toMatchObject({ flipsA: !flipsB, flipsB: !flipsA })
				const live = flipsA ? getLookCasparChannel(tri, 'A') : getLookCasparChannel(tri, 'B')
				// The sting must reveal the same route the PGM flip brings live (armed ==
				// played by construction): a per-take producer mismatch is what dropped the
				// sting. Keep the part id in the message so a mismatch names the take.
				expect(route, `part ${p.part.externalId}: sting producer must equal the live route`).toBe(live)
				// One sting producer on 124 for this take.
				expect(objs.filter((o) => String(o.layer) === (PGM_ROUTE_LAYERS.STING as string))).toHaveLength(1)
			}
		}

		expect(stingTakes).toBeGreaterThan(0)
	})
})
