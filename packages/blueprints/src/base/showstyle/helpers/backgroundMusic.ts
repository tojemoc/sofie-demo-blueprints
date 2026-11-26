import { IBlueprintPiece, ICommonContext, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'

import { SiyfosSourceConfig } from '../../../$schemas/generated/main-studio-config.js'
import { literal } from '../../../common/util.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { AudioSourceType, StudioConfig, VisionMixerDevice } from '../../studio/helpers/config.js'
import { CasparCGLayers, VMixLayers } from '../../studio/layers.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createDualChannelAudioBedTimelineObjects } from './audioBedTimeline.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { RundownMetadata } from './metadata.js'
import { usesVmixProgram } from './visionMixer.js'

/** A-block background music (loops through rundown). */
export const BG_MUSIC_A_FILE = 'loops/bg_music_a'

/** C-block background music (from Šport segment onward). */
export const BG_MUSIC_C_FILE = 'loops/bg_music_c'

/** Koliska: louder sting at the start of each bed, then duck to underscore over 2s. */
export const KOLISKA_HIT_DURATION_MS = 2000
export const KOLISKA_HIT_VOLUME = 1
export const KOLISKA_BED_VOLUME = 0.45

/** vMix studios play the kolíska beds on vMix inputs (`vmixProgram.bedAInput` / `bedCInput`) — Caspar stays silent. */
export function casparOwnsMusicBeds(config: StudioConfig): boolean {
	return config.visionMixer.type !== VisionMixerDevice.VMix
}

/** Kolíska hit-then-duck mixer keyframes for the Caspar audio beds (Caspar-PGM path only). */
function koliskaMixerKeyframes(): NonNullable<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']> {
	return [
		{
			id: '',
			enable: { start: KOLISKA_HIT_DURATION_MS },
			content: {
				deviceType: TSR.DeviceType.CASPARCG,
				type: TSR.TimelineContentTypeCasparCg.MEDIA,
				mixer: {
					volume: KOLISKA_BED_VOLUME,
				},
			},
		},
	]
}

type VmixBed = 'A' | 'C'

const VMIX_BED_LAYERS: Record<VmixBed, { input: VMixLayers; audio: VMixLayers }> = {
	A: { input: VMixLayers.VMixBedA, audio: VMixLayers.VMixBedAAudio },
	C: { input: VMixLayers.VMixBedC, audio: VMixLayers.VMixBedCAudio },
}

/** vMix AUDIO volume for the kolíska beds — studio `vmixProgram.bedVolume` (0–100, default 70). */
export function getVmixBedVolume(config: StudioConfig): number {
	const raw = config.vmixProgram?.bedVolume
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return Math.min(100, Math.max(0, Math.round(raw)))
	}
	return 70
}

/** Loud volume a vMix bed ramps up to right after each reset — `vmixProgram.bedHitVolume` (0–100, default 100). */
export function getVmixBedHitVolume(config: StudioConfig): number {
	const raw = config.vmixProgram?.bedHitVolume
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return Math.min(100, Math.max(0, Math.round(raw)))
	}
	return 100
}

/** SetVolumeFade length for the ramp up to hit volume — `vmixProgram.bedRampUpMs` (default 400). */
export function getVmixBedRampUpMs(config: StudioConfig): number {
	const raw = config.vmixProgram?.bedRampUpMs
	return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 400
}

/** Hold at hit volume before fading down — `vmixProgram.bedHitHoldMs` (default 300). */
export function getVmixBedHitHoldMs(config: StudioConfig): number {
	const raw = config.vmixProgram?.bedHitHoldMs
	return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 300
}

/** SetVolumeFade length for the hit → bed-volume fade — `vmixProgram.bedRampDownMs` (default 1500). */
export function getVmixBedRampDownMs(config: StudioConfig): number {
	const raw = config.vmixProgram?.bedRampDownMs
	return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1500
}

/** Default SFX audio start per wipe file (ms from stinger start — measured on the studio files). */
const WIPE_SFX_START_DEFAULTS = {
	wipe: 400,
	wipe_sjv: 40,
	wipe_sport: 0,
	wipe_pocasie: 40,
} as const

/**
 * Offset into the wipe file where its audio SFX actually starts — `vmixProgram.wipeSfxStartMs`.
 * Beds stay live until this point and mute only for the SFX window (a mute at Take
 * left dead air while the stinger's first frames are still silent).
 */
