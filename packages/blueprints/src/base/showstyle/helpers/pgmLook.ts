import {
	IBlueprintPart,
	IBlueprintPiece,
	ICommonContext,
	PieceLifespan,
	TSR,
} from '@sofie-automation/blueprints-integration'
import { SomeObject, VideoObject, ObjectType } from '../../../common/definitions/objects.js'
import { literal } from '../../../common/util.js'
import { StudioConfig } from '../../studio/helpers/config.js'
import { CasparCGLayers, SisyfosLayers } from '../../studio/layers.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { getHypercomposedChannels } from '../../studio/applyConfig/mappings/casparcg.js'
import { createMediaFileExpectedPackage, toCasparPlayPath } from './mediaPackages.js'
import {
	DEFAULT_WIPE_DURATION_MS,
	WIPE_CUT_POINT_MS,
	getVideoPlayLayer,
	normalizeLayeredVideoFileName,
} from './clips.js'
import { getAudioObjectOnLayer } from './audio.js'
import { getPlaybackForceMuteChannels } from './backgroundMusic.js'
import { DEFAULT_WIPE_FILE } from '../../../common/definitions/rundownEditorTypes.js'

export type LookSlot = 'A' | 'B'

/** Caspar channel format for STING delay (720p50 / 1080p50). */
export const WIPE_STING_FRAME_RATE = 50

/** Default wait so CEF + clips can cue on the idle BG channel before a wiped Take. */
export const DEFAULT_LOOK_PREROLL_MS = 1500

export const LOOK_A_LAYERS = {
	clip: CasparCGLayers.CasparCGClipPlayer2,
	camera: CasparCGLayers.CasparCGPgmCamera,
	ilu: CasparCGLayers.CasparCGPgmIluPlayer,
	doubleBoxLoop: CasparCGLayers.CasparCGPgmDoubleBoxLoop,
	lowerThird: CasparCGLayers.CasparCGGraphicsPgmLowerThird,
} as const

export const LOOK_B_LAYERS = {
	clip: CasparCGLayers.CasparCGClipPlayer2B,
	camera: CasparCGLayers.CasparCGPgmCameraB,
	ilu: CasparCGLayers.CasparCGPgmIluPlayerB,
	doubleBoxLoop: CasparCGLayers.CasparCGPgmDoubleBoxLoopB,
	lowerThird: CasparCGLayers.CasparCGGraphicsPgmLowerThirdB,
} as const

export type LookLayers = {
	clip: CasparCGLayers
	camera: CasparCGLayers
	ilu: CasparCGLayers
	doubleBoxLoop: CasparCGLayers
	lowerThird: CasparCGLayers
}

const LOOK_A_TO_B: Readonly<Record<string, CasparCGLayers>> = {
	[LOOK_A_LAYERS.clip]: LOOK_B_LAYERS.clip,
	[LOOK_A_LAYERS.camera]: LOOK_B_LAYERS.camera,
	[LOOK_A_LAYERS.ilu]: LOOK_B_LAYERS.ilu,
	[LOOK_A_LAYERS.doubleBoxLoop]: LOOK_B_LAYERS.doubleBoxLoop,
	[LOOK_A_LAYERS.lowerThird]: LOOK_B_LAYERS.lowerThird,
}

const LOOK_COMPOSE_LAYERS = new Set<string>([
	...Object.values<CasparCGLayers>(LOOK_A_LAYERS),
	...Object.values<CasparCGLayers>(LOOK_B_LAYERS),
])

export function isHypercomposedStudio(config: StudioConfig): boolean {
	return Boolean(config.casparcg.hypercomposed)
}

export function lookSlotForPartIndex(index: number): LookSlot {
	return index % 2 === 0 ? 'A' : 'B'
}

/**
 * Rundown-wide ping-pong for BG look slots. Advances only when a look-bearing
 * part allocates; non-look parts (Titles / Intro / DVE / Remote / Invalid) peek
 * the last allocated slot without consuming one.
 */
export interface LookSlotSequence {
	/** Next look slot; advances the rundown-wide counter. */
	allocate(): LookSlot
	/** Last allocated slot, or `'A'` if none yet — does not advance. */
	peek(): LookSlot
}

export function createLookSlotSequence(): LookSlotSequence {
	let nextIndex = 0
	let last: LookSlot | undefined
	return {
		allocate(): LookSlot {
			const slot = lookSlotForPartIndex(nextIndex++)
			last = slot
			return slot
		},
		peek(): LookSlot {
			return last ?? 'A'
		},
	}
}

/** Rundown id for the active blueprint generation (set by {@link beginLookSlotGeneration}). */
let activeLookSlotGenerationRundownId: string | undefined

