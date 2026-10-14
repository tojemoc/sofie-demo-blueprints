import { describe, expect, it, vi } from 'vitest'
import {
	CameraProps,
	DVEProps,
	GfxProps,
	IntroProps,
	LayeredVideoProps,
	PartProps,
	PartType,
	RemoteProps,
	TitlesProps,
	VOProps,
	VTProps,
} from '../base/showstyle/definitions/index.js'
import { generateCameraPart } from '../base/showstyle/part-adapters/camera.js'
import { generateDVEPart } from '../base/showstyle/part-adapters/dve.js'
import { generateGfxPart } from '../base/showstyle/part-adapters/gfx.js'
import { generateIntroPart } from '../base/showstyle/part-adapters/intro.js'
import { generateLayeredVideoPart } from '../base/showstyle/part-adapters/layeredVideo.js'
import { generateRemotePart } from '../base/showstyle/part-adapters/remote.js'
import { generateOpenerPart } from '../base/showstyle/part-adapters/titles.js'
import { generateVOPart } from '../base/showstyle/part-adapters/vo.js'
import { generateVTPart } from '../base/showstyle/part-adapters/vt.js'
import { convertIngestData } from '../base/showstyle/sofie-editor-parsers/index.js'
import { syncIngestUpdateToPartInstance } from '../base/showstyle/syncIngestUpdateToPartInstance.js'
import { createCountupRevealClaim } from '../base/showstyle/helpers/countupReveal.js'
import { PartContext } from '../common/context.js'
import { ObjectType } from '../common/definitions/objects.js'
import { SourceType } from '../base/studio/helpers/config.js'
import { mockIngestContext, mockSegmentContext } from './helpers/smokeRundownIngest.js'

const ctx = () => new PartContext(mockSegmentContext(), 'part-auto')

const graphic = {
	id: 'g1',
	objectType: ObjectType.Graphic,
	objectTime: 0,
	duration: 8000,
	clipName: 'gfx/l3d-headline',
	attributes: {},
}

