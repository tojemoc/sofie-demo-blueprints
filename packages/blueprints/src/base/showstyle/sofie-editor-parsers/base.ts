import { EditorIngestPart } from '../../../code-copy/rundown-editor/index.js'
import { PartBaseProps } from '../definitions/index.js'

export function parseBaseProps(part: EditorIngestPart): PartBaseProps {
	const script = part.script
	const float = Boolean(part.float || (part as { skip?: boolean }).skip)

	return {
		externalId: part.externalId,
		duration: (part.duration || 0) * 1000,
		name: part.name,
		script,
		...(float ? { float: true, skip: Boolean((part as { skip?: boolean }).skip) } : {}),
	}
}
