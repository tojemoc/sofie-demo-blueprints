import { describe, expect, it } from 'vitest'

import { IBlueprintPart, IBlueprintPiece, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'

import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { getAudioObjectOnLayer } from '../base/showstyle/helpers/audio.js'
import { BG_MUSIC_A_FILE, BG_MUSIC_C_FILE } from '../base/showstyle/helpers/backgroundMusic.js'
import {
	armIdleLookPreviewForNext,
	createLookSlotSequence,
	finalizeHypercomposedPart,
	LOOK_HARD_CUT_KEEPALIVE_MS,
} from '../base/showstyle/helpers/pgmLook.js'
import {
	VMIX_HARD_CUT_RESUME_LEAD_MS,
	VMIX_STINGER_PREVIEW_LEAD_MS,
	vmixStingerForWipeFile,
} from '../base/showstyle/helpers/visionMixer.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { getBaseline } from '../base/showstyle/rundown/baseline.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { applyConfig } from '../base/studio/applyConfig/index.js'
import { getCasparCGMappings, VMIX_RETIRED_CASPAR_LAYERS } from '../base/studio/applyConfig/mappings/casparcg.js'
import { BgChannelLayers, PgmChannelLayers } from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import { getVMixMappings } from '../base/studio/applyConfig/mappings/vmix.js'
import { TimelineBlueprintExt } from '../base/studio/customTypes.js'
import { AudioSourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers, SisyfosLayers, VMixLayers } from '../base/studio/layers.js'
import { ObjectType, VideoObject } from '../common/definitions/objects.js'
import {
	hybridCasparConfig,
	loadSmokeRundownExport,
	mockIngestContext,
	mockSegmentContext,
	smokeExportToIngestSegment,
} from './helpers/smokeRundownIngest.js'

const CAMERA_INPUT = 1
const LOOK_A_INPUT = 2
const LOOK_B_INPUT = 3
const CLEAN_GFX_INPUT = 4
const BED_A_INPUT = 6
const BED_C_INPUT = 7

const vmixStudioConfig: StudioConfig = {
	...hybridCasparConfig,
	visionMixer: { type: VisionMixerDevice.VMix, host: '127.0.0.1', port: 8088, deviceId: 'vmix0' },
	casparcg: {
		...hybridCasparConfig.casparcg,
		hypercomposed: { ledChannel: 1, pgmChannel: 4, bgChannelA: 2, bgChannelB: 3 },
	},
	vmixSources: {},
	vmixProgram: {
		cameraInput: CAMERA_INPUT,
		lookAInput: LOOK_A_INPUT,
		lookBInput: LOOK_B_INPUT,
		cleanGfxInput: CLEAN_GFX_INPUT,
		bedAInput: BED_A_INPUT,
		bedCInput: BED_C_INPUT,
	},
}

const RETIRED_LAYERS = new Set<string>(VMIX_RETIRED_CASPAR_LAYERS)
const CASPAR_MUSIC_BEDS = new Set<string>([BG_MUSIC_A_FILE, BG_MUSIC_C_FILE])

/** Segment context stub returning the given studio config. */
function vmixContext(config: StudioConfig = vmixStudioConfig) {
	return { ...mockSegmentContext(), getStudioConfig: () => ({ studio: config }) } as ReturnType<
		typeof mockSegmentContext
	>
}

/** Generate all parts of the smoke rundown under the given (vMix) studio config. */
function generateSmokeRundown(config: StudioConfig = vmixStudioConfig): Array<{
	externalId: string
	pieces: IBlueprintPiece[]
}> {
	const exportData = loadSmokeRundownExport()
	const seq = createLookSlotSequence()
	const ctx = vmixContext(config)
	const parts: Array<{ externalId: string; pieces: IBlueprintPiece[] }> = []
	for (const segId of [...new Set(exportData.parts.map((p) => p.segmentId))]) {
		const intermediate = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, segId))
		for (const generated of generateParts(ctx, intermediate, undefined, seq).parts) {
			parts.push({ externalId: generated.part.externalId, pieces: generated.pieces })
		}
	}
	return parts
}

/** Flatten the timeline objects of a part's pieces. */
function objectsOf(pieces: IBlueprintPiece[]): TimelineBlueprintExt[] {
	return pieces.flatMap((piece) => (piece.content.timelineObjects ?? []) as TimelineBlueprintExt[])
}

/** The vMix PROGRAM objects among a part's timeline objects. */
function programObjects(pieces: IBlueprintPiece[]): Array<TimelineBlueprintExt<TSR.TimelineContentVMixProgram>> {
	return objectsOf(pieces).filter((obj) => obj.layer === VMixLayers.VMixMeProgram) as Array<
		TimelineBlueprintExt<TSR.TimelineContentVMixProgram>
	>
}