export function getWipeSfxStartMs(config: StudioConfig, wipeFile: string | undefined): number {
	const basename = (wipeFile ?? '')
		.replace(/^.*[/\\]/, '')
		.replace(/\.[^.]*$/, '')
		.toLowerCase()
	// Longest keys first so wipe_sjv does not fall through to bare `wipe`.
	const key = (Object.keys(WIPE_SFX_START_DEFAULTS) as Array<keyof typeof WIPE_SFX_START_DEFAULTS>)
		.sort((a, b) => b.length - a.length)
		.find((candidate) => basename.includes(candidate))
	const raw = key ? config.vmixProgram?.wipeSfxStartMs?.[key] : undefined
	return typeof raw === 'number' && Number.isFinite(raw)
		? Math.max(0, Math.floor(raw))
		: key
			? WIPE_SFX_START_DEFAULTS[key]
			: WIPE_SFX_START_DEFAULTS.wipe
}

/** INPUT `playing:true` object for a vMix kolíska bed input. `restart` is a per-part truthy key — RESTART_INPUT fires on value change, restarting the track at its opening. */
function vmixBedPlayObject(
	bed: VmixBed,
	enable: TimelineBlueprintExt['enable'],
	priority: number,
	restart?: string
): TimelineBlueprintExt<TSR.TimelineContentVMixInput> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixInput>>({
		id: '',
		enable,
		layer: VMIX_BED_LAYERS[bed].input,
		priority,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.INPUT,
			playing: true,
			loop: true,
			...(restart ? { restart } : {}),
		},
	})
}

/**
 * AUDIO object for a vMix kolíska bed input. Beds ride bus B + Master
 * (`audioBuses: 'M,B'` — A is the ILU/SYN bus in the studio preset).
 */
function vmixBedAudioObject(
	bed: VmixBed,
	enable: TimelineBlueprintExt['enable'],
	priority: number,
	content: Partial<TSR.TimelineContentVMixAudio>
): TimelineBlueprintExt<TSR.TimelineContentVMixAudio> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixAudio>>({
		id: '',
		enable,
		layer: VMIX_BED_LAYERS[bed].audio,
		priority,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.AUDIO,
			audioBuses: 'M,B',
			...content,
		},
	})
}

/**
 * Restart envelope for an audible vMix bed: fade up to `bedHitVolume` over
 * `bedRampUpMs`, hold `bedHitHoldMs`, then fade down to `bedVolume` over
 * `bedRampDownMs`. Called on every bed (re)start — first Take, wipe unmute, A/C swap.
 */
function vmixBedRestartEnvelope(
	config: StudioConfig,
	bed: VmixBed,
	startMs: number,
	priority: number
): TimelineBlueprintExt<TSR.TimelineContentVMixAudio>[] {
	const rampUpMs = getVmixBedRampUpMs(config)
	const holdMs = getVmixBedHitHoldMs(config)
	return [
		vmixBedAudioObject(bed, { start: startMs, duration: rampUpMs + holdMs }, priority, {
			muted: false,
			volume: getVmixBedHitVolume(config),
			fade: rampUpMs,
		}),
		// muted must be explicit — TSR only emits AUDIO_ON for a defined false.
		vmixBedAudioObject(bed, { start: startMs + rampUpMs + holdMs }, priority, {
			muted: false,
			volume: getVmixBedVolume(config),
			fade: getVmixBedRampDownMs(config),
		}),
	]
}

/** vMix studios always carry the bed inputs (`vmixProgram.bedAInput` / `bedCInput`); mappings are emitted for every vMix studio. */
function hasVmixBeds(config: StudioConfig): boolean {
	return config.visionMixer.type === VisionMixerDevice.VMix
}

/**
 * Which kolíska bed each segment owns — derived from editorial position, not
 * generation order: C from Šport onward (kept through Počasie), back to A from
 * ZÁVER. Segments are recorded by externalId with their ingest rank, so a lone
 * segment regenerated by an NRCS update still resolves against the segments
 * before it — regenerating Počasie keeps C, regenerating an early story gets A.
 */
interface VmixBedGenerationState {
	segments: Map<string, { rank: number; order: number; name: string }>
	currentBed: VmixBed
	nextOrder: number
}
const vmixBedGenerationByRundownId = new Map<string, VmixBedGenerationState>()

