import { BlueprintResultPart } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { LayeredVideoProps, PartProps } from '../definitions/index.js'
import { parseLayeredVideosFromObjects } from '../helpers/clips.js'
import { createScriptPiece } from '../helpers/script.js'
import { parseConfig } from '../helpers/config.js'

/**
 * Video-only wipe / bg-loop parts (no graphic, no take-over VT/VO clip).
 */
export function generateLayeredVideoPart(
	context: PartContext,
	part: PartProps<LayeredVideoProps>
): BlueprintResultPart {
	const config = parseConfig(context).studio

	const layeredVideos = parseLayeredVideosFromObjects(context, config, part.objects)
	if (!layeredVideos.length) {
		context.notifyUserError('Missing wipe or bg-loop video on timeline')
	}

	const pieces = [...layeredVideos]
	const scriptPiece = createScriptPiece(part.payload.script, part.payload.externalId)
	if (scriptPiece) pieces.push(scriptPiece)

	return {
		part: {
			externalId: part.payload.externalId,
			title: part.payload.name,
			expectedDuration: part.payload.duration || undefined,
			autoNext: true,
		},
		pieces,
		adLibPieces: [],
		actions: [],
	}
}
