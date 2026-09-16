import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { ICommonContext } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { AudioSourceType, StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { SiyfosSourceConfig } from '../../../$schemas/generated/main-studio-config.js'
import { createDualChannelAudioBedTimelineObjects } from './audioBedTimeline.js'

/** A-block background music (loops through rundown). */
export const BG_MUSIC_A_FILE = 'loops/bg_music_a'

/** C-block background music (from Šport segment onward). */
export const BG_MUSIC_C_FILE = 'loops/bg_music_c'

/** Koliska: louder sting at the start of each bed, then duck to underscore over 2s. */
export const KOLISKA_HIT_DURATION_MS = 2000
export const KOLISKA_HIT_VOLUME = 1
export const KOLISKA_BED_VOLUME = 0.45

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

export function createBackgroundMusicBaselineTimeline(): TimelineBlueprintExt<TSR.TimelineContentCCGMedia>[] {
	return createDualChannelAudioBedTimelineObjects(BG_MUSIC_A_FILE, {
		enable: { while: 1 },
		volume: KOLISKA_HIT_VOLUME,
		keyframes: koliskaMixerKeyframes(),
	})
}

/**
 * Mute LED+PGM kolíska beds (A and C) while an overlay owns the soundtrack.
 * Priority 2 beats the C-bed (priority 1) and baseline A-bed.
 *
 * Outro mute is OutOnRundownEnd so beds stay quiet after the jingle (no restart).
 * Intro mute is WithinPart so the first DoubleBox reveal can bring audio back.
 * Wipe mute is WithinPart for the sting window so `bg_music_c` does not fight wipe SFX.
 */
export function createBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	label: 'Intro' | 'Outro' | 'Wipe',
	durationMs?: number
): IBlueprintPiece {
	const persistAfterPart = label === 'Outro'
	const prerollMs = config.casparcgLatency
	// Wipe mute piece prerolls for LOADBG; object enable must stay Take-relative through
	// the sting tail (start 0 would end prerollMs early and let bg_music_c bleed under SFX).
	// Piece enable.duration includes preroll so Softie does not truncate the offset object.
	const timelineEnable =
		durationMs !== undefined && !persistAfterPart
			? { start: label === 'Wipe' ? prerollMs : 0, duration: durationMs }
			: undefined
	const pieceDurationMs =
		durationMs !== undefined && !persistAfterPart
			? label === 'Wipe'
				? prerollMs + durationMs
				: durationMs
			: undefined
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
			...(pieceDurationMs !== undefined ? { duration: pieceDurationMs } : {}),
		},
		externalId: `${partExternalId}_bg_music_mute`,
		name: `BG music mute (${label})`,
		lifespan: persistAfterPart ? PieceLifespan.OutOnRundownEnd : PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.AudioBed,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.AudioBed),
		content: {
			fileName: BG_MUSIC_A_FILE,
			ignoreAudioFormat: true,
			timelineObjects: createDualChannelAudioBedTimelineObjects(BG_MUSIC_A_FILE, {
				volume: 0,
				priority: 2,
				...(timelineEnable ? { enable: timelineEnable } : {}),
			}),
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

/** Mute kolíska beds for the wipe SFX window (`wipe_sport` / themed stings). */
export function createWipeBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	wipeDurationMs: number
): IBlueprintPiece {
	return createBackgroundMusicMutePiece(config, partExternalId, 'Wipe', wipeDurationMs)
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
			timelineObjects: createDualChannelAudioBedTimelineObjects(BG_MUSIC_C_FILE, {
				volume: KOLISKA_HIT_VOLUME,
				priority: 1,
				keyframes: koliskaMixerKeyframes(),
			}),
		},
		expectedPackages: [
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
 */
export function duckAudioBedPieceDuringWipe(piece: IBlueprintPiece, wipeDurationMs: number, prerollMs: number): void {
	if (wipeDurationMs <= 0) return
	const muteFrom = Math.max(0, prerollMs)
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
			typeof content.mixer?.volume === 'number' && Number.isFinite(content.mixer.volume) ? content.mixer.volume : 1
		const existing = ((obj as TimelineBlueprintExt).keyframes ?? []) as NonNullable<
			TimelineBlueprintExt<TSR.TimelineContentCCGMedia>['keyframes']
		>
		;(obj as TimelineBlueprintExt).keyframes = [
			{
				id: '',
				enable: { start: muteFrom, duration: wipeDurationMs },
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.MEDIA,
					mixer: { volume: 0 },
				},
			},
			{
				id: '',
				enable: { start: muteFrom + wipeDurationMs },
				content: {
					deviceType: TSR.DeviceType.CASPARCG,
					type: TSR.TimelineContentTypeCasparCg.MEDIA,
					mixer: { volume: baseVolume },
				},
			},
			...existing,
		]
	}
}

export function isSportSegmentName(name: string): boolean {
	const normalized = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
	// Word-start match only — avoid false positives like "Transport".
	return /^sport(?:\b|$)/u.test(normalized)
}

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
