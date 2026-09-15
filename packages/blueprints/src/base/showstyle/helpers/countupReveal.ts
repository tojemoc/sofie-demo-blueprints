import { IBlueprintPiece, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { ObjectType, SomeObject } from '../../../common/definitions/objects.js'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { PGM_COUNTUP_FILE } from '../rundown/baseline.js'

/** MIX fade when countup becomes audible on first DoubleBox after wipe. */
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

function countupTimelineObject(mode: 'reveal' | 'sustain' | 'mute'): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	const fadeIn = mode === 'reveal'
	const muted = mode === 'mute' || mode === 'reveal'
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { while: 1 },
		layer: CasparCGLayers.CasparCGGraphicsLogo,
		priority: mode === 'mute' ? 3 : 2,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: PGM_COUNTUP_FILE,
			loop: true,
			noStarttime: true,
			// Visible from baseline; only audio fades in on reveal (SFX must not ride Intro).
			mixer: {
				opacity: 1,
				volume: muted ? 0 : 1,
			},
		},
		...(fadeIn ? { keyframes: countupRevealKeyframes() } : {}),
	})
}

function createCountupPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string,
	mode: 'reveal' | 'sustain' | 'mute',
	options?: { persistMute?: boolean }
): IBlueprintPiece {
	const name = mode === 'reveal' ? '360 countup' : mode === 'mute' ? '360 countup (mute)' : '360 countup (hold)'
	const persistMute = mode === 'mute' && options?.persistMute
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_countup_${mode}`,
		name,
		// Outro mute must survive the part so kolíska/countup SFX do not restart after the jingle.
		lifespan: mode === 'mute' && !persistMute ? PieceLifespan.WithinPart : PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.Logo,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.Logo),
		content: {
			fileName: PGM_COUNTUP_FILE,
			timelineObjects: [countupTimelineObject(mode)],
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
 * Fade countup audio in on first DoubleBox Take. Visual already runs from baseline
 * (silent); this only brings up volume so Intro never hears countup SFX.
 */
export function createCountupRevealPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	return createCountupPiece(context, config, partExternalId, 'reveal')
}

/**
 * Re-assert audible countup on later parts so OutOnRundownEnd survives takes past
 * the originating DoubleBox (baseline stays muted underneath).
 */
export function createCountupSustainPiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string
): IBlueprintPiece {
	return createCountupPiece(context, config, partExternalId, 'sustain')
}

/** Keep countup visible but silent (Intro overlay / outro jingle own the soundtrack). */
export function createCountupMutePiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string,
	options?: { persist?: boolean }
): IBlueprintPiece {
	return createCountupPiece(context, config, partExternalId, 'mute', { persistMute: options?.persist })
}

/**
 * Shared outro / závěr classification (jingle video, gfx/outro, gfx/ilu-zaver, rawType).
 * Intro is intentionally excluded — muted for the part but not persisted after Take.
 */
export function partIsOutroOrZaverCountupMute(rawType: string | undefined, objects: SomeObject[]): boolean {
	if (/outro|zaver|závěr/i.test(rawType || '')) return true
	return objects.some((obj) => {
		if (obj.objectType === ObjectType.Video) {
			const clip = String((obj as { clipName?: string }).clipName || '').toLowerCase()
			const file =
				typeof (obj as { attributes?: { fileName?: string } }).attributes?.fileName === 'string'
					? (obj as { attributes: { fileName: string } }).attributes.fileName.toLowerCase()
					: ''
			if (/(^|\/)outro(\.|$)/i.test(clip) || /(^|\/)outro(\.|$)/i.test(file)) return true
		}
		if (obj.objectType !== ObjectType.Graphic) return false
		const clip = String((obj as { clipName?: string }).clipName || '').toLowerCase()
		return clip === 'gfx/ilu-zaver' || clip === 'gfx/outro' || clip.endsWith('/outro')
	})
}

function partIsIntroCountupMute(rawType: string | undefined, objects: SomeObject[]): boolean {
	if (/intro/i.test(rawType || '') && !partIsOutroOrZaverCountupMute(rawType, objects)) return true
	return objects.some((obj) => {
		if (obj.objectType !== ObjectType.Video) return false
		const clip = String((obj as { clipName?: string }).clipName || '').toLowerCase()
		const file =
			typeof (obj as { attributes?: { fileName?: string } }).attributes?.fileName === 'string'
				? (obj as { attributes: { fileName: string } }).attributes.fileName.toLowerCase()
				: ''
		return /(^|\/)intro(\.|$)/i.test(clip) || /(^|\/)intro(\.|$)/i.test(file)
	})
}

/** True when this part should keep countup SFX off (Intro overlay or závěr / outro). */
export function partShouldMuteCountup(rawType: string | undefined, objects: SomeObject[]): boolean {
	return partIsIntroCountupMute(rawType, objects) || partIsOutroOrZaverCountupMute(rawType, objects)
}

/** True when countup mute must survive the part (outro / závěr — no SFX restart after). */
export function partShouldPersistCountupMute(rawType: string | undefined, objects: SomeObject[]): boolean {
	return partIsOutroOrZaverCountupMute(rawType, objects)
}

export function appendCountupSustainIfRevealed(
	context: PartContext,
	config: StudioConfig,
	partExternalId: string,
	pieces: IBlueprintPiece[],
	countupRevealClaim: CountupRevealClaim,
	options?: { mute?: boolean; persistMute?: boolean }
): void {
	if (!countupRevealClaim.isRevealed(context.rundownId)) return
	if (pieces.some((piece) => piece.externalId?.includes('_countup_'))) return
	if (options?.mute) {
		pieces.push(createCountupMutePiece(context, config, partExternalId, { persist: options.persistMute }))
		return
	}
	pieces.push(createCountupSustainPiece(context, config, partExternalId))
}