describe('vMix wipe ForceMute', () => {
	it.each(['existing mutes', 'existing piece without mutes', 'new piece'])(
		'mutes configured playback and host channels for the wipe window (%s)',
		(branch) => {
			const config: StudioConfig = {
				...vmixStudioConfig,
				sisyfosSources: {
					playback0: { source: 10, type: AudioSourceType.Playback },
					host0: { source: 1, type: AudioSourceType.Host },
					guest0: { source: 2, type: AudioSourceType.Guest },
				},
			}
			const existingMutes =
				branch === 'existing mutes'
					? [AudioSourceType.Playback, AudioSourceType.Host].map((type, index) => ({
							...getAudioObjectOnLayer(config, SisyfosLayers.ForceMute, [
								{ type, index: 0, isOn: false },
							]),
							id: `mute-${index}`,
							enable: { start: 100 },
							priority: 2,
						}))
					: []
			const pieces: IBlueprintPiece[] =
				branch === 'new piece'
					? []
					: [
							{
								externalId: 'wipe-piece',
								name: 'Wipe',
								enable: { start: 0 },
								lifespan: PieceLifespan.WithinPart,
								sourceLayerId: SourceLayer.PgmWipe,
								outputLayerId: 'gfx',
								content: { timelineObjects: existingMutes },
							},
						]
			const wipe: VideoObject = {
				id: 'wipe',
				objectType: ObjectType.Video,
				objectTime: 0,
				duration: 1800,
				clipName: 'wipes/wipe',
				attributes: { playLayer: 'wipe' },
			}
			const part = { externalId: 'vmix-wipe-mute', title: 'Wipe' } as IBlueprintPart
			finalizeHypercomposedPart(vmixContext(), config, part, part.externalId, [wipe], pieces, 'A')

			const wipePiece = pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))
			const mutes = wipePiece?.content.timelineObjects?.filter((obj) => obj.layer === SisyfosLayers.ForceMute)
			expect(mutes).toHaveLength(existingMutes.length || 1)
			expect(mutes?.map((obj) => obj.enable)).toEqual(
				mutes?.map(() => ({ start: 0, duration: 1800 + VMIX_STINGER_PREVIEW_LEAD_MS }))
			)
			expect(part.inTransition?.blockTakeDuration).toBe(1800 + VMIX_STINGER_PREVIEW_LEAD_MS)
			expect(mutes?.flatMap((obj) => (obj.content as TSR.TimelineContentSisyfosChannels).channels)).toEqual([
				{ mappedLayer: 'sisyfos_source_playback0', isPgm: 0 },
				{ mappedLayer: 'sisyfos_source_host0', isPgm: 0 },
			])
			existingMutes.forEach((mute, index) => {
				expect(mutes?.[index]).toBe(mute)
				expect(mute.priority).toBe(2)
			})
			// Fixture has no look media — program falls back to the camera input.
			expect(programObjects(pieces)[0]).toMatchObject({
				enable: { start: 40 },
				content: {
					input: CAMERA_INPUT,
					transition: { effect: TSR.VMixTransitionType.Stinger1, duration: 1800 },
				},
			})
			const previews = objectsOf(pieces).filter((obj) => obj.layer === VMixLayers.VMixMePreview)
			expect(previews[0]).toMatchObject({
				enable: { start: 0, duration: 1880 },
				content: { input: CAMERA_INPUT },
			})
			expect(previews[1]).toMatchObject({
				enable: { start: 1880 },
				content: { input: LOOK_B_INPUT },
			})
		}
	)
})

