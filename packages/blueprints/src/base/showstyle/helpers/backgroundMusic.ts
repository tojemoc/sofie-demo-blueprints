import { IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { ICommonContext } from '@sofie-automation/blueprints-integration'
import { literal } from '../../../common/util.js'
import { AudioSourceType, StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { createMediaFileExpectedPackage } from './mediaPackages.js'
import { SiyfosSourceConfig } from '../../../$schemas/generated/main-studio-config.js'

/** A-block background music (loops through rundown). */
export const BG_MUSIC_A_FILE = 'loops/bg_music_a'

/** C-block background music (from Šport segment onward). */
export const BG_MUSIC_C_FILE = 'loops/bg_music_c'

/** Koliska: louder sting at the start of the bed, then duck to underscore. */
export const KOLISKA_HIT_DURATION_MS = 4000
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

export function createBackgroundMusicBaselineTimeline(): TimelineBlueprintExt<TSR.TimelineContentCCGMedia> {
	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
		id: '',
		enable: { while: 1 },
		priority: 0,
		layer: CasparCGLayers.CasparCGAudioBed,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.MEDIA,
			file: BG_MUSIC_A_FILE,
			loop: true,
			mixer: {
				volume: KOLISKA_HIT_VOLUME,
			},
		},
		keyframes: koliskaMixerKeyframes(),
	})
}

function createBackgroundMusicPiece(
	context: ICommonContext,
	config: StudioConfig,
	externalId: string,
	name: string,
	file: string,
	lifespan: PieceLifespan,
	durationMs?: number
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
			...(durationMs !== undefined ? { duration: durationMs } : {}),
		},
		externalId,
		name,
		lifespan,
		sourceLayerId: SourceLayer.AudioBed,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.AudioBed),
		content: {
			fileName: file,
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: CasparCGLayers.CasparCGAudioBed,
					priority: 1,
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						file,
						loop: true,
						mixer: {
							volume: KOLISKA_HIT_VOLUME,
						},
					},
				}),
			],
		},
		expectedPackages: [
			createMediaFileExpectedPackage(context, file, [CasparCGLayers.CasparCGAudioBed], {
				includeSideEffects: true,
			}),
		],
		prerollDuration: config.casparcgLatency,
	})
}

/** Mute the baseline A-bed during Intro (overlay carries its own audio). */
export function createIntroBackgroundMusicMutePiece(
	config: StudioConfig,
	partExternalId: string,
	durationMs?: number
): IBlueprintPiece {
	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
			...(durationMs !== undefined ? { duration: durationMs } : {}),
		},
		externalId: `${partExternalId}_bg_music_mute`,
		name: 'BG music mute (Intro)',
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: SourceLayer.AudioBed,
		outputLayerId: getOutputLayerForSourceLayer(SourceLayer.AudioBed),
		content: {
			fileName: BG_MUSIC_A_FILE,
			ignoreAudioFormat: true,
			timelineObjects: [
				literal<TimelineBlueprintExt<TSR.TimelineContentCCGMedia>>({
					id: '',
					enable: { start: 0 },
					layer: CasparCGLayers.CasparCGAudioBed,
					priority: 2,
					content: {
						deviceType: TSR.DeviceType.CASPARCG,
						type: TSR.TimelineContentTypeCasparCg.MEDIA,
						file: BG_MUSIC_A_FILE,
						loop: true,
						mixer: {
							volume: 0,
						},
					},
				}),
			],
		},
		expectedPackages: [],
		prerollDuration: config.casparcgLatency,
	})
}

/** Swap to C-bed from the first Take in Šport onward. */
export function createSportBackgroundMusicPiece(
	context: ICommonContext,
	config: StudioConfig,
	segmentExternalId: string
): IBlueprintPiece {
	return createBackgroundMusicPiece(
		context,
		config,
		`${segmentExternalId}_bg_music_c`,
		'BG music C (Šport)',
		BG_MUSIC_C_FILE,
		PieceLifespan.OutOnRundownEnd
	)
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