const lookSlotSequencesByRundownId = new Map<string, LookSlotSequence>()

/** Start a fresh look-slot sequence for this rundown (called from getRundown). */
export function beginLookSlotGeneration(rundownId: string): void {
	lookSlotSequencesByRundownId.delete(rundownId)
	activeLookSlotGenerationRundownId = rundownId
}

/** Shared sequence for all segments in the current rundown generation. */
export function getLookSlotSequenceForGeneration(rundownId: string): LookSlotSequence {
	if (activeLookSlotGenerationRundownId !== rundownId) {
		beginLookSlotGeneration(rundownId)
	}

	let sequence = lookSlotSequencesByRundownId.get(rundownId)
	if (!sequence) {
		sequence = createLookSlotSequence()
		lookSlotSequencesByRundownId.set(rundownId, sequence)
	}
	return sequence
}

/** Test helper — vitest shares the module between cases. */
export function resetLookSlotGenerationForTests(): void {
	lookSlotSequencesByRundownId.clear()
	activeLookSlotGenerationRundownId = undefined
}

export function getLookLayers(slot: LookSlot): LookLayers {
	return slot === 'B' ? LOOK_B_LAYERS : LOOK_A_LAYERS
}

export function getLookCasparChannel(config: StudioConfig, slot: LookSlot): number {
	const channels = getHypercomposedChannels({ studio: config })
	return slot === 'B' ? channels.bgChannelB : channels.bgChannelA
}

export function getLookPrerollMs(config: StudioConfig): number {
	const raw = config.casparcg.hypercomposed?.lookPrerollMs
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
		return Math.floor(raw)
	}
	return DEFAULT_LOOK_PREROLL_MS
}

export function isLookComposeLayer(layer: string): boolean {
	return LOOK_COMPOSE_LAYERS.has(layer)
}

export function wipeStingDelayFrames(cutPointMs: number = WIPE_CUT_POINT_MS): number {
	return Math.max(0, Math.round((cutPointMs / 1000) * WIPE_STING_FRAME_RATE))
}

export function findWipeVideoObject(objects: SomeObject[]): VideoObject | undefined {
	return objects.find(
		(object): object is VideoObject => object.objectType === ObjectType.Video && getVideoPlayLayer(object) === 'wipe'
	)
}

function remapLayerId(layer: string, slot: LookSlot): string {
	if (slot === 'A') return layer
	return LOOK_A_TO_B[layer] ?? layer
}

export function remapLookLayers(pieces: IBlueprintPiece[], slot: LookSlot): void {
	if (slot === 'A') return

	for (const piece of pieces) {
		for (const obj of piece.content.timelineObjects ?? []) {
			obj.layer = remapLayerId(String(obj.layer), slot)
		}
		for (const pkg of piece.expectedPackages ?? []) {
			if (!('layers' in pkg) || !Array.isArray(pkg.layers)) continue
			pkg.layers = pkg.layers.map((layer) => remapLayerId(String(layer), slot))
		}
	}
}

function applyLookPreroll(pieces: IBlueprintPiece[], prerollMs: number): void {
	if (prerollMs <= 0) return

	for (const piece of pieces) {
		const usesLook = (piece.content.timelineObjects ?? []).some((obj) => isLookComposeLayer(String(obj.layer)))
		if (!usesLook) continue
		piece.prerollDuration = Math.max(piece.prerollDuration ?? 0, prerollMs)
	}
}

export function createPgmRouteTimelineObject(
	config: StudioConfig,
	slot: LookSlot,
	wipeFile?: string
): TimelineBlueprintExt<TSR.TimelineContentCCGRoute> {
	const channel = getLookCasparChannel(config, slot)
	const stingFile = wipeFile ? toCasparPlayPath(wipeFile) : undefined

	return literal<TimelineBlueprintExt<TSR.TimelineContentCCGRoute>>({
		id: '',
		enable: { start: 0 },
		layer: CasparCGLayers.CasparCGPgmRoute,
		priority: 1,
		content: {
			deviceType: TSR.DeviceType.CASPARCG,
			type: TSR.TimelineContentTypeCasparCg.ROUTE,
			channel,
			...(stingFile
				? {
						transitions: {
							inTransition: {
								type: TSR.Transition.STING,
								maskFile: stingFile,
								overlayFile: stingFile,
								delay: wipeStingDelayFrames(),
							},
						},
					}
				: {}),
		},
	})
}