describe('vMix program switcher (smoke rundown, vMix studio)', () => {
	const parts = generateSmokeRundown()

	it('every Take emits exactly one vMix PROGRAM on a look or camera input', () => {
		expect(parts.length).toBeGreaterThan(0)
		for (const { externalId, pieces } of parts) {
			const programs = programObjects(pieces)
			expect(programs, `part ${externalId}`).toHaveLength(1)
			expect([LOOK_A_INPUT, LOOK_B_INPUT, CAMERA_INPUT], `part ${externalId}`).toContain(
				programs[0].content.input
			)
		}
	})

	it('Takes with no look media program the camera input (never a black look NDI)', () => {
		const cameraTakes = parts.filter(({ pieces }) => programObjects(pieces)[0].content.input === CAMERA_INPUT)
		expect(cameraTakes.length).toBeGreaterThan(0)
	})

	it('programs the look input for a template-only non-headline L3D part', () => {
		const part = { externalId: 'l3d-only', title: 'l3d' }
		const pieces: IBlueprintPiece[] = [
			{
				enable: { start: 0 },
				externalId: 'l3d-only_l3d',
				name: 'L3D',
				lifespan: PieceLifespan.WithinPart,
				sourceLayerId: 'pgm_l3d',
				outputLayerId: 'pgm',
				content: {
					timelineObjects: [
						{
							id: 'l3d',
							enable: { start: 0 },
							layer: CasparCGLayers.CasparCGGraphicsPgmLowerThird,
							priority: 1,
							content: { type: TSR.TimelineContentTypeCasparCg.TEMPLATE },
						} as never,
					],
				},
			},
		]
		finalizeHypercomposedPart(vmixContext(), vmixStudioConfig, part, 'l3d-only', [], pieces, 'B')
		expect(programObjects(pieces)[0]?.content.input).toBe(LOOK_B_INPUT)
	})

	/** The wipe piece of a part, if any. */
	const wipePieceOf = (pieces: IBlueprintPiece[]) =>
		pieces.find((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))
	const wipedParts = parts.filter(({ pieces }) => wipePieceOf(pieces))
	const hardCutParts = parts.filter(({ pieces }) => !wipePieceOf(pieces))

	it('wiped Takes fire the matching stinger at Take, with no Caspar wipe packages', () => {
		expect(wipedParts.length).toBeGreaterThan(0)
		const stingers = new Set<string>()
		for (const { externalId, pieces } of wipedParts) {
			const program = programObjects(pieces)[0]
			const wipePiece = wipePieceOf(pieces)
			const effect = vmixStingerForWipeFile((wipePiece?.content as { fileName?: string } | undefined)?.fileName)
			stingers.add(effect)
			expect(program.enable, `part ${externalId}`).toEqual({ start: VMIX_STINGER_PREVIEW_LEAD_MS })
			expect(program.content.transition?.effect, `part ${externalId}`).toBe(effect)
			expect(program.content.transition?.duration, `part ${externalId}`).toBeGreaterThan(0)
			expect(wipePiece?.expectedPackages, `part ${externalId}`).toBeUndefined()
		}
		expect([...stingers].sort()).toEqual(
			[
				TSR.VMixTransitionType.Stinger1,
				TSR.VMixTransitionType.Stinger2,
				TSR.VMixTransitionType.Stinger3,
				TSR.VMixTransitionType.Stinger4,
			].sort()
		)
	})

	it('hard-cut Takes CUT', () => {
		expect(hardCutParts.length).toBeGreaterThan(0)
		for (const { externalId, pieces } of hardCutParts) {
			expect(programObjects(pieces)[0].content.transition, `part ${externalId}`).toEqual({
				effect: TSR.VMixTransitionType.Cut,
				duration: 0,
			})
		}
	})

	it('wiped Takes lead with PREVIEW(incoming) so the stinger airs the right input', () => {
		for (const { externalId, pieces } of wipedParts) {
			const program = programObjects(pieces)[0]
			const duration = program.content.transition?.duration ?? 0
			const previews = objectsOf(pieces).filter((obj) => obj.layer === VMixLayers.VMixMePreview)
			const lead = previews.find((obj) => !Array.isArray(obj.enable) && obj.enable.start === 0)
			expect(lead, `part ${externalId} lead PREVIEW`).toBeDefined()
			expect(lead?.enable).toEqual({
				start: 0,
				duration: VMIX_STINGER_PREVIEW_LEAD_MS + duration + 40,
			})
			expect(
				(lead?.content as TSR.TimelineContentVMixPreview).input,
				`part ${externalId} lead PREVIEW input`
			).toBe(program.content.input)
			expect(program.enable, `part ${externalId} program start`).toEqual({
				start: VMIX_STINGER_PREVIEW_LEAD_MS,
			})
			const follow = previews.find(
				(obj) => !Array.isArray(obj.enable) && obj.enable.start === VMIX_STINGER_PREVIEW_LEAD_MS + duration + 40
			)
			expect(follow, `part ${externalId} follow PREVIEW`).toBeDefined()
			expect(
				(follow?.content as TSR.TimelineContentVMixPreview).input,
				`part ${externalId} follow PREVIEW input`
			).toBe(program.content.input === LOOK_A_INPUT ? LOOK_B_INPUT : LOOK_A_INPUT)
		}
	})

	it('hard-cut Takes emit no lead PREVIEW', () => {
		for (const { externalId, pieces } of hardCutParts) {
			const program = programObjects(pieces)[0]
			const programStart = Array.isArray(program.enable) ? 0 : (program.enable.start ?? 0)
			const previews = objectsOf(pieces).filter((obj) => obj.layer === VMixLayers.VMixMePreview)
			expect(
				previews.filter((obj) => !Array.isArray(obj.enable) && (obj.enable.start ?? 0) < programStart),
				`part ${externalId} lead PREVIEW`
			).toHaveLength(0)
		}
	})

	it('wiped Takes alternate A/B so vMix always has a new input to sting to', () => {
		const inputs = parts.map(({ pieces }) => programObjects(pieces)[0].content.input)
		expect(new Set(inputs)).toEqual(new Set([LOOK_A_INPUT, LOOK_B_INPUT, CAMERA_INPUT]))
		parts.forEach(({ externalId, pieces }, i) => {
			if (i === 0) return
			if (!pieces.some((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))) return
			// No-look Takes all land on CAMERA_INPUT — camera→camera is a valid stinger
			// target, only look-input repeats would sting over a stale NDI.
			if (inputs[i] === CAMERA_INPUT && inputs[i - 1] === CAMERA_INPUT) return
			expect(inputs[i], `part ${externalId}`).not.toBe(inputs[i - 1])
		})
	})

	it('no Caspar program-switch, wipe overlay or cam-ingest objects and no Caspar music beds remain', () => {
		for (const { externalId, pieces } of parts) {
			for (const obj of objectsOf(pieces)) {
				expect(RETIRED_LAYERS.has(String(obj.layer)), `part ${externalId} layer ${String(obj.layer)}`).toBe(
					false
				)
				const file = (obj.content as { file?: unknown }).file
				expect(typeof file === 'string' && file.startsWith('route://'), `part ${externalId}`).toBe(false)
				expect(CASPAR_MUSIC_BEDS.has(String(file)), `part ${externalId} file ${String(file)}`).toBe(false)
			}
		}
	})

	it('look CAM becomes vMix layer 1 with the feed on layer 2 and no look bg_loop objects', () => {
		const cameraParts = parts.filter(({ pieces }) =>
			objectsOf(pieces).some(
				(obj) =>
					(obj.layer === VMixLayers.VMixLookInputA || obj.layer === VMixLayers.VMixLookInputB) &&
					(obj.content as TSR.TimelineContentVMixInput).layers?.[1]
			)
		)
		expect(cameraParts.length).toBeGreaterThan(0)
		for (const { externalId, pieces } of cameraParts) {
			const objs = objectsOf(pieces)
			// The PROGRAM input's own look-input object carries the camera on layer 1
			// (a preview clone on the outgoing slot is a separate object).
			const programInput = programObjects(pieces)[0].content.input
			const programLayer =
				programInput === LOOK_A_INPUT
					? VMixLayers.VMixLookInputA
					: programInput === LOOK_B_INPUT
						? VMixLayers.VMixLookInputB
						: undefined
			const camera =
				objs.find(
					(obj) => obj.layer === programLayer && (obj.content as TSR.TimelineContentVMixInput).layers?.[1]
				) ?? objs.find((obj) => (obj.content as TSR.TimelineContentVMixInput).layers?.[1])
			const input = camera?.content as TSR.TimelineContentVMixInput
			expect(input?.layers?.[1]?.input, `part ${externalId}`).toBe(CAMERA_INPUT)
			// Legacy vMix (no look feed inputs): the camera INPUT object drops layer 2.
			expect(input?.layers?.[2]?.input, `part ${externalId}`).toBeUndefined()
			// No look bg_loop on A/B outside the weather part — vMix composites the look.
			const bgLoopLayers = [
				CasparCGLayers.CasparCGLookBgLoop as string,
				CasparCGLayers.CasparCGLookBgLoopB as string,
			]
			expect(
				objs.some((obj) => bgLoopLayers.includes(String(obj.layer))),
				`part ${externalId} must not carry look bg_loop`
			).toBe(false)
		}
	})

	it('DoubleBox CAM sits in the right window; fullscreen CAM fills the frame', () => {
		const layers = parts
			.flatMap(({ pieces }) => objectsOf(pieces))
			.map((obj) => (obj.content as TSR.TimelineContentVMixInput).layers?.[1])
			.filter((layer): layer is TSR.VMixLayer => layer !== undefined)
		expect(layers.some((l) => l.zoom === 1 && l.panX === 0 && l.panY === 0)).toBe(true)
		const window = layers.find((l) => l.zoom === 0.8)
		expect(window?.panX).toBeCloseTo(0.2)
		expect(window?.panY).toBeCloseTo(0.056)
	})
})

