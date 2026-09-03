import { BlueprintResultPart } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { GfxProps, PartProps } from '../definitions/index.js'
import { parseClipsFromObjects, parseLayeredVideosFromObjects } from '../helpers/clips.js'
import { parseGraphicsFromObjects } from '../helpers/graphics.js'
import { createScriptPiece } from '../helpers/script.js'
import { parseConfig } from '../helpers/config.js'
import { LookSlot, finalizeHypercomposedPart } from '../helpers/pgmLook.js'

export function generateGfxPart(
	context: PartContext,
	part: PartProps<GfxProps>,
	lookSlot: LookSlot = 'A'
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

	const clips = parseClipsFromObjects(context, config, part.objects)

	// ILU parts are timed for Take (expectedDuration) but must not AUTO — operators
	// click Take to the next part/segment. Other GFX (e.g. téma) keep autoNext.
	const isIlu = /ilu/i.test(part.rawType ?? '')

	const result: BlueprintResultPart = {
		part: {
			externalId: part.payload.externalId,
			title: part.payload.name,

			expectedDuration: part.payload.duration,
			autoNext: !isIlu,
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
		lookSlot
	)
	return result
}
