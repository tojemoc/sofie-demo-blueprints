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

				// The route the dual flip brings live at the cut: the 110/111 object whose
				// base (or cut keyframe) raises OPACITY 1 is the incoming slot.
				const liveFor = (layer: (typeof PGM_ROUTE_LAYERS)['A' | 'B']) => {
					const o = objs.find((x) => String(x.layer) === (layer as string))
					if (!o) return false
					const content = o.content as { mixer?: { opacity?: number } }
					const kf = (o.keyframes ?? []) as Array<{ content?: { mixer?: { opacity?: number } } }>
					return content.mixer?.opacity === 1 || kf.some((k) => k.content?.mixer?.opacity === 1)
				}
				const live = liveFor(PGM_ROUTE_LAYERS.A) ? getLookCasparChannel(tri, 'A') : getLookCasparChannel(tri, 'B')
				// The sting must reveal the same route the PGM flip reveals (armed == played
				// by construction): a per-take producer mismatch is what dropped the sting.
				expect({ part: p.part.externalId, route, live }).toMatchObject({ route, live })
				// One sting producer on 124 for this take.
				expect(objs.filter((o) => String(o.layer) === (PGM_ROUTE_LAYERS.STING as string))).toHaveLength(1)
			}
		}

		expect(stingTakes).toBeGreaterThan(0)
	})
})