/** Fresh slate for a full rundown regeneration, seeded with the ingest segment order (called from getRundown). */
export function beginVmixBedGeneration(
	rundownId: string,
	segments: ReadonlyArray<{ externalId: string; rank: number; name: string }>
): void {
	const state: VmixBedGenerationState = { segments: new Map(), currentBed: 'A', nextOrder: 0 }
	vmixBedGenerationByRundownId.set(rundownId, state)
	seedVmixBedSegments(state, segments)
}

function seedVmixBedSegments(
	state: VmixBedGenerationState,
	segments: ReadonlyArray<{ externalId: string; rank: number; name: string }>
): void {
	for (const seg of [...segments].sort((a, b) => a.rank - b.rank)) {
		const existing = state.segments.get(seg.externalId)
		if (existing) {
			// The persisted snapshot is authoritative for rank — a reordered story
			// must not resolve its bed against the stale warm-state rank. order/name
			// are generation bookkeeping, not editorial position: keep them.
			existing.rank = seg.rank
		} else {
			state.segments.set(seg.externalId, { rank: seg.rank, order: state.nextOrder++, name: seg.name })
		}
	}
}

/**
 * Rehydrate segment history persisted on the rundown (privateData) — Core can
 * regenerate a single segment after a worker restart, and without predecessors
 * a Počasie regen would silently resolve the default A bed.
 */
export function restoreVmixBedHistoryForGeneration(
	rundownId: string,
	segments: RundownMetadata['vmixBedSegments']
): void {
	if (!segments?.length) {
		return
	}
	let state = vmixBedGenerationByRundownId.get(rundownId)
	if (!state) {
		state = { segments: new Map(), currentBed: 'A', nextOrder: 0 }
		vmixBedGenerationByRundownId.set(rundownId, state)
	}
	seedVmixBedSegments(state, segments)
}

/** Called from `generateParts` with the segment identity so part-level pieces know the active bed. */
export function setVmixActiveBedForGeneration(
	rundownId: string,
	segmentExternalId: string | undefined,
	segmentName: string,
	rank?: number
): void {
	let state = vmixBedGenerationByRundownId.get(rundownId)
	if (!state) {
		state = { segments: new Map(), currentBed: 'A', nextOrder: 0 }
		vmixBedGenerationByRundownId.set(rundownId, state)
	}
	const existing = state.segments.get(segmentExternalId ?? segmentName)
	const record = {
		// Segments without a rank sort after ranked ones; rank ties keep
		// first-seen order (test fixtures give every segment rank 0).
		rank: rank ?? existing?.rank ?? Number.MAX_SAFE_INTEGER,
		order: existing?.order ?? state.nextOrder++,
		name: segmentName,
	}
	state.segments.set(segmentExternalId ?? segmentName, record)

	const ordered = [...state.segments.values()].sort((a, b) => a.rank - b.rank || a.order - b.order)
	// C owns the bed from the first Šport segment until the Outro mute — no
	// re-swap at ZÁVER (that flip-flop was the "A comes back mid-sport" family).
	let bed: VmixBed = 'A'
	for (const seg of ordered.slice(0, ordered.indexOf(record) + 1)) {
		if (isSportSegmentName(seg.name)) bed = 'C'
	}
	state.currentBed = bed
}

export function getVmixActiveBedForGeneration(rundownId: string | undefined): VmixBed {
	return (rundownId !== undefined && vmixBedGenerationByRundownId.get(rundownId)?.currentBed) || 'A'
}

/** Test helper — vitest shares the module between cases. */
export function resetVmixBedGenerationForTests(): void {
	vmixBedGenerationByRundownId.clear()
}

