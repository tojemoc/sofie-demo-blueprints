import { IRundownUserContext, SofieIngestSegment } from '@sofie-automation/blueprints-integration'
import { ObjectType } from '../../../common/definitions/objects.js'
import { isRundownEditorGraphicPieceType, resolveSegmentType } from '../../../common/definitions/rundownEditorTypes.js'
import { t } from '../../../common/util.js'
import { EditorIngestPart, EditorIngestSegment } from '../../../code-copy/rundown-editor/index.js'
import { AllProps, PartProps, SegmentProps } from '../definitions/index.js'
import { createInvalidProps } from '../spreadsheet-parsers/invalid.js'
import { parseCamera } from './camera.js'
import { parseDVE } from './dve.js'
import { parseGfx } from './gfx.js'
import { parseGuest } from './guest.js'
import { parseRemote } from './remote.js'
import { parseOpener } from './titles.js'
import { parseVO } from './vo.js'
import { parseVT } from './vt.js'

function hasCameraPiece(part: EditorIngestPart): boolean {
	return part.pieces.some((piece) => (piece.objectType as ObjectType) === ObjectType.Camera)
}

function parseEditorPart(partPayload: EditorIngestPart): PartProps<AllProps> {
	const partType = partPayload.type ?? ''

	if (partType.match(/ilu/i)) {
		return hasCameraPiece(partPayload) ? parseCamera(partPayload) : parseGfx(partPayload)
	}
	if (partType.match(/syn/i)) {
		return parseVO(partPayload)
	}
	if (partType.match(/cam/i)) {
		return parseCamera(partPayload)
	}
	if (partType.match(/dve/i)) {
		return parseDVE(partPayload)
	}
	if (partType.match(/gfx/i)) {
		return parseGfx(partPayload)
	}
	if (/^(remi|remote)$/i.test(partType)) {
		return parseRemote(partPayload)
	}
	if (partType.match(/guest/i)) {
		return parseGuest(partPayload)
	}
	if (partType.match(/titles/i)) {
		return parseOpener(partPayload)
	}
	if (partType.match(/vo/i)) {
		return parseVO(partPayload)
	}
	if (partType.match(/vt|full|package/i)) {
		return parseVT(partPayload)
	}

	return createInvalidProps(t('Unknown part type'), partPayload)
}

/**
 * This function converts from raw ingest segments to parsed segments, we
 * make sure to parse to the data structure originally used by the
 * Editor
 * @param context
 * @param ingestSegment The segment from the rundown editor
 * @returns Intermediate data type used to generate parts
 */
export function convertIngestData(context: IRundownUserContext, ingestSegment: SofieIngestSegment): SegmentProps {
	const parts: PartProps<AllProps>[] = []
	let type = resolveSegmentType({ name: ingestSegment.name })

	if (ingestSegment.payload) {
		const payload = ingestSegment.payload as EditorIngestSegment
		type = resolveSegmentType(payload)

		ingestSegment.parts.forEach((part) => {
			const partPayload = part.payload as EditorIngestPart

			partPayload.pieces.forEach((piece) => {
				if ((piece.objectType as ObjectType) === ObjectType.Graphic) {
					piece.clipName = String(piece.attributes.template || '')

					// Legacy spreadsheet/generic graphic field remapping
					if (piece.clipName === 'gfx/strap') {
						piece.attributes.location = piece.attributes.field0
						piece.attributes.text = piece.attributes.field1
					} else if (piece.clipName === 'gfx/head') {
						piece.attributes.text = piece.attributes.field0
					} else if (piece.clipName === 'gfx/l3d') {
						piece.attributes.name = piece.attributes.field0
						piece.attributes.description = piece.attributes.field1
					} else if (piece.clipName === 'gfx/fullscreen') {
						piece.attributes.url = piece.attributes.field0
					}
				} else if ((piece.objectType as ObjectType) === ObjectType.Video) {
					piece.clipName = piece.attributes.fileName as string
				}

				piece.duration = (piece.duration ?? 0) * 1000
				if (piece.objectTime === undefined || piece.objectTime === null || Number.isNaN(piece.objectTime)) {
					piece.objectTime = 0
				} else {
					piece.objectTime = piece.objectTime * 1000
				}

				if (isRundownEditorGraphicPieceType(piece.objectType)) {
					const graphicPieceType = piece.objectType
					piece.clipName = 'gfx/' + graphicPieceType
					piece.objectType = ObjectType.Graphic

					// Pass piece name to template as an attribute if it exists
					if (piece.name) {
						piece.attributes.pieceName = piece.name
					}
				}
			})

			parts.push(parseEditorPart(partPayload))
		})
	} else {
		context.logError('Missing segment payload')
	}

	// Adlib is driven only by explicit attributes.adlib; missing objectTime defaults to 0 above.
	parts.forEach((part) => {
		part.objects.forEach((piece) => {
			const adlibAttr = (piece.attributes as { adlib?: string | boolean }).adlib
			if (adlibAttr === true || adlibAttr === 'true') {
				piece.isAdlib = true
			} else if (adlibAttr === false || adlibAttr === 'false') {
				piece.isAdlib = false
			}
		})
	})

	return {
		parts,
		type,
		payload: {
			name: ingestSegment.name,
		},
	}
}