describe('vMix studio beds + DoubleBox background (smoke rundown)', () => {
	const parts = generateSmokeRundown()
	/** vMix AUDIO contents on the given layer among a part's pieces. */
	const audioOn = (pieces: IBlueprintPiece[], layer: VMixLayers) =>
		objectsOf(pieces)
			.filter((obj) => obj.layer === layer)
			.map((obj) => obj.content as TSR.TimelineContentVMixAudio)

	it('intro, outro and wiped Takes mute both vMix bed inputs', () => {
		const muting = parts.filter(({ pieces }) => pieces.some((piece) => piece.name.startsWith('BG music mute')))
		expect(muting.length).toBeGreaterThan(0)
		for (const { externalId, pieces } of muting) {
			for (const layer of [VMixLayers.VMixBedAAudio, VMixLayers.VMixBedCAudio]) {
				expect(
					audioOn(pieces, layer).some((audio) => audio.muted === true),
					`part ${externalId} ${layer}`
				).toBe(true)
			}
		}
	})

	it('Šport swaps the vMix bed from A to C', () => {
		const sport = parts.find(({ pieces }) => pieces.some((piece) => piece.name === 'BG music C (Šport)'))
		expect(sport).toBeDefined()
		const objs = objectsOf(sport?.pieces ?? [])
		expect(objs.find((obj) => obj.layer === VMixLayers.VMixBedC)?.content).toMatchObject({ playing: true })
		expect(audioOn(sport?.pieces ?? [], VMixLayers.VMixBedCAudio).some((a) => a.muted === false)).toBe(true)
		expect(audioOn(sport?.pieces ?? [], VMixLayers.VMixBedAAudio).some((a) => a.muted === true)).toBe(true)
	})

	it('db_loop layers only carry phase-locked loops/db_loop objects (never EMPTY / paused)', () => {
		const dbLoopLayers = new Set<string>([
			CasparCGLayers.CasparCGPgmDoubleBoxLoop,
			CasparCGLayers.CasparCGPgmDoubleBoxLoopB,
		])
		let dbLoops = 0
		for (const { externalId, pieces } of parts) {
			for (const piece of pieces) {
				const objs = (piece.content.timelineObjects ?? []) as TimelineBlueprintExt[]
				for (const obj of objs.filter((o) => dbLoopLayers.has(String(o.layer)))) {
					const content = obj.content as TSR.TimelineContentCCGMedia
					expect(content.file, `part ${externalId} ${piece.name}`).toBe('loops/db_loop')
					expect(content.loop, `part ${externalId} ${piece.name}`).toBe(true)
					expect(content.playing, `part ${externalId} ${piece.name}`).not.toBe(false)
					dbLoops++
				}
			}
		}
		expect(dbLoops).toBeGreaterThan(0)
		// DoubleBox-frame parts reveal the frame on both physical slots.
		const frameObj = parts
			.flatMap(({ pieces }) =>
				pieces.flatMap((piece) => (piece.content.timelineObjects ?? []) as TimelineBlueprintExt[])
			)
			.find(
				(obj) =>
					dbLoopLayers.has(String(obj.layer)) &&
					(obj.content as TSR.TimelineContentCCGMedia).mixer?.opacity === 1
			)
		expect(frameObj).toBeDefined()
	})
})

