import { BlueprintResultPart } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { GfxProps, PartProps } from '../definitions/index.js'
import { parseClipsFromObjects, parseLayeredVideosFromObjects, partHasOutroOverlay } from '../helpers/clips.js'
import { parseGraphicsFromObjects, partHasHeadlineIlu } from '../helpers/graphics.js'
import { createHeadlineSfxPiece } from '../helpers/headlineSfx.js'
import { createScriptPiece } from '../helpers/script.js'
import { parseConfig } from '../helpers/config.js'
import { LookSlot, finalizeHypercomposedPart } from '../helpers/pgmLook.js'
import { createOutroBackgroundMusicMutePiece } from '../helpers/backgroundMusic.js'
import { autoNextForced, autoNextFromRe, autoNextPublicData, FORCE_WEATHER_AUTO_NEXT } from '../helpers/autoNext.js'

function normalizeDiacritics(value: string): string {
	return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** True when this GFX part is Počasie / weather (AUTO-take allowed). */
function partHasWeatherGraphic(part: PartProps<GfxProps>): boolean {
	const name = normalizeDiacritics(part.payload.name ?? '')
	const raw = normalizeDiacritics(part.rawType ?? '')
	if (/pocasie|weather/.test(name) || /pocasie|weather/.test(raw)) return true
	return part.objects.some((obj) => {
		const clip = normalizeDiacritics(String((obj as { clipName?: string }).clipName ?? ''))
		return clip === 'gfx/pocasie' || clip === 'gfx/weather'
	})
}

export function generateGfxPart(
	context: PartContext,
	part: PartProps<GfxProps>,
	lookSlot: LookSlot = 'B',
	previousLookSlot?: LookSlot
): BlueprintResultPart {
	const config = parseConfig(context).studio

	const graphics = parseGraphicsFromObjects(config, part.objects, context)
	if (!graphics.pieces.length) {
		context.notifyUserError('Missing primary graphic on timeline')
	}

	const pieces = [...graphics.pieces]
	const layeredVideos = parseLayeredVideosFromObjects(context, config, part.objects)
	if (layeredVideos.length) pieces.push(...layeredVideos)

	const scriptPiece = createScriptPiece(part.payload.script, part.payload.externalId)
	if (scriptPiece) pieces.push(scriptPiece)

	if (partHasHeadlineIlu(part.objects)) {
		pieces.push(createHeadlineSfxPiece(context, config, part.payload.externalId))
	}

	if (partHasOutroOverlay(part.objects)) {
		pieces.push(
			createOutroBackgroundMusicMutePiece(
				config,
				part.payload.externalId,
				part.payload.duration > 0 ? part.payload.duration : undefined
			)
		)
	}

	const clips = parseClipsFromObjects(context, config, part.objects)

	// ILU never uses the weather force — operators Take ILU.
	const isIlu = /ilu/i.test(part.rawType ?? '')
	const isWeather = partHasWeatherGraphic(part)
	const expectedDuration = part.payload.duration > 0 ? part.payload.duration : undefined
	const autoNext = Boolean(
		FORCE_WEATHER_AUTO_NEXT && isWeather && !isIlu
			? autoNextForced(expectedDuration)
			: autoNextFromRe(part.payload, expectedDuration)
	)
	const result: BlueprintResultPart = {
		part: {
			externalId: part.payload.externalId,
			title: part.payload.name,

			expectedDuration,
			autoNext,
			publicData: autoNextPublicData(part.payload, autoNext),
		},
		pieces,
		adLibPieces: [...graphics.adLibPieces, ...clips],
		actions: [],
	}
	finalizeHypercomposedPart(
		context,
		config,
		result.part,
		part.payload.externalId,
		part.objects,
		result.pieces,
		lookSlot,
		previousLookSlot,
		part.rawType
	)
	return result
}
