import { BlueprintResultPart } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { IntroProps, PartProps } from '../definitions/index.js'
import { parseClipsFromObjects, parseLayeredVideosFromObjects } from '../helpers/clips.js'
import { parseGraphicsFromObjects } from '../helpers/graphics.js'
import { createScriptPiece } from '../helpers/script.js'
import { parseConfig } from '../helpers/config.js'
import { createIntroBackgroundMusicMutePiece } from '../helpers/backgroundMusic.js'

/**
 * Intro part: overlay video on PGM IntroOverlay (layer 210) — above wipe / compose.
 * Never on LED (LED = headlines + loop only). Optional `bg-loop` stays on ClipPlayer1 (110).
 */
export function generateIntroPart(context: PartContext, part: PartProps<IntroProps>): BlueprintResultPart {
	const config = parseConfig(context).studio

	const layeredVideos = parseLayeredVideosFromObjects(context, config, part.objects)
	const hasOverlay = layeredVideos.some((piece) => piece.name.startsWith('Intro |'))
	if (!hasOverlay) {
		context.notifyUserError('Missing intro overlay video on timeline')
	}

	const pieces = [...layeredVideos]
	const scriptPiece = createScriptPiece(part.payload.script, part.payload.externalId)
	if (scriptPiece) pieces.push(scriptPiece)

	const graphics = parseGraphicsFromObjects(config, part.objects, context)
	if (graphics.pieces) pieces.push(...graphics.pieces)

	const introDurationMs =
		part.payload.duration > 0
			? part.payload.duration
			: part.payload.clipProps.duration && part.payload.clipProps.duration > 0
				? part.payload.clipProps.duration
				: undefined
	pieces.push(
		createIntroBackgroundMusicMutePiece(context, config, part.payload.externalId, introDurationMs)
	)

	const clips = parseClipsFromObjects(context, config, part.objects)

	return {
		part: {
			externalId: part.payload.externalId,
			title: part.payload.name,

			expectedDuration: part.payload.duration || part.payload.clipProps.duration || undefined,
			autoNext: true,
		},
		pieces,
		adLibPieces: [...graphics.adLibPieces, ...clips],
		actions: [],
	}
}