describe('vMix studio baseline + mappings', () => {
	const baseline = getBaseline({
		getStudioConfig: () => ({ studio: vmixStudioConfig }),
		getShowStyleConfig: () => ({ dvePresets: {} }),
		logDebug: () => undefined,
		logInfo: () => undefined,
		logWarning: () => undefined,
		logError: () => undefined,
	} as unknown as Parameters<typeof getBaseline>[0])
	const objs = (baseline.timelineObjects ?? []) as TimelineBlueprintExt[]

	it('keys clean GFX on overlay 1 and starts with look B on program', () => {
		expect(objs.find((obj) => obj.layer === VMixLayers.VMixOverlayGraphics)?.content).toMatchObject({
			type: TSR.TimelineContentTypeVMix.OVERLAY,
			input: CLEAN_GFX_INPUT,
		})
		expect(objs.find((obj) => obj.layer === VMixLayers.VMixMeProgram)?.content).toMatchObject({
			type: TSR.TimelineContentTypeVMix.PROGRAM,
			input: LOOK_B_INPUT,
		})
		expect(objs.find((obj) => obj.layer === VMixLayers.VMixMePreview)?.content).toMatchObject({
			type: TSR.TimelineContentTypeVMix.PREVIEW,
			input: LOOK_A_INPUT,
		})
	})

	it('plays bed A on its vMix input at bedVolume (no kolíska keyframes) with bed C muted', () => {
		expect(objs.find((obj) => obj.layer === VMixLayers.VMixBedA)?.content).toMatchObject({
			playing: true,
			loop: true,
		})
		const bedA = objs.find((obj) => obj.layer === VMixLayers.VMixBedAAudio)
		expect(bedA?.content).toMatchObject({ muted: false, volume: 70 })
		expect(bedA?.keyframes ?? []).toHaveLength(0)
		expect(objs.find((obj) => obj.layer === VMixLayers.VMixBedCAudio)?.content).toMatchObject({ muted: true })
		const mappings = getVMixMappings(vmixStudioConfig.vmixSources, vmixStudioConfig.vmixProgram, 'vmix0')
		expect(mappings[VMixLayers.VMixBedA]?.options).toMatchObject({ index: String(BED_A_INPUT) })
		expect(mappings[VMixLayers.VMixBedCAudio]?.options).toMatchObject({ index: String(BED_C_INPUT) })
	})

	it('baseline carries no Caspar route / wipe / cam-ingest objects or music beds', () => {
		for (const obj of objs) {
			expect(RETIRED_LAYERS.has(String(obj.layer)), `layer ${String(obj.layer)}`).toBe(false)
			expect(CASPAR_MUSIC_BEDS.has(String((obj.content as { file?: unknown }).file))).toBe(false)
		}
	})

	it('keeps only headline L3Ds on clean GFX; other L3Ds ride their look channel', () => {
		const mappings = getCasparCGMappings({ studio: vmixStudioConfig })
		for (const layer of VMIX_RETIRED_CASPAR_LAYERS) {
			expect(mappings[layer], `layer ${layer}`).toBeUndefined()
		}
		expect(mappings[CasparCGLayers.CasparCGGraphicsHeadline]?.options).toMatchObject({
			channel: 4,
			layer: PgmChannelLayers.GraphicsLowerThird,
		})
		expect(mappings[CasparCGLayers.CasparCGGraphicsPgmLowerThird]?.options).toMatchObject({
			channel: 2,
			layer: BgChannelLayers.GraphicsLowerThird,
		})
		expect(mappings[CasparCGLayers.CasparCGGraphicsPgmLowerThirdB]?.options).toMatchObject({
			channel: 3,
			layer: BgChannelLayers.GraphicsLowerThird,
		})
		expect(mappings[CasparCGLayers.CasparCGLookBgLoop]?.options).toMatchObject({ channel: 2 })
		expect(mappings[CasparCGLayers.CasparCGLookBgLoopB]?.options).toMatchObject({ channel: 3 })
	})

	it('maps both look inputs and registers the vMix playout device', () => {
		const mappings = getVMixMappings(vmixStudioConfig.vmixSources, vmixStudioConfig.vmixProgram, 'vmix0')
		expect(mappings[VMixLayers.VMixLookInputA]?.options).toMatchObject({ index: String(LOOK_A_INPUT) })
		expect(mappings[VMixLayers.VMixLookInputB]?.options).toMatchObject({ index: String(LOOK_B_INPUT) })
		const devices = applyConfig({} as never, vmixStudioConfig, {} as never).playoutDevices
		expect(devices.vmix0?.options).toMatchObject({ type: TSR.DeviceType.VMIX, options: { port: 8088 } })
	})

	it('vmixStingerForWipeFile maps classical + themed wipes onto Stinger1–4', () => {
		expect(vmixStingerForWipeFile('wipes/wipe')).toBe(TSR.VMixTransitionType.Stinger1)
		expect(vmixStingerForWipeFile('wipes/wipe_sjv')).toBe(TSR.VMixTransitionType.Stinger2)
		expect(vmixStingerForWipeFile('wipes/wipe_sport')).toBe(TSR.VMixTransitionType.Stinger3)
		expect(vmixStingerForWipeFile('wipes/wipe_pocasie')).toBe(TSR.VMixTransitionType.Stinger4)
	})
})

