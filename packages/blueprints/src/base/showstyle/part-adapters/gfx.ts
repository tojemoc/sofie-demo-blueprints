import { BlueprintResultPart } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { GfxProps, PartProps } from '../definitions/index.js'
import { parseClipsFromObjects, parseLayeredVideosFromObjects, partHasOutroOverlay } from '../helpers/clips.js'
import { parseGraphicsFromObjects, partHasHeadlineIlu } from '../helpers/graphics.js'
import { createHeadlineSfxPiece } from '../helpers/headlineSfx.js'
import { createScriptPiece } from '../helpers/script.js'
import { parseConfig } from '../helpers/config.js'
import { LookSlot, finalizeHypercomposedPart } from '../helpers/pgmLook.js'
import { casparOwnsMusicBeds, createOutroBackgroundMusicMutePiece } from '../helpers/backgroundMusic.js'
import { autoNextFromRe, autoNextPublicData } from '../helpers/autoNext.js'

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

	if (casparOwnsMusicBeds(config) && partHasOutroOverlay(part.objects)) {
		pieces.push(
			createOutroBackgroundMusicMutePiece(
				config,
				part.payload.externalId,
				part.payload.duration > 0 ? part.payload.duration : undefined
			)
		)
	}

	const clips = parseClipsFromObjects(context, config, part.objects)

	const expectedDuration = part.payload.duration > 0 ? part.payload.duration : undefined
	const autoNext = autoNextFromRe(part.payload, expectedDuration)
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
