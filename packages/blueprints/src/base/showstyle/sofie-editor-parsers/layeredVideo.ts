import { ObjectType, SomeObject, VideoObject } from '../../../common/definitions/objects.js'
import { t } from '../../../common/util.js'
import { EditorIngestPart } from '../../../code-copy/rundown-editor/index.js'
import { InvalidProps, LayeredVideoProps, PartProps, PartType } from '../definitions/index.js'
import { isLayeredVideoObject } from '../helpers/clips.js'
import { parseBaseProps } from './base.js'
import { createInvalidProps } from './invalid.js'

export function parseLayeredVideo(ingestPart: EditorIngestPart): PartProps<LayeredVideoProps | InvalidProps> {
	const hasLayered = ingestPart.pieces.some(
		(piece) => (piece.objectType as ObjectType) === ObjectType.Video && isLayeredVideoObject(piece as VideoObject)
	)
	if (!hasLayered) {
		return createInvalidProps(t('No wipe or bg-loop video on part'), ingestPart)
	}

	return {
		type: PartType.LayeredVideo,
		rawType: ingestPart.type,
		rawTitle: ingestPart.name,
		objects: ingestPart.pieces as SomeObject[],
		payload: {
			...parseBaseProps(ingestPart),
		},
	}
}