/** vMix moderator mic input — `vmixProgram.micInput` (0 = mic ducking disabled). */
export function getVmixMicInput(config: StudioConfig): number {
	const raw = config.vmixProgram?.micInput
	return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

/** Delay into SYN / Intro / Outro before the mic ramps down — `vmixProgram.micRampDelayMs` (default 150). */
export function getVmixMicRampDelayMs(config: StudioConfig): number {
	const raw = config.vmixProgram?.micRampDelayMs
	return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 150
}

/** SetVolumeFade length for the mic ramp — `vmixProgram.micRampMs` (default 150). */
export function getVmixMicRampMs(config: StudioConfig): number {
	const raw = config.vmixProgram?.micRampMs
	return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 150
}

/**
 * Baseline mic-on state for vMix studios — keeps the moderator mic live at full
 * volume on Master whenever no SYN / Intro / Outro piece is ramping it down.
 * Emitted into the rundown baseline (while:1, priority 0).
 */
export function createVmixMicBaselineAudioObject(
	config: StudioConfig
): TimelineBlueprintExt<TSR.TimelineContentVMixAudio> | undefined {
	if (getVmixMicInput(config) <= 0) return undefined
	return literal<TimelineBlueprintExt<TSR.TimelineContentVMixAudio>>({
		id: '',
		enable: { while: 1 },
		layer: VMixLayers.VMixMicAudio,
		priority: 0,
		content: {
			deviceType: TSR.DeviceType.VMIX,
			type: TSR.TimelineContentTypeVMix.AUDIO,
			muted: false,
			volume: 100,
			fade: getVmixMicRampMs(config),
			audioBuses: 'M',
		},
	})
}

/**
 * Mic ramp-down for SYN / Intro / Outro — `startMs` is where the countdown begins
 * (Take-relative); the actual fade starts `micRampDelayMs` later so a finishing
 * syllable lands, then fades volume to 0 over `micRampMs`. When the piece ends the
 * baseline object restores volume 100.
 */
export function createVmixMicRampDownTimelineObjects(
	config: StudioConfig,
	startMs: number,
	priority: number
): TimelineBlueprintExt<TSR.TimelineContentVMixAudio>[] {
	if (getVmixMicInput(config) <= 0) return []
	return [
		literal<TimelineBlueprintExt<TSR.TimelineContentVMixAudio>>({
			id: '',
			enable: { start: startMs + getVmixMicRampDelayMs(config) },
			layer: VMixLayers.VMixMicAudio,
			priority,
			content: {
				deviceType: TSR.DeviceType.VMIX,
				type: TSR.TimelineContentTypeVMix.AUDIO,
				muted: false,
				volume: 0,
				fade: getVmixMicRampMs(config),
				audioBuses: 'M',
			},
		}),
	]
}

/**
 * Kolíska bed A starter — OutOnRundownEnd piece inserted into the taken part by
 * `onTake` on the first Take and armed into every nexted part by `onSetAsNext`
 * (same pattern as the vMix recording piece). The bed must not play from
 * Activate/Rehearsal — it begins exactly when the first part goes on air.
 */
export const BG_MUSIC_A_START_EXTERNAL_ID = 'first_take_bg_music_a'

export function createBackgroundMusicStartPiece(context: ICommonContext, config: StudioConfig): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: { start: 0 },
		externalId: BG_MUSIC_A_START_EXTERNAL_ID,
		name: 'BG music A (first Take)',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.AudioBed,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.AudioBed),
		content: {
			fileName: BG_MUSIC_A_FILE,
			timelineObjects: casparOwnsMusicBeds(config)
				? createDualChannelAudioBedTimelineObjects(BG_MUSIC_A_FILE, {
						volume: KOLISKA_HIT_VOLUME,
						priority: 0,
						keyframes: koliskaMixerKeyframes(),
					})
				: (['A', 'C'] as const)
						.filter(() => hasVmixBeds(config))
						.flatMap((bed) => [
							...(bed === 'A' ? [vmixBedPlayObject('A', { while: 1 }, 0)] : []),
							// Constant state — this piece is re-armed into every nexted part,
							// so time-bounded envelope objects would replay on every Take.
							// The first-Take hit is a separate one-shot piece (see below).
							vmixBedAudioObject(
								bed,
								{ while: 1 },
								0,
								bed === 'A' ? { muted: false, volume: getVmixBedVolume(config) } : { muted: true }
							),
						]),
		},
		expectedPackages: !casparOwnsMusicBeds(config)
			? []
			: [
					createMediaFileExpectedPackage(
						context,
						BG_MUSIC_A_FILE,
						[CasparCGLayers.CasparCGAudioBed, CasparCGLayers.CasparCGAudioBedPgm],
						{ includeSideEffects: true }
					),
				],
		prerollDuration: config.casparcgLatency,
	})
}

/**
 * One-shot kolíska hit for the very first Take — WithinPart piece inserted by
 * `onTake` only when `bgMusicAStarted` is not yet set (the re-armed start piece
 * would replay this envelope on every Take otherwise). Priority 1.8: below the
 * mute pieces (2) so a wiped first Take still ducks under the SFX.
 */
