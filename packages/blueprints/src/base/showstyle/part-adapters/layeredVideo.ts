import { BlueprintResultPart } from '@sofie-automation/blueprints-integration'

import { PartContext } from '../../../common/context.js'
import { LayeredVideoProps, PartProps } from '../definitions/index.js'
import { autoNextFromRe } from '../helpers/autoNext.js'
import { createOutroBackgroundMusicMutePiece } from '../helpers/backgroundMusic.js'
import { parseLayeredVideosFromObjects, partHasOutroOverlay } from '../helpers/clips.js'
import { parseConfig } from '../helpers/config.js'
import { finalizeHypercomposedPart, findWipeVideoObject, LookSlot } from '../helpers/pgmLook.js'
import { createScriptPiece } from '../helpers/script.js'

/**
 * Video-only wipe / bg-loop parts (no graphic, no take-over VT/VO clip).
 */
export function generateLayeredVideoPart(
	context: PartContext,
	part: PartProps<LayeredVideoProps>,
	lookSlot: LookSlot = 'B',
	previousLookSlot?: LookSlot
): BlueprintResultPart {
	const config = parseConfig(context).studio

	const layeredVideos = parseLayeredVideosFromObjects(context, config, part.objects)
	if (!layeredVideos.length && !findWipeVideoObject(part.objects)) {
		context.notifyUserError('Missing wipe or bg-loop video on timeline')
	}

	const pieces = [...layeredVideos]
	const scriptPiece = createScriptPiece(part.payload.script, part.payload.externalId)
	if (scriptPiece) pieces.push(scriptPiece)

	if (partHasOutroOverlay(part.objects)) {
		pieces.push(
			createOutroBackgroundMusicMutePiece(
				config,
				part.payload.externalId,
				part.payload.duration > 0 ? part.payload.duration : undefined
			)
		)
	}

	const expectedDuration = part.payload.duration > 0 ? part.payload.duration : undefined
	const result: BlueprintResultPart = {
		part: {
			externalId: part.payload.externalId,
			title: part.payload.name,
			expectedDuration,
			autoNext: autoNextFromRe(part.payload, expectedDuration),
		},
		pieces,
		adLibPieces: [],
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
		part.rawType,
		result.adLibPieces
	)
	return result
}
