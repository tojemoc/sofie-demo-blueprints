import { IngestSegment, IRundownUserContext } from '@sofie-automation/blueprints-integration'
import { ObjectType } from '../../../common/definitions/objects.js'
import { resolveSegmentType } from '../../../common/definitions/rundownEditorTypes.js'
import { t } from '../../../common/util.js'
import { SpreadsheetIngestPart, SpreadsheetIngestSegment } from '../../../code-copy/spreadsheet-gateway/index.js'
import { AllProps, PartProps, SegmentProps } from '../definitions/index.js'
import { parseCamera } from './camera.js'
import { parseDVE } from './dve.js'
import { parseGfx } from './gfx.js'
import { createInvalidProps } from './invalid.js'
import { parseRemote } from './remote.js'
import { parseOpener } from './titles.js'
import { parseVO } from './vo.js'
import { parseVT } from './vt.js'
import { BaseObject } from '../../../common/definitions/objects.js'

function hasCameraPiece(part: SpreadsheetIngestPart): boolean {
	return part.pieces.some((piece) => (piece.objectType as ObjectType) === ObjectType.Camera)
}

function parseSpreadsheetPart(partPayload: SpreadsheetIngestPart): PartProps<AllProps> {
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
	if (partType.match(/remi|remote/i)) {
		return parseRemote(partPayload)
	}
	if (partType.match(/(full|vt|package)/i)) {
		return parseVT(partPayload)
	}
	if (partType.match(/vo/i)) {
		return parseVO(partPayload)
	}
	if (partType.match(/titles/i)) {
		return parseOpener(partPayload)
	}
	if (partType.match(/dve/i)) {
		return parseDVE(partPayload)
	}
	if (partType.match(/gfx/i)) {
		return parseGfx(partPayload)
	}

	return createInvalidProps(t('Unknown part type'), partPayload)
}

/**
 * This function converts from raw ingest segments to parsed segments
 * @param context
 * @param ingestSegment The segment from the spreadsheet-gateway
 * @returns Intermediate data type used to generate parts
 */
export function convertIngestData(context: IRundownUserContext, ingestSegment: IngestSegment): SegmentProps {
	const parts: PartProps<AllProps>[] = []
	let type = resolveSegmentType({ name: ingestSegment.name })

	if (ingestSegment.payload) {
		const payload = ingestSegment.payload as SpreadsheetIngestSegment
		type = resolveSegmentType(payload)

		ingestSegment.parts.forEach((part) => {
			const partPayload = part.payload as SpreadsheetIngestPart
			parts.push(parseSpreadsheetPart(partPayload))
		})
	} else {
		context.logError('Missing segment payload')
	}

	// parse the objects
	parts.forEach((p) => {
		p.objects.forEach((obj: BaseObject) => {
			obj.isAdlib = obj.attributes.adlib === 'true'
		})
	})

	return {
		type,
		parts,
		payload: {
			name: ingestSegment.name,
		},
	}
}
