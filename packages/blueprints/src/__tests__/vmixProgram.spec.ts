import { IBlueprintPiece, TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { BG_MUSIC_A_FILE, BG_MUSIC_C_FILE } from '../base/showstyle/helpers/backgroundMusic.js'
import { createLookSlotSequence } from '../base/showstyle/helpers/pgmLook.js'
import { vmixStingerForWipeFile } from '../base/showstyle/helpers/visionMixer.js'
import { generateParts } from '../base/showstyle/part-adapters/index.js'
import { getBaseline } from '../base/showstyle/rundown/baseline.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { SourceLayer } from '../base/showstyle/applyconfig/layers.js'
import { applyConfig } from '../base/studio/applyConfig/index.js'
import { VMIX_RETIRED_CASPAR_LAYERS, getCasparCGMappings } from '../base/studio/applyConfig/mappings/casparcg.js'
import { PgmChannelLayers } from '../base/studio/applyConfig/mappings/casparcgLayers.js'
import { getVMixMappings } from '../base/studio/applyConfig/mappings/vmix.js'
import { SourceType, StudioConfig, VisionMixerDevice } from '../base/studio/helpers/config.js'
import { CasparCGLayers, VMixLayers } from '../base/studio/layers.js'
import { TimelineBlueprintExt } from '../base/studio/customTypes.js'
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

const vmixStudioConfig: StudioConfig = {
	...hybridCasparConfig,
	visionMixer: { type: VisionMixerDevice.VMix, host: '127.0.0.1', port: 8088, deviceId: 'vmix0' },
	casparcg: {
		...hybridCasparConfig.casparcg,
		hypercomposed: { ledChannel: 1, pgmChannel: 4, bgChannelA: 2, bgChannelB: 3 },
	},
	vmixSources: {
		camera1: { input: CAMERA_INPUT, type: SourceType.Camera },
		lookA: { input: LOOK_A_INPUT, type: SourceType.MediaPlayer },
		lookB: { input: LOOK_B_INPUT, type: SourceType.MediaPlayer },
		cleanGfx: { input: CLEAN_GFX_INPUT, type: SourceType.Graphics },
	},
}

const RETIRED_LAYERS = new Set<string>(VMIX_RETIRED_CASPAR_LAYERS)
const CASPAR_MUSIC_BEDS = new Set<string>([BG_MUSIC_A_FILE, BG_MUSIC_C_FILE])

function vmixContext() {
	return { ...mockSegmentContext(), getStudioConfig: () => ({ studio: vmixStudioConfig }) } as ReturnType<
		typeof mockSegmentContext
	>
}

function generateSmokeRundown(): Array<{ externalId: string; pieces: IBlueprintPiece[] }> {
	const exportData = loadSmokeRundownExport()
	const seq = createLookSlotSequence()
	const ctx = vmixContext()
	const parts: Array<{ externalId: string; pieces: IBlueprintPiece[] }> = []
	for (const segId of [...new Set(exportData.parts.map((p) => p.segmentId))]) {
		const intermediate = convertIngestData(mockIngestContext, smokeExportToIngestSegment(exportData, segId))
		for (const generated of generateParts(ctx, intermediate, undefined, seq).parts) {
			parts.push({ externalId: generated.part.externalId, pieces: generated.pieces })
		}
	}
	return parts
}

function objectsOf(pieces: IBlueprintPiece[]): TimelineBlueprintExt[] {
	return pieces.flatMap((piece) => (piece.content.timelineObjects ?? []) as TimelineBlueprintExt[])
}

function programObjects(pieces: IBlueprintPiece[]): Array<TimelineBlueprintExt<TSR.TimelineContentVMixProgram>> {
	return objectsOf(pieces).filter((obj) => obj.layer === VMixLayers.VMixMeProgram) as Array<
		TimelineBlueprintExt<TSR.TimelineContentVMixProgram>
	>
}

describe('vMix program switcher (smoke rundown, vMix studio)', () => {
	const parts = generateSmokeRundown()

	it('every Take emits exactly one vMix PROGRAM on a look input', () => {
		expect(parts.length).toBeGreaterThan(0)
		for (const { externalId, pieces } of parts) {
			const programs = programObjects(pieces)
			expect(programs, `part ${externalId}`).toHaveLength(1)
			expect([LOOK_A_INPUT, LOOK_B_INPUT], `part ${externalId}`).toContain(programs[0].content.input)
		}
	})

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
			expect(program.enable, `part ${externalId}`).toEqual({ start: 0 })
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

	it('wiped Takes alternate A/B so vMix always has a new input to sting to', () => {
		const inputs = parts.map(({ pieces }) => programObjects(pieces)[0].content.input)
		expect(new Set(inputs)).toEqual(new Set([LOOK_A_INPUT, LOOK_B_INPUT]))
		parts.forEach(({ externalId, pieces }, i) => {
			if (i === 0) return
			if (!pieces.some((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))) return
			expect(inputs[i], `part ${externalId}`).not.toBe(inputs[i - 1])
		})
	})

	it('no Caspar program-switch, wipe overlay or cam-ingest objects and no Caspar music beds remain', () => {
		for (const { externalId, pieces } of parts) {
			for (const obj of objectsOf(pieces)) {
				expect(RETIRED_LAYERS.has(String(obj.layer)), `part ${externalId} layer ${String(obj.layer)}`).toBe(false)
				const file = (obj.content as { file?: unknown }).file
				expect(typeof file === 'string' && file.startsWith('route://'), `part ${externalId}`).toBe(false)
				expect(CASPAR_MUSIC_BEDS.has(String(file)), `part ${externalId} file ${String(file)}`).toBe(false)
			}
		}
	})

	it('look CAM becomes vMix layer 1 on the look input with the look bg_loop hidden', () => {
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
			const camera = objs.find((obj) => (obj.content as TSR.TimelineContentVMixInput).layers?.[1])
			const layer = (camera?.content as TSR.TimelineContentVMixInput).layers?.[1]
			expect(layer?.input, `part ${externalId}`).toBe(CAMERA_INPUT)
			const bgLoopLayer =
				camera?.layer === VMixLayers.VMixLookInputA
					? CasparCGLayers.CasparCGLookBgLoop
					: CasparCGLayers.CasparCGLookBgLoopB
			const hidden = objs.find((obj) => obj.layer === bgLoopLayer)
			expect((hidden?.content as TSR.TimelineContentCCGMedia)?.mixer?.opacity, `part ${externalId}`).toBe(0)
			// vMix input matches the PROGRAM input this Take brings live.
			const lookInput = camera?.layer === VMixLayers.VMixLookInputA ? LOOK_A_INPUT : LOOK_B_INPUT
			expect(programObjects(pieces)[0].content.input, `part ${externalId}`).toBe(lookInput)
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
	})

	it('baseline carries no Caspar route / wipe / cam-ingest objects or music beds', () => {
		for (const obj of objs) {
			expect(RETIRED_LAYERS.has(String(obj.layer)), `layer ${String(obj.layer)}`).toBe(false)
			expect(CASPAR_MUSIC_BEDS.has(String((obj.content as { file?: unknown }).file))).toBe(false)
		}
	})

	it('mappings drop the retired Caspar layers and put look L3Ds on the clean-GFX channel', () => {
		const mappings = getCasparCGMappings({ studio: vmixStudioConfig })
		for (const layer of VMIX_RETIRED_CASPAR_LAYERS) {
			expect(mappings[layer], `layer ${layer}`).toBeUndefined()
		}
		expect(mappings[CasparCGLayers.CasparCGGraphicsPgmLowerThird]?.options).toMatchObject({
			channel: 4,
			layer: PgmChannelLayers.GraphicsLowerThird,
		})
		expect(mappings[CasparCGLayers.CasparCGGraphicsPgmLowerThirdB]?.options).toMatchObject({
			channel: 4,
			layer: PgmChannelLayers.GraphicsLowerThirdB,
		})
		expect(mappings[CasparCGLayers.CasparCGLookBgLoop]?.options).toMatchObject({ channel: 2 })
		expect(mappings[CasparCGLayers.CasparCGLookBgLoopB]?.options).toMatchObject({ channel: 3 })
	})

	it('maps both look inputs and registers the vMix playout device', () => {
		const mappings = getVMixMappings(vmixStudioConfig.vmixSources, 'vmix0')
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