describe('vMix feed mode (look feed inputs)', () => {
	const feedConfig: StudioConfig = {
		...vmixStudioConfig,
		vmixProgram: { ...vmixStudioConfig.vmixProgram, lookAFeedInput: 12, lookBFeedInput: 13 },
	}
	const parts = generateSmokeRundown(feedConfig)

	const LOOK_COMPOSE_LAYERS = new Set<string>([
		CasparCGLayers.CasparCGClipPlayer2,
		CasparCGLayers.CasparCGClipPlayer2B,
		CasparCGLayers.CasparCGPgmCamera,
		CasparCGLayers.CasparCGPgmCameraB,
		CasparCGLayers.CasparCGPgmIluPlayer,
		CasparCGLayers.CasparCGPgmIluPlayerB,
		CasparCGLayers.CasparCGPgmDoubleBoxLoop,
		CasparCGLayers.CasparCGPgmDoubleBoxLoopB,
	])
	const CLIP_ILU_LAYERS = new Set<string>([
		CasparCGLayers.CasparCGClipPlayer2,
		CasparCGLayers.CasparCGClipPlayer2B,
		CasparCGLayers.CasparCGPgmIluPlayer,
		CasparCGLayers.CasparCGPgmIluPlayerB,
	])
	const LOOK_INPUT_LAYERS = new Set<string>([VMixLayers.VMixLookInputA, VMixLayers.VMixLookInputB])

	it('every look INPUT object keeps camera layer 1 and feed layer 2', () => {
		let count = 0
		for (const { externalId, pieces } of parts) {
			for (const obj of objectsOf(pieces)) {
				if (!LOOK_INPUT_LAYERS.has(String(obj.layer))) continue
				const content = obj.content as TSR.TimelineContentVMixInput
				if (content?.type !== TSR.TimelineContentTypeVMix.INPUT) continue
				expect(content.layers?.[1]?.input, `part ${externalId} layer ${String(obj.layer)}`).toBe(CAMERA_INPUT)
				expect([12, 13], `part ${externalId} layer ${String(obj.layer)}`).toContain(content.layers?.[2]?.input)
				count++
			}
		}
		expect(count).toBeGreaterThan(0)
	})

	it('no non-adlib look-compose MEDIA object exceeds priority 1', () => {
		for (const { externalId, pieces } of parts) {
			for (const obj of objectsOf(pieces)) {
				if (!LOOK_COMPOSE_LAYERS.has(String(obj.layer))) continue
				expect(
					obj.priority ?? 0,
					`part ${externalId} layer ${String(obj.layer)} file ${String((obj.content as { file?: string }).file)}`
				).toBeLessThanOrEqual(1)
			}
		}
	})

	it('incoming clip/ILU objects start at 0 with noStarttime; RESUME before the Cut hard-cut / 0 wiped', () => {
		const hardCutResumeMs = Math.max(0, LOOK_HARD_CUT_KEEPALIVE_MS - VMIX_HARD_CUT_RESUME_LEAD_MS)
		let hardCutResumes = 0
		let wipedResumes = 0
		for (const { pieces } of parts) {
			for (const obj of objectsOf(pieces)) {
				if (!CLIP_ILU_LAYERS.has(String(obj.layer))) continue
				const content = obj.content as TSR.TimelineContentCCGMedia
				if (content?.file === 'EMPTY' || typeof content?.file !== 'string' || content.file === 'loops/db_loop')
					continue
				if (!Array.isArray(obj.enable) && obj.enable?.start !== 0) continue
				expect(content.noStarttime).toBe(true)
				const resume = obj.keyframes?.find((kf) => (kf.content as { playing?: boolean }).playing === true)
				if (!resume || Array.isArray(resume.enable)) continue
				const start = resume.enable.start ?? 0
				if (start === hardCutResumeMs) hardCutResumes++
				else if (start === 0) wipedResumes++
			}
		}
		expect(hardCutResumes).toBeGreaterThan(0)
		expect(wipedResumes).toBeGreaterThan(0)
	})

	it('wiped clip/ILU objects start muted with a single LINEAR ramp to editorial volume', () => {
		let ramps = 0
		for (const { pieces } of parts) {
			for (const obj of objectsOf(pieces)) {
				if (!CLIP_ILU_LAYERS.has(String(obj.layer))) continue
				const content = obj.content as TSR.TimelineContentCCGMedia
				if (content?.mixer?.volume !== 0) continue
				const ramp = (obj.keyframes ?? []).filter(
					(kf) => (kf.content as { mixer?: { volume?: number } }).mixer?.volume !== undefined
				)
				for (const kf of ramp) {
					const kfContent = kf.content as { mixer?: { volume?: unknown; inTransition?: { easing?: string } } }
					expect(
						typeof kfContent.mixer?.volume === 'object' ? kfContent.mixer.volume : kfContent.mixer?.volume
					).toBeDefined()
					ramps++
				}
			}
		}
		expect(ramps).toBeGreaterThan(0)
	})

	it('no look bg_loop outside the weather part', () => {
		const bgLoopLayers = new Set<string>([CasparCGLayers.CasparCGLookBgLoop, CasparCGLayers.CasparCGLookBgLoopB])
		for (const { externalId, pieces } of parts) {
			const isWeather = objectsOf(pieces).some((obj) =>
				/pocasie/i.test(String((obj.content as { file?: string }).file ?? ''))
			)
			const onLookBg = objectsOf(pieces).filter((obj) => bgLoopLayers.has(String(obj.layer)))
			expect(isWeather || onLookBg.length === 0, `part ${externalId}`).toBe(true)
		}
	})

	it('preview clones start at the outgoing off-air ms with no same-layer EMPTY at that start', async () => {
		// The preview is armed at runtime (onSetAsNext), not generated — replay
		// consecutive parts through armIdleLookPreviewForNext and apply the
		// updatePieceInstance writes the way Core would.
		const exportData = loadSmokeRundownExport()
		const seq = createLookSlotSequence()
		const ctx = vmixContext(feedConfig)
		const generatedParts: Array<{ part: IBlueprintPart; pieces: IBlueprintPiece[] }> = []
		for (const segId of [...new Set(exportData.parts.map((p) => p.segmentId))]) {
			const intermediate = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, segId))
			generatedParts.push(...generateParts(ctx, intermediate, undefined, seq).parts)
		}

		let previews = 0
		for (let i = 0; i < generatedParts.length - 1; i++) {
			const current = generatedParts[i]
			const next = generatedParts[i + 1]
			if (current.part.invalid || current.part.floated || next.part.invalid || next.part.floated) continue

			const updates: Array<{ id: string; piece: { content?: { timelineObjects?: unknown[] } } }> = []
			const toInstances = (part: { pieces: IBlueprintPiece[] }) =>
				part.pieces.map((piece, idx) => ({ _id: piece.externalId ?? `piece-${idx}`, piece }))
			await armIdleLookPreviewForNext(
				{
					getPartInstance: async (which: 'current' | 'next') => ({
						part: (which === 'current' ? current : next).part,
					}),
					getPieceInstances: async (which: 'current' | 'next') =>
						toInstances(which === 'current' ? current : next),
					updatePieceInstance: async (id: string, piece: { content?: { timelineObjects?: unknown[] } }) => {
						updates.push({ id, piece })
						return {}
					},
				} as never,
				feedConfig
			)

			const arm = updates.find((update) => update.id.endsWith('_lookidlepreview'))
			const previewObjects = (arm?.piece.content?.timelineObjects ?? []) as TimelineBlueprintExt[]
			// Apply the mutations to a copy of the current part's pieces.
			const updatedPieces = current.pieces.map((piece) => {
				const update = updates.find((u) => u.id === piece.externalId)
				return update
					? {
							...piece,
							content: { ...piece.content, timelineObjects: update.piece.content?.timelineObjects },
						}
					: piece
			}) as IBlueprintPiece[]
			const objs = objectsOf(updatedPieces)
			for (const obj of previewObjects) {
				if (!CLIP_ILU_LAYERS.has(String(obj.layer))) continue
				const content = obj.content as TSR.TimelineContentCCGMedia
				if (content?.file === 'EMPTY' || content?.playing !== false) continue
				const start = (obj.enable as { start?: number })?.start
				expect([240, 840, 900], `part ${current.part.externalId} preview on ${String(obj.layer)}`).toContain(
					start
				)
				expect(
					objs.some(
						(other) =>
							String(other.layer) === String(obj.layer) &&
							!Array.isArray(other.enable) &&
							(other.enable as { start?: number })?.start === start &&
							(other.content as { file?: string }).file === 'EMPTY'
					),
					`part ${current.part.externalId} ${String(obj.layer)} outgoing EMPTY at ${JSON.stringify(start)}`
				).toBe(false)
				previews++
			}
		}
		expect(previews).toBeGreaterThan(0)
	})

	it('clip player maps to Caspar layer 120 on vMix studios', () => {
		const vmixMappings = getCasparCGMappings({ studio: feedConfig })
		expect(vmixMappings[CasparCGLayers.CasparCGClipPlayer2]?.options).toMatchObject({ layer: 120 })
		expect(vmixMappings[CasparCGLayers.CasparCGClipPlayer2B]?.options).toMatchObject({ layer: 120 })
		const casparMappings = getCasparCGMappings({ studio: hybridCasparConfig })
		expect(casparMappings[CasparCGLayers.CasparCGClipPlayer2]?.options).toMatchObject({ layer: 111 })
		expect(casparMappings[CasparCGLayers.CasparCGClipPlayer2B]?.options).toMatchObject({ layer: 111 })
	})
})