export function createBackgroundMusicHitPiece(config: StudioConfig): IBlueprintPiece | undefined {
	if (casparOwnsMusicBeds(config)) return undefined
	return literal<IBlueprintPiece>({
		enable: { start: 0 },
		externalId: 'first_take_bg_music_hit',
		name: 'BG music hit (first Take)',
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.BgMusicHit,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.BgMusicHit),
		content: {
			fileName: BG_MUSIC_A_FILE,
			timelineObjects: [
				// Seek-0 restart rides this one-shot piece — the vMix input may be
				// mid-loop from a rehearsal. A restart key on the re-armed start
				// piece would re-fire RESTART_INPUT every time a wipe's unmute
				// object yielded the layer back.
				vmixBedPlayObject('A', { start: 0 }, 1.8, 'first_take_bg_music_a'),
				...vmixBedRestartEnvelope(config, 'A', 0, 1.8),
			],
		},
		expectedPackages: [],
	})
}

/**
 * Mute LED+PGM kolíska beds (A and C) while an overlay owns the soundtrack.
 * Priority 2 beats the C-bed (1) and the first-Take A-bed (0).
 *
 * Outro mute is OutOnRundownEnd so beds stay quiet after the jingle (no restart).
 * Intro mute is WithinPart so the first DoubleBox reveal can bring audio back.
 * Wipe mute EMPTYs the bed layers for the sting window: when it ends, the
 * media diff (EMPTY → bed file) re-PLAYs the bed from position 0 — the bed
 * restarts from the beginning on unmute, not resumes mid-loop.
 */
