import { ObjectType, SomeObject, StudioGuestObject } from '../../../common/definitions/objects.js'
import { t } from '../../../common/util.js'
import { EditorIngestPart } from '../../../code-copy/rundown-editor/index.js'
import { SourceType } from '../../studio/helpers/config.js'
import { CameraProps, InvalidProps, PartProps, PartType } from '../definitions/index.js'
import { findSource } from '../helpers/sources.js'
import { parseBaseProps } from './base.js'
import { createInvalidProps } from './invalid.js'

export function parseGuest(ingestPart: EditorIngestPart): PartProps<CameraProps | InvalidProps> {
	const guestPiece = ingestPart.pieces.find(
		(p): p is StudioGuestObject => (p.objectType as ObjectType) === ObjectType.StudioGuest
	)
	if (!guestPiece) {
		return createInvalidProps(t('No guest object'), ingestPart)
	}

	const cameraPiece = ingestPart.pieces.find((p) => (p.objectType as ObjectType) === ObjectType.Camera)
	const input = findSource(cameraPiece?.attributes.camNo ?? 1, SourceType.Camera)
	if (!input) {
		return createInvalidProps(t('Could not find camera for guest part'), ingestPart)
	}

	return {
		type: PartType.Camera,
		rawType: ingestPart.type,
		rawTitle: ingestPart.name,
		objects: ingestPart.pieces as SomeObject[],
		payload: {
			...parseBaseProps(ingestPart),
			input,
		},
	}
}
