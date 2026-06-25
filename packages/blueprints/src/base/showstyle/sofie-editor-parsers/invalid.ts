import { ITranslatableMessage } from '@sofie-automation/blueprints-integration'
import { SomeObject } from '../../../common/definitions/objects.js'
import { EditorIngestPart } from '../../../code-copy/rundown-editor/index.js'
import { InvalidProps, PartProps, PartType } from '../definitions/index.js'
import { parseBaseProps } from './base.js'

export function createInvalidProps(
	reason: ITranslatableMessage,
	ingestPart: EditorIngestPart
): PartProps<InvalidProps> {
	return {
		type: PartType.Invalid,
		rawType: ingestPart.type,
		rawTitle: ingestPart.name,
		objects: ingestPart.pieces as SomeObject[],
		payload: {
			...parseBaseProps(ingestPart),

			invalidReason: reason,
		},
	}
}