export function createBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	label: 'Intro' | 'Outro' | 'Wipe',
	durationMs?: number,
	wipeFile?: string,
	activeBed: VmixBed = 'A',
	sfxDelayMs = 0
): IBlueprintPiece {
	const persistAfterPart = label === 'Outro'
	const prerollMs = config.casparcgLatency
	// Wipe mute piece prerolls for LOADBG; object enable must stay Take-relative through
	// the sting tail (start 0 would end prerollMs early and let bg_music_c bleed under SFX).
	// Piece enable.duration includes preroll so Sofie does not truncate the offset object.
	// Beds stay live until the stinger's SFX actually starts (each wipe file's audio
	// kicks in at its own offset — a mute at Take left dead air under the silent head).
	// sfxDelayMs shifts the audible start later (vMix stingers fire after Take).
	const sfxStartMs =
		label === 'Wipe' && durationMs !== undefined
			? Math.min(sfxDelayMs + getWipeSfxStartMs(config, wipeFile), durationMs)
			: 0
	const muteWindowMs = durationMs !== undefined ? Math.max(0, durationMs - sfxStartMs) : 0
	const timelineEnable =
		durationMs !== undefined && !persistAfterPart && muteWindowMs > 0
			? { start: label === 'Wipe' ? prerollMs + sfxStartMs : 0, duration: muteWindowMs }
			: undefined
	const restoreAtMs = prerollMs + (durationMs ?? 0)
	// Seek-0 restart + hit envelope only make sense when the bed actually muted —
	// an SFX offset that swallows the wipe must not restart a bed that kept playing.
	const restartBeds = label === 'Wipe' && muteWindowMs > 0
	// vMix beds restart via a seek-0 INPUT object at the unmute instant — the piece
	// needs a tail covering the seek + the hit→fade-down envelope objects.
	// Caspar restarts via the EMPTY→bed media diff, no tail needed.
	const restartTailMs =
		restartBeds && !casparOwnsMusicBeds(config) ? getVmixBedRampUpMs(config) + getVmixBedHitHoldMs(config) + 300 : 0
	const pieceDurationMs =
		durationMs !== undefined && !persistAfterPart
			? label === 'Wipe'
				? prerollMs + durationMs + restartTailMs
				: durationMs
			: undefined
	const vmixMuteEnable = timelineEnable
	// Gate on the same predicate as the baseline mic volume-100 object
	// (`usesVmixProgram` → getVMixProgramBaseline): on a vMix studio without the
	// program path the baseline never restores the mic, so ramping here would
	// leave the presenter's mic at 0 after the part ends.
	const micRampObjects =
		usesVmixProgram(config) && (label === 'Intro' || label === 'Outro')
			? createVmixMicRampDownTimelineObjects(config, prerollMs, 2)
			: []
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
			...(pieceDurationMs !== undefined ? { duration: pieceDurationMs } : {}),
		},
		externalId: `${partExternalId}_bg_music_mute`,
		name: `BG music mute (${label})`,
		lifespan: persistAfterPart ? PieceLifespan.OutOnRundownEnd : PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.BgMusicFx,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.BgMusicFx),
		content: {
			fileName: label === 'Wipe' ? 'EMPTY' : BG_MUSIC_A_FILE,
			ignoreAudioFormat: true,
			timelineObjects: casparOwnsMusicBeds(config)
				? label === 'Wipe'
					? // A wipe shorter than its SFX offset has no mute window — emit
						// nothing rather than an unbounded EMPTY that kills the bed for
						// the whole part.
						timelineEnable
						? createDualChannelAudioBedTimelineObjects('EMPTY', {
								priority: 2,
								enable: timelineEnable,
							})
						: []
					: createDualChannelAudioBedTimelineObjects(BG_MUSIC_A_FILE, {
							volume: 0,
							priority: 2,
							...(timelineEnable ? { enable: timelineEnable } : {}),
						})
				: [
						...(['A', 'C'] as const)
							.filter(() => hasVmixBeds(config))
							.flatMap((bed) => [
								// Intro/Outro: undefined enable = open-ended mute. Wipe without a
								// positive mute window: emit nothing (unbounded mute would kill the
								// bed for the whole part).
								...(label !== 'Wipe' || vmixMuteEnable !== undefined
									? [
											// Explicit resting volume during the mute window — the unmute
											// envelope diffs from a known state so every restart emits a
											// real SetVolumeFade up to the hit volume (no volume field on
											// the muted object = vMix may already sit at the target).
											vmixBedAudioObject(bed, vmixMuteEnable ?? { start: 0 }, 2, {
												muted: true,
												volume: getVmixBedVolume(config),
											}),
										]
									: []),
								// Restart the bed input from 0 at unmute — the AUDIO toggle
								// leaves the input's position running. `restart` carries a
								// per-part string: RESTART_INPUT only fires on a truthy value
								// change, while seek:0 would emit nothing on a second
								// identical wipe (SET_POSITION diffs by value).
								...(restartBeds
									? [
											literal<TimelineBlueprintExt<TSR.TimelineContentVMixInput>>({
												id: '',
												enable: { start: restoreAtMs },
												layer: VMIX_BED_LAYERS[bed].input,
												priority: 2,
												content: {
													deviceType: TSR.DeviceType.VMIX,
													type: TSR.TimelineContentTypeVMix.INPUT,
													playing: true,
													loop: true,
													restart: partExternalId,
												},
											}),
										]
									: []),
								// Only the active bed un-mutes into the hit→fade-down envelope;
								// the inactive bed's own muted object resumes underneath.
								...(restartBeds && bed === activeBed
									? vmixBedRestartEnvelope(config, bed, restoreAtMs, 2)
									: []),
							]),
						...micRampObjects,
					],
		},
		expectedPackages: [],
		prerollDuration: prerollMs,
	})
}

/** Mute the baseline A-bed during Intro (overlay carries its own audio). */
export function createIntroBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	durationMs?: number
): IBlueprintPiece {
	return createBackgroundMusicMutePiece(config, partExternalId, 'Intro', durationMs)
}

/** Mute A/C beds and any kolíska while Outro.mov plays (overlay owns the soundtrack). */
export function createOutroBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	durationMs?: number
): IBlueprintPiece {
	return createBackgroundMusicMutePiece(config, partExternalId, 'Outro', durationMs)
}

/**
 * Mute kolíska beds for the wipe SFX window (`wipe_sport` / themed stings).
 * `sfxDelayMs` is the delay before the sting's audio starts beyond the file's
 * own SFX offset — vMix stingers fire `VMIX_STINGER_PREVIEW_LEAD_MS` after
 * Take, so their SFX lands that much later.
 */
export function createWipeBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	wipeDurationMs: number,
	wipeFile?: string,
	activeBed: VmixBed = 'A',
	sfxDelayMs = 0
): IBlueprintPiece {
	return createBackgroundMusicMutePiece(
		config,
		partExternalId,
		'Wipe',
		wipeDurationMs,
		wipeFile,
		activeBed,
		sfxDelayMs
	)
}

