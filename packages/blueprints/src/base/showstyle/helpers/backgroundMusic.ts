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
 */
export function createBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	label: 'Intro' | 'Outro',
	durationMs?: number
): IBlueprintPiece {
	const persistAfterPart = label === 'Outro'
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
			...(durationMs !== undefined && !persistAfterPart ? { duration: durationMs } : {}),
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
			}),
		},
		expectedPackages: [],
		prerollDuration: config.casparcgLatency,
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
