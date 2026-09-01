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

const countupRevealClaimedRundownIds = new Set<string>()

/** Test helper — vitest shares the module between cases. */
export function resetCountupRevealTrackingForTests(): void {
	countupRevealClaimedRundownIds.clear()
}

/** Once per rundown: reveal on the first DoubleBox camera take (after intro wipe). */
export function claimCountupRevealForRundown(rundownId: string): boolean {
	if (countupRevealClaimedRundownIds.has(rundownId)) return false
	countupRevealClaimedRundownIds.add(rundownId)
	return true
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
