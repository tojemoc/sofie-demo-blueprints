import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { ICommonContext } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { PGM_COUNTUP_FILE } from '../rundown/baseline.js'

/** MIX fade when countup becomes visible/audible on first DoubleBox after wipe. */
export const PGM_COUNTUP_FADE_MS = 400

/** Per-generation claim — one reveal per rundown ingest pass (not retained across generations). */
export interface CountupRevealClaim {
	claim(rundownId: string): boolean
}

export function createCountupRevealClaim(): CountupRevealClaim {
	const claimedRundownIds = new Set<string>()
	return {
		claim(rundownId: string): boolean {
			if (claimedRundownIds.has(rundownId)) return false
			claimedRundownIds.add(rundownId)
			return true
		},
	}
}

/** Rundown id for the active blueprint generation (set by {@link beginCountupRevealGeneration}). */
let activeCountupRevealGenerationRundownId: string | undefined

const countupRevealClaimsByRundownId = new Map<string, CountupRevealClaim>()

/** Start a fresh countup-reveal generation for this rundown (called from getRundown). */
export function beginCountupRevealGeneration(rundownId: string): void {
	countupRevealClaimsByRundownId.delete(rundownId)
	activeCountupRevealGenerationRundownId = rundownId
}

/** Shared claim for all segments in the current rundown generation. */
export function getCountupRevealClaimForGeneration(rundownId: string): CountupRevealClaim {
	if (activeCountupRevealGenerationRundownId !== rundownId) {
		beginCountupRevealGeneration(rundownId)
	}

	let claim = countupRevealClaimsByRundownId.get(rundownId)
	if (!claim) {
		claim = createCountupRevealClaim()
		countupRevealClaimsByRundownId.set(rundownId, claim)
	}
	return claim
}

/** Test helper — vitest shares the module between cases. */
export function resetCountupRevealGenerationForTests(): void {
	countupRevealClaimsByRundownId.clear()
	activeCountupRevealGenerationRundownId = undefined
}

function countupRevealKeyframes(): NonNullable<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']> {
	return [
		{
			id: '',
			enable: { start: 0 },
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				mixer: {
					opacity: 1,
					volume: 1,
				},
				transitions: {
					inTransition: {
						type: TSR.Transition.MIX,
						duration: PGM_COUNTUP_FADE_MS,
					},
				},
			},
		},
	]
}

/**
 * Fade countup in on first DoubleBox Take. Baseline already plays the same file
 * silently from rundown start so SFX/seconds stay aligned with show time.
 */
export function createCountupRevealPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_countup_reveal`,
		name: '360 countup',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.Logo,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.Logo),
		content: {
			fileName: PGM_COUNTUP_FILE,
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: CasparCGLayers.CasparCGGraphicsLogo,
					priority: 1,
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						file: PGM_COUNTUP_FILE,
						loop: true,
						noStarttime: true,
						mixer: {
							opacity: 0,
							volume: 0,
						},
					},
					keyframes: countupRevealKeyframes(),
				}),
			],
		},
		expectedPackages: [
			createMediaFileExpectedPackage(context, PGM_COUNTUP_FILE, [CasparCGLayers.CasparCGGraphicsLogo], {
				includeSideEffects: true,
			}),
		],
		prerollDuration: config.casparcgLatency,
	})
}