/** Swap to C-bed from the first Take in Šport onward (same koliska hit → duck envelope). */
export function createSportBackgroundMusicPiece(
	context: ICommonContext,
	config: StudioConfig,
	segmentExternalId: string
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: { start: 0 },
		externalId: `${segmentExternalId}_bg_music_c`,
		name: 'BG music C (Šport)',
		lifespan: PieceLifespan.OutOnRundownEnd,
		sourceLayerId: SourceLayer.AudioBed,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.AudioBed),
		content: {
			fileName: BG_MUSIC_C_FILE,
			timelineObjects: casparOwnsMusicBeds(config)
				? createDualChannelAudioBedTimelineObjects(BG_MUSIC_C_FILE, {
						volume: KOLISKA_HIT_VOLUME,
						priority: 1,
						keyframes: koliskaMixerKeyframes(),
					})
				: [
						...(hasVmixBeds(config)
							? [
									vmixBedPlayObject('C', { start: 0 }, 1),
									...vmixBedRestartEnvelope(config, 'C', 0, 1),
									vmixBedAudioObject('A', { start: 0 }, 1, { muted: true }),
								]
							: []),
					],
		},
		expectedPackages: !casparOwnsMusicBeds(config)
			? []
			: [
					createMediaFileExpectedPackage(
						context,
						BG_MUSIC_C_FILE,
						[CasparCGLayers.CasparCGAudioBed, CasparCGLayers.CasparCGAudioBedPgm],
						{
							includeSideEffects: true,
						}
					),
				],
		prerollDuration: config.casparcgLatency,
	})
}

/**
 * Duck an AudioBed piece (e.g. sport C) for the wipe SFX window.
 * Sport music is often appended after {@link createWipeBackgroundMusicMutePiece}; mixer
 * keyframes guarantee `bg_music_c` stays at 0 even if the mute piece loses a priority race.
 * Pass `prerollMs = 0` so unmute lands at wipe CLEAR (Take + wipeDuration), not delayed.
 */
export function duckAudioBedPieceDuringWipe(piece: IBlueprintPiece, wipeDurationMs: number, sfxStartMs: number): void {
	if (wipeDurationMs <= 0) return
	// Bed stays live through the wipe's silent head — duck only once the SFX
	// actually starts (per-file {@link getWipeSfxStartMs}), restore at sting end.
	const muteFrom = Math.max(0, Math.min(sfxStartMs, wipeDurationMs))
	const muteDuration = wipeDurationMs - muteFrom
	if (muteDuration <= 0) return
	const restoreAt = wipeDurationMs
	for (const obj of piece.content.timelineObjects ?? []) {
		const layer = String(obj.layer)
		if (
			layer !== (CasparCGLayers.CasparCGAudioBed as string) &&
			layer !== (CasparCGLayers.CasparCGAudioBedPgm as string)
		) {
			continue
		}
		const content = obj.content as TSR.TimelineContentCCGMedia | undefined
		if (!content || content.type !== TSR.TimelineContentTypeCasparCg.MEDIA) continue
		const baseVolume =
			typeof content.mixer?.volume === 'number' && Number.isFinite(content.mixer.volume)
				? content.mixer.volume
				: 1
		const existing = ((obj as TimelineBlueprintExt).keyframes ?? []) as NonNullable<
			TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']
		>
		const restoreVolume = mixerVolumeAtOrBefore(existing, baseVolume, restoreAt)
		// Bed envelopes (e.g. the kolíska hit at 0) keep running until the mute
		// actually starts — drop only keyframes inside the mute window.
		const preservedKeyframes = existing.filter((kf) => keyframeStartMs(kf) < muteFrom)
		const laterKeyframes = existing.filter((kf) => keyframeStartMs(kf) > restoreAt)
		;(obj as TimelineBlueprintExt).keyframes = [
			...preservedKeyframes,
			{
				id: '',
				enable: { start: muteFrom, duration: muteDuration },
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.MEDIA,
					mixer: { volume: 0 },
				},
			},
			{
				id: '',
				enable: { start: restoreAt },
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.MEDIA,
					mixer: { volume: restoreVolume },
				},
			},
			...laterKeyframes,
		]
	}
}

/** `enable.start` of a keyframe in ms (non-numeric/absent → +∞ so it sorts last). */
function keyframeStartMs(kf: { enable?: unknown }): number {
	const enable = kf.enable as { start?: number } | Array<unknown> | undefined
	if (!enable || Array.isArray(enable)) return Number.POSITIVE_INFINITY
	return typeof enable.start === 'number' && Number.isFinite(enable.start) ? enable.start : Number.POSITIVE_INFINITY
}