function createPgmRoutePiece(
	context: ICommonContext,
	config: StudioConfig,
	partExternalId: string,
	slot: LookSlot,
	wipe: VideoObject | undefined,
	wipeFile: string | undefined
): IBlueprintPiece {
	const hasWipe = Boolean(wipe && wipeFile)
	const transitionLabel =
		typeof wipe?.attributes?.transition === 'string' && wipe.attributes.transition.trim()
			? wipe.attributes.transition.trim()
			: undefined

	const timelineObjects: TimelineBlueprintExt[] = [createPgmRouteTimelineObject(config, slot, wipeFile)]
	if (hasWipe) {
		const playbackMutes = getPlaybackForceMuteChannels(config)
		if (playbackMutes.length > 0) {
			timelineObjects.push({
				...getAudioObjectOnLayer(config, SisyfosLayers.ForceMute, playbackMutes),
				enable: {
					start: 0,
					duration: DEFAULT_WIPE_DURATION_MS,
				},
			})
		}
	}

	return literal<IBlueprintPiece>({
		enable: {
			start: 0,
		},
		externalId: `${partExternalId}_pgm_route`,
		name: hasWipe
			? `Wipe${transitionLabel ? ` · ${transitionLabel}` : ''} | route://${getLookCasparChannel(config, slot)}`
			: `PGM route | ${slot}`,
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: hasWipe ? SourceLayer.PgmWipe : SourceLayer.PgmRoute,
		outputLayerId: getOutputLayerForSourceLayer(hasWipe ? SourceLayer.PgmWipe : SourceLayer.PgmRoute),
		content: {
			fileName: wipeFile,
			ignoreAudioFormat: true,
			ignoreMediaObjectStatus: true,
			timelineObjects,
		},
		expectedPackages: wipeFile
			? [
					createMediaFileExpectedPackage(context, wipeFile, [CasparCGLayers.CasparCGPgmRoute], {
						includeSideEffects: true,
					}),
				]
			: undefined,
		prerollDuration: config.casparcgLatency,
	})
}

function attachRouteToWipePiece(
	context: ICommonContext,
	config: StudioConfig,
	wipePiece: IBlueprintPiece,
	slot: LookSlot,
	wipeFile: string
): void {
	const mutes = (wipePiece.content.timelineObjects ?? []).filter(
		(obj) => String(obj.layer) === (SisyfosLayers.ForceMute as string)
	)
	wipePiece.content.timelineObjects = [createPgmRouteTimelineObject(config, slot, wipeFile), ...mutes]
	wipePiece.enable = { start: 0 }
	wipePiece.prerollDuration = config.casparcgLatency
	wipePiece.content.ignoreAudioFormat = true
	wipePiece.content.ignoreMediaObjectStatus = true
	wipePiece.expectedPackages = [
		createMediaFileExpectedPackage(context, wipeFile, [CasparCGLayers.CasparCGPgmRoute], {
			includeSideEffects: true,
		}),
	]
	const channel = getLookCasparChannel(config, slot)
	if (!wipePiece.name.includes('route://')) {
		wipePiece.name = `${wipePiece.name.replace(/\s*\|\s*[\w./-]+$/, '')} | route://${channel}`
	}
}

/**
 * Ping-pong story looks onto BG A/B and hold PGM on a full-channel route.
 * Wiped Takes STING the route; hard cuts switch the route with no transition.
 * Logo / intro stay on PGM above the route and are not remapped.
 */
export function finalizeHypercomposedPart(
	context: ICommonContext,
	config: StudioConfig,
	part: IBlueprintPart,
	partExternalId: string,
	objects: SomeObject[],
	pieces: IBlueprintPiece[],
	lookSlot: LookSlot = 'A'
): void {
	if (!isHypercomposedStudio(config)) return

	remapLookLayers(pieces, lookSlot)

	const wipe = findWipeVideoObject(objects)
	const wipeFile = wipe
		? normalizeLayeredVideoFileName(
				'wipe',
				(typeof wipe.attributes?.fileName === 'string' && wipe.attributes.fileName.trim()) ||
					wipe.clipName ||
					DEFAULT_WIPE_FILE
			)
		: undefined

	if (wipe) {
		applyLookPreroll(pieces, getLookPrerollMs(config))
		part.inTransition = {
			blockTakeDuration: DEFAULT_WIPE_DURATION_MS,
			previousPartKeepaliveDuration: DEFAULT_WIPE_DURATION_MS,
			partContentDelayDuration: 0,
		}
	}

	const alreadyRouted = pieces.some((piece) =>
		(piece.content.timelineObjects ?? []).some(
			(obj) => String(obj.layer) === (CasparCGLayers.CasparCGPgmRoute as string)
		)
	)
	if (alreadyRouted) return

	const wipePiece = pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))
	if (wipePiece && wipeFile) {
		attachRouteToWipePiece(context, config, wipePiece, lookSlot, wipeFile)
		return
	}

	pieces.push(createPgmRoutePiece(context, config, partExternalId, lookSlot, wipe, wipe ? wipeFile : undefined))
}
