import { BlueprintResultPart, PieceLifespan } from '@sofie-automation/blueprints-integration'

import { PartContext } from '../../../common/context.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { GfxProps, PartProps } from '../definitions/index.js'
import { autoNextFromRe, autoNextPublicData } from '../helpers/autoNext.js'
import { createOutroBackgroundMusicMutePiece } from '../helpers/backgroundMusic.js'
import { parseClipsFromObjects, parseLayeredVideosFromObjects, partHasOutroOverlay } from '../helpers/clips.js'
import { parseConfig } from '../helpers/config.js'
import { createDoubleBoxLoopPiece } from '../helpers/doubleboxLoop.js'
import { parseGraphicsFromObjects, partHasHeadlineIlu } from '../helpers/graphics.js'
import { createHeadlineSfxPiece } from '../helpers/headlineSfx.js'
import { finalizeHypercomposedPart, isDoubleBoxLook, LookSlot } from '../helpers/pgmLook.js'
import { createScriptPiece } from '../helpers/script.js'
import { createPgmCameraTimelineObjects } from './camera.js'

/** Generate a GFX part — L3D graphic plus optional look ILU underlay on the claimed slot. */
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

	// Scheduled ZÁVER / avízo parts carry `gfx/ilu-zaver` and land here because
	// they have no camera piece — emit the same DoubleBox shell a camera part
	// would: `db_loop` frame + the right-window look CAM.
	if (isDoubleBoxLook(part.rawType, part.objects)) {
		pieces.push({
			enable: { start: 0 },
			externalId: `${part.payload.externalId}_look_cam`,
			name: 'Cam',
			lifespan: PieceLifespan.WithinPart,
			sourceLayerId: SourceLayer.Camera,
			outputLayerId: getOutputLayerForSourceLayer(SourceLayer.Camera),
			content: {
				timelineObjects: createPgmCameraTimelineObjects(config, 'doublebox', lookSlot),
			},
		})
		pieces.push(createDoubleBoxLoopPiece(context, config, part.payload.externalId))
	}

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
		part.rawType,
		result.adLibPieces
	)
	return result
}