/** Latest mixer volume from keyframes at or before `timeMs`, else `baseVolume`. */
function mixerVolumeAtOrBefore(
	keyframes: NonNullable<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']>,
	baseVolume: number,
	timeMs: number
): number {
	let volume = baseVolume
	for (const kf of keyframes) {
		const start = keyframeStartMs(kf)
		if (start > timeMs) continue
		const mixerVol = (kf.content as { mixer?: { volume?: number } } | undefined)?.mixer?.volume
		if (typeof mixerVol === 'number' && Number.isFinite(mixerVol)) {
			volume = mixerVol
		}
	}
	return volume
}

/** True when the segment name starts with "sport" (accent-insensitive) — the Šport bed-swap segment. */
export function isSportSegmentName(name: string): boolean {
	const normalized = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
	// Word-start match only — avoid false positives like "Transport".
	return /^sport(?:\b|$)/u.test(normalized)
}

/** True for the closing segment ("ZÁVER + AVIZO") — swaps the bed back C → A. */
export function isZaverSegmentName(name: string): boolean {
	const normalized = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
	return /^(?:zaver|avizo)(?:\b|$)/u.test(normalized)
}

/** True for the weather segment ("POČASIE") — predecessor check for the leave-weather teardown. */
export function isPocasieSegmentName(name: string): boolean {
	const normalized = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
	return /^pocasie(?:\b|$)/u.test(normalized)
}

/**
 * Name of the segment immediately before this one (editorial rank order), or
 * undefined when there is none. Segment-name checks (Počasie/Záver) answer
 * cross-segment questions at a segment's first part — within a segment the
 * loop sees the previous part's objects directly.
 */
export function previousSegmentNameForGeneration(
	rundownId: string,
	segmentExternalId: string | undefined,
	segmentName: string,
	rank?: number
): string | undefined {
	const state = vmixBedGenerationByRundownId.get(rundownId)
	if (!state) return undefined
	const selfKey = segmentExternalId ?? segmentName
	const self = state.segments.get(selfKey)
	const selfRank = rank ?? self?.rank ?? Number.MAX_SAFE_INTEGER
	const selfOrder = self?.order ?? Number.MAX_SAFE_INTEGER
	let previous: { rank: number; order: number; name: string } | undefined
	for (const [key, rec] of state.segments) {
		if (key === selfKey) continue
		// Precedes in editorial order: lower rank wins; rank ties (test
		// fixtures rank everything 0) fall back to first-seen order.
		const precedes =
			rec.rank < selfRank ||
			(rec.rank === selfRank && selfRank !== Number.MAX_SAFE_INTEGER && rec.order < selfOrder)
		if (
			precedes &&
			(!previous || rec.rank > previous.rank || (rec.rank === previous.rank && rec.order > previous.order))
		) {
			previous = rec
		}
	}
	return previous?.name
}

/** Sisyfos ForceMute channel entries for every configured Playback source. */
export function getPlaybackForceMuteChannels(
	config: StudioConfig
): { type: AudioSourceType.Playback; index: number; isOn: false }[] {
	const playbackSources = Object.values<SiyfosSourceConfig>(config.sisyfosSources).filter(
		(source) => source.type === AudioSourceType.Playback
	)

	return playbackSources.map((_source, index) => ({
		type: AudioSourceType.Playback,
		index,
		isOn: false as const,
	}))
}

/** Host mics — muted under SYN and during wipe SFX (mic becomes an input). */
export function getHostForceMuteChannels(
	config: StudioConfig
): { type: AudioSourceType.Host; index: number; isOn: false }[] {
	const hostSources = Object.values<SiyfosSourceConfig>(config.sisyfosSources).filter(
		(source) => source.type === AudioSourceType.Host
	)

	return hostSources.map((_source, index) => ({
		type: AudioSourceType.Host,
		index,
		isOn: false as const,
	}))
}

/** Playback + Host — mute set while wipe SFX is audible (Guest stays untouched). */
export function getWipeForceMuteChannels(
	config: StudioConfig
): { type: AudioSourceType; index: number; isOn: false }[] {
	return [...getPlaybackForceMuteChannels(config), ...getHostForceMuteChannels(config)]
}
