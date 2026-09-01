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
	isRevealed(rundownId: string): boolean
}

export function createCountupRevealClaim(): CountupRevealClaim {
	const claimedRundownIds = new Set<string>()
	return {
		claim(rundownId: string): boolean {
			if (claimedRundownIds.has(rundownId)) return false
			claimedRundownIds.add(rundownId)
			return true
		},
		isRevealed(rundownId: string): boolean {
			return claimedRundownIds.has(rundownId)
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

function countupTimelineObject(
	fadeIn: boolean
): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { while: 1 },
		layer: CasparCGLayers.CasparCGGraphicsLogo,
		priority: 2,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: PGM_COUNTUP_FILE,
			loop: true,
			noStarttime: true,
			mixer: fadeIn
				? {
						opacity: 0,
						volume: 0,
					}
				: {
						opacity: 1,
						volume: 1,
					},
		},
		...(fadeIn ? { keyframes: countupRevealKeyframes() } : {}),
	})
}

function createCountupPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string,
	suffix: 'reveal' | 'sustain',
	fadeIn: boolean
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_countup_${suffix}`,
		name: suffix === 'reveal' ? '360 countup' : '360 countup (hold)',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.Logo,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.Logo),
		content: {
			fileName: PGM_COUNTUP_FILE,
			timelineObjects: [countupTimelineObject(fadeIn)],
		},
		expectedPackages: [
			createMediaFileExpectedPackage(context, PGM_COUNTUP_FILE, [CasparCGLayers.CasparCGGraphicsLogo], {
				includeSideEffects: true,
			}),
		],
		prerollDuration: config.casparcgLatency,
	})
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
	return createCountupPiece(context, config, partExternalId, 'reveal', true)
}

/**
 * Re-assert visible countup on later parts so OutOnRundownEnd survives takes past
 * the originating DoubleBox (baseline stays muted underneath).
 */
export function createCountupSustainPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	return createCountupPiece(context, config, partExternalId, 'sustain', false)
}

export function appendCountupSustainIfRevealed(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string,
	pieces: IBlueprintPiece[],
	countupRevealClaim: CountupRevealClaim
): void {
	if (!countupRevealClaim.isRevealed(context.rundownId)) return
	if (pieces.some((piece) => piece.externalId?.includes('_countup_'))) return
	pieces.push(createCountupSustainPiece(context, config, partExternalId))
}