describe('RE autoNext is the source of truth', () => {
	it('copies payload.autoNext through the sofie-editor parser', () => {
		const segment = convertIngestData(mockIngestContext, {
			externalId: 'seg',
			name: 'Story',
			payload: {
				rundownId: 'rd',
				externalId: 'seg',
				rank: 0,
				name: 'Story',
				float: false,
				type: 'story',
			},
			parts: [
				{
					externalId: 'part-syn',
					name: 'SYN',
					payload: {
						segmentId: 'seg',
						externalId: 'part-syn',
						rank: 0,
						name: 'SYN',
						type: 'SYN',
						float: false,
						script: 'hello',
						duration: 12,
						autoNext: true,
						pieces: [
							{
								id: 'v1',
								objectType: 'video',
								objectTime: 0,
								duration: 12,
								clipName: '',
								attributes: { fileName: 'clips/syn.mp4' },
							},
						],
					},
				},
			],
		} as never)

		expect(segment.parts[0]?.payload.autoNext).toBe(true)
		expect(segment.parts[0]?.type).toBe(PartType.VO)
	})

	it('VO: duration > 0 + AUTO off => autoNext false', () => {
		const part: PartProps<VOProps> = {
			type: PartType.VO,
			rawType: 'SYN',
			rawTitle: 'SYN',
			payload: {
				externalId: 'syn',
				name: 'SYN',
				duration: 8000,
				clipProps: { fileName: 'clips/syn.mp4', duration: 8000 },
			},
			objects: [],
		}
		expect(generateVOPart(ctx(), part).part.autoNext).toBe(false)
	})

	it('VO: AUTO on + duration => autoNext true', () => {
		const part: PartProps<VOProps> = {
			type: PartType.VO,
			rawType: 'SYN',
			rawTitle: 'SYN',
			payload: {
				externalId: 'syn',
				name: 'SYN',
				duration: 8000,
				autoNext: true,
				clipProps: { fileName: 'clips/syn.mp4', duration: 8000 },
			},
			objects: [],
		}
		expect(generateVOPart(ctx(), part).part.autoNext).toBe(true)
	})

	it('VO: AUTO on uses a resolved clip duration when the part has no editorial duration', () => {
		const part: PartProps<VOProps> = {
			type: PartType.VO,
			rawType: 'SYN',
			rawTitle: 'SYN',
			payload: {
				externalId: 'syn',
				name: 'SYN',
				duration: 0,
				autoNext: true,
				clipProps: { fileName: 'clips/syn.mp4', duration: 15000, sourceDuration: 15000 },
			},
			objects: [],
		}
		const result = generateVOPart(ctx(), part)
		expect(result.part.autoNext).toBe(true)
		expect(result.part.expectedDuration).toBe(15000)
	})

	it('VO: AUTO on + no resolved duration => autoNext false', () => {
		const part: PartProps<VOProps> = {
			type: PartType.VO,
			rawType: 'SYN',
			rawTitle: 'SYN',
			payload: {
				externalId: 'syn',
				name: 'SYN',
				duration: 0,
				autoNext: true,
				clipProps: { fileName: 'clips/syn.mp4' },
			},
			objects: [],
		}
		const result = generateVOPart(ctx(), part)
		expect(result.part.autoNext).toBe(false)
		expect(result.part.expectedDuration).toBeUndefined()
	})

	it('VT: duration + AUTO off => autoNext false', () => {
		const part: PartProps<VTProps> = {
			type: PartType.VT,
			rawType: 'VT',
			rawTitle: 'VT',
			payload: {
				externalId: 'vt',
				name: 'VT',
				duration: 5000,
				clipProps: { fileName: 'clips/vt.mp4', duration: 5000 },
			},
			objects: [],
		}
		expect(generateVTPart(ctx(), part).part.autoNext).toBe(false)
	})

	it('VT: AUTO on + duration => autoNext true', () => {
		const part: PartProps<VTProps> = {
			type: PartType.VT,
			rawType: 'VT',
			rawTitle: 'VT',
			payload: {
				externalId: 'vt',
				name: 'VT',
				duration: 5000,
				autoNext: true,
				clipProps: { fileName: 'clips/vt.mp4', duration: 5000 },
			},
			objects: [],
		}
		expect(generateVTPart(ctx(), part).part.autoNext).toBe(true)
	})

	it('VT: AUTO on + no resolved duration => autoNext false', () => {
		const part: PartProps<VTProps> = {
			type: PartType.VT,
			rawType: 'VT',
			rawTitle: 'VT',
			payload: {
				externalId: 'vt',
				name: 'VT',
				duration: 0,
				autoNext: true,
				clipProps: { fileName: 'clips/vt.mp4' },
			},
			objects: [],
		}
		expect(generateVTPart(ctx(), part).part.autoNext).toBe(false)
	})

	it('LayeredVideo: AUTO off with duration => autoNext false', () => {
		const part: PartProps<LayeredVideoProps> = {
			type: PartType.LayeredVideo,
			rawType: 'GFX',
			rawTitle: 'wipe',
			payload: { externalId: 'lv', name: 'wipe', duration: 2500 },
			objects: [],
		}
		expect(generateLayeredVideoPart(ctx(), part).part.autoNext).toBe(false)
	})

	it('LayeredVideo: AUTO on requires a resolved duration', () => {
		const part: PartProps<LayeredVideoProps> = {
			type: PartType.LayeredVideo,
			rawType: 'GFX',
			rawTitle: 'wipe',
			payload: { externalId: 'lv', name: 'wipe', duration: 2500, autoNext: true },
			objects: [],
		}
		expect(generateLayeredVideoPart(ctx(), part).part.autoNext).toBe(true)
		part.payload.duration = 0
		expect(generateLayeredVideoPart(ctx(), part).part.autoNext).toBe(false)
	})

	it('Camera / Remote follow RE AUTO', () => {
		const cam: PartProps<CameraProps> = {
			type: PartType.Camera,
			rawType: 'Cam',
			rawTitle: 'Cam',
			payload: {
				externalId: 'cam',
				name: 'Cam',
				duration: 8000,
				input: { id: 1, type: SourceType.Camera },
			},
			objects: [],
		}
		expect(generateCameraPart(ctx(), cam, createCountupRevealClaim()).part.autoNext).toBe(false)
		cam.payload.autoNext = true
		expect(generateCameraPart(ctx(), cam, createCountupRevealClaim()).part.autoNext).toBe(true)
		cam.payload.duration = 0
		expect(generateCameraPart(ctx(), cam, createCountupRevealClaim()).part.autoNext).toBe(false)

		const rem: PartProps<RemoteProps> = {
			type: PartType.Remote,
			rawType: 'Remote',
			rawTitle: 'Remote',
			payload: {
				externalId: 'rem',
				name: 'Remote',
				duration: 8000,
				autoNext: true,
				input: { id: 1, type: SourceType.Remote },
			},
			objects: [],
		}
		expect(generateRemotePart(ctx(), rem).part.autoNext).toBe(true)
		delete rem.payload.autoNext
		expect(generateRemotePart(ctx(), rem).part.autoNext).toBe(false)
		rem.payload.autoNext = true
		rem.payload.duration = 0
		expect(generateRemotePart(ctx(), rem).part.autoNext).toBe(false)
	})

	it('DVE follows RE AUTO and requires a duration', () => {
		const segmentContext = mockSegmentContext()
		const dveContext = new PartContext(
			{
				...segmentContext,
				getShowStyleConfig: () =>
					({
						dvePresets: {
							test: {
								name: 'test',
								boxes: 0,
								preset: JSON.stringify({ boxes: [], properties: {}, border: {} }),
							},
						},
					}) as never,
			},
			'part-auto'
		)
		const part: PartProps<DVEProps> = {
			type: PartType.DVE,
			rawType: 'DVE',
			rawTitle: 'DVE',
			payload: { externalId: 'dve', name: 'DVE', duration: 8000, layout: '', inputs: [] },
			objects: [],
		}
		expect(generateDVEPart(dveContext, part).part.autoNext).toBe(false)
		part.payload.autoNext = true
		expect(generateDVEPart(dveContext, part).part.autoNext).toBe(true)
		part.payload.duration = 0
		expect(generateDVEPart(dveContext, part).part.autoNext).toBe(false)
	})

	it('ILU GFX: AUTO off + duration => autoNext false; AUTO on => true', () => {
		const part: PartProps<GfxProps> = {
			type: PartType.GFX,
			rawType: 'ILU',
			rawTitle: 'ILU',
			payload: {
				externalId: 'ilu',
				name: 'ILU',
				duration: 8000,
				graphic: graphic as never,
			},
			objects: [graphic as never],
		}
		expect(generateGfxPart(ctx(), part).part.autoNext).toBe(false)
		part.payload.autoNext = true
		expect(generateGfxPart(ctx(), part).part.autoNext).toBe(true)
		part.payload.duration = 0
		expect(generateGfxPart(ctx(), part).part.autoNext).toBe(false)
	})

	it('Weather GFX is not forced AUTO; it follows RE autoNext', () => {
		const part: PartProps<GfxProps> = {
			type: PartType.GFX,
			rawType: 'GFX',
			rawTitle: 'Počasie',
			payload: {
				externalId: 'wx',
				name: 'Počasie',
				duration: 10000,
				graphic: { ...graphic, clipName: 'gfx/pocasie' } as never,
			},
			objects: [{ ...graphic, clipName: 'gfx/pocasie' } as never],
		}
		const result = generateGfxPart(ctx(), part)
		expect(result.part.autoNext).toBe(false)
		expect(result.part.publicData).toBeUndefined()
		part.payload.autoNext = true
		const withRe = generateGfxPart(ctx(), part)
		expect(withRe.part.autoNext).toBe(true)
		expect(withRe.part.publicData).toBeUndefined()
	})

	it('Intro / titles force AUTO when a duration is present', () => {
		const intro: PartProps<IntroProps> = {
			type: PartType.Intro,
			rawType: 'Intro',
			rawTitle: 'Intro',
			payload: {
				externalId: 'intro',
				name: 'Intro',
				duration: 5000,
				clipProps: { fileName: 'assets/intro', duration: 5000 },
			},
			objects: [],
		}
		const introResult = generateIntroPart(ctx(), intro)
		expect(introResult.part.autoNext).toBe(true)
		expect(introResult.part.publicData).toEqual({ autoNextSource: 'blueprint' })

		const titles: PartProps<TitlesProps> = {
			type: PartType.Titles,
			rawType: 'Titles',
			rawTitle: 'Titles',
			payload: { externalId: 'opener', name: 'Titles', duration: 4000, variant: 'default' },
			objects: [],
		}
		const titlesResult = generateOpenerPart(ctx(), titles)
		expect(titlesResult.part.autoNext).toBe(true)
		expect(titlesResult.part.publicData).toEqual({ autoNextSource: 'blueprint' })
		titles.payload.duration = 0
		expect(generateOpenerPart(ctx(), titles).part.autoNext).toBe(false)
	})

	it('syncIngestUpdateToPartInstance copies autoNext and expectedDuration', () => {
		const updatePartInstance = vi.fn()
		syncIngestUpdateToPartInstance(
			{ updatePartInstance } as never,
			{} as never,
			{ part: { autoNext: true, expectedDuration: 8000 } } as never,
			'current',
			{} as never
		)
		expect(updatePartInstance).toHaveBeenCalledWith({ autoNext: true, expectedDuration: 8000 })

		syncIngestUpdateToPartInstance(
			{ updatePartInstance } as never,
			{} as never,
			{ part: { autoNext: false } } as never,
			'next',
			{} as never
		)
		expect(updatePartInstance).toHaveBeenCalledWith({ autoNext: false, expectedDuration: 0 })
	})
})
