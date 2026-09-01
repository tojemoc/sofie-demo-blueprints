import { IRundownUserContext, SofieIngestSegment } from '@sofie-automation/blueprints-integration'
import { ObjectType } from '../../../common/definitions/objects.js'
import {
	isRundownEditorGraphicPieceType,
	normalizeRundownEditorLayeredVideoPieceType,
	playLayerForVideoPieceType,
	resolveSegmentType,
} from '../../../common/definitions/rundownEditorTypes.js'
import { DEFAULT_BG_LOOP_FILE, isLayeredVideoObject, normalizeLayeredVideoFileName } from '../helpers/clips.js'
import { VideoObject } from '../../../common/definitions/objects.js'
import { t } from '../../../common/util.js'
import { EditorIngestPart, EditorIngestSegment } from '../../../code-copy/rundown-editor/index.js'
import { AllProps, PartProps, SegmentProps } from '../definitions/index.js'
import { DEFAULT_WIPE_FILE } from '../../../common/definitions/rundownEditorTypes.js'
import { getDemoClipPath } from '../helpers/mediaPackages.js'
import { DEFAULT_OUTRO_FILE } from '../helpers/graphics.js'
import { createInvalidProps } from '../spreadsheet-parsers/invalid.js'
import { parseCamera } from './camera.js'
import { parseDVE } from './dve.js'
import { parseGfx } from './gfx.js'
import { parseGuest } from './guest.js'
import { parseIntro } from './intro.js'
import { parseLayeredVideo } from './layeredVideo.js'
import { parseRemote } from './remote.js'
import { parseOpener } from './titles.js'
import { parseVO } from './vo.js'
import { parseVT } from './vt.js'

function normalizeGenericGraphicTemplate(template: unknown): string {
	const clipName = typeof template === 'string' ? template.trim() : ''
	if (!clipName) return ''
	if (clipName.toLowerCase().startsWith('gfx/')) return clipName
	if (isRundownEditorGraphicPieceType(clipName)) return 'gfx/' + clipName.toLowerCase()
	return clipName
}

function hasCameraPiece(part: EditorIngestPart): boolean {
	return part.pieces.some((piece) => (piece.objectType as ObjectType) === ObjectType.Camera)
}

/** True when the part has a take-over VT/VO clip (not intro / bg-loop / wipe). */
function hasMainVideoPiece(part: EditorIngestPart): boolean {
	return part.pieces.some((piece) => {
		if ((piece.objectType as ObjectType) !== ObjectType.Video) return false
		return !isLayeredVideoObject(piece as VideoObject)
	})
}

/** True when the part has at least one wipe / bg-loop / intro overlay video. */
function hasLayeredVideoPiece(part: EditorIngestPart): boolean {
	return part.pieces.some((piece) => {
		if ((piece.objectType as ObjectType) !== ObjectType.Video) return false
		return isLayeredVideoObject(piece as VideoObject)
	})
}

function hasGraphicPiece(part: EditorIngestPart): boolean {
	return part.pieces.some(
		(piece) =>
			(piece.objectType as ObjectType) === ObjectType.Graphic ||
			(piece.objectType as ObjectType) === ObjectType.SteppedGraphic
	)
}

function parseEditorPart(partPayload: EditorIngestPart): PartProps<AllProps> {
	const partType = partPayload.type ?? ''

	if (partType.match(/doublebox|double-box/i)) {
		return hasCameraPiece(partPayload) ? parseCamera(partPayload) : parseGfx(partPayload)
	}
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
		if (hasGraphicPiece(partPayload)) {
			return parseGfx(partPayload)
		}
		// Operator recovery: GFX + plain video-only was used for overlay intros → Intro.
		if (hasMainVideoPiece(partPayload)) {
			return parseIntro(partPayload)
		}
		// Wipe / bg-loop only — not GFX (no graphic) and not Intro (no overlay clip).
		if (hasLayeredVideoPiece(partPayload)) {
			return parseLayeredVideo(partPayload)
		}
		return parseGfx(partPayload)
	}
	if (partType.match(/outro/i)) {
		if (hasMainVideoPiece(partPayload) || hasLayeredVideoPiece(partPayload)) {
			return parseIntro(partPayload)
		}
		return createInvalidProps(t('Outro part requires an outro overlay video piece.'), partPayload)
	}
	if (partType.match(/intro/i)) {
		return parseIntro(partPayload)
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
	// VID / SOT / clip / video are sometimes used as part labels; VT / FULL / PACKAGE are standard.
	if (/^(vt|full|package|vid|sot|clip|video)$/i.test(partType)) {
		return parseVT(partPayload)
	}

	// Content fallback: a part whose only (or primary) object is a take-over video file.
	if (hasMainVideoPiece(partPayload)) {
		return parseVT(partPayload)
	}
	// Wipe / bg-loop alone on an unknown part type.
	if (hasLayeredVideoPiece(partPayload)) {
		return parseLayeredVideo(partPayload)
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

			// Logo + countup: baseline `assets/countup` on PGM logo layer (not per-part gfx/logo-bug).
			partPayload.pieces = partPayload.pieces.filter((piece) => piece.objectType.trim().toLowerCase() !== 'logo-bug')

			partPayload.pieces.forEach((piece) => {
				if ((piece.objectType as ObjectType) === ObjectType.Graphic) {
					piece.clipName = normalizeGenericGraphicTemplate(piece.attributes.template)
				} else if ((piece.objectType as ObjectType) === ObjectType.Video) {
					piece.clipName = piece.attributes.fileName as string
				}

				piece.duration = (piece.duration ?? 0) * 1000
				if (piece.objectTime === undefined || piece.objectTime === null || Number.isNaN(piece.objectTime)) {
					piece.objectTime = 0
				} else {
					piece.objectTime = piece.objectTime * 1000
				}

				const layeredType = normalizeRundownEditorLayeredVideoPieceType(piece.objectType)
				if (layeredType) {
					const playLayer = playLayerForVideoPieceType(layeredType)
					const rawFileName =
						(typeof piece.attributes.fileName === 'string' && piece.attributes.fileName.trim()) ||
						(playLayer === 'background' ? DEFAULT_BG_LOOP_FILE : '') ||
						(playLayer === 'wipe' ? DEFAULT_WIPE_FILE : '') ||
						(playLayer === 'effects' && layeredType === 'outro' ? DEFAULT_OUTRO_FILE : '')
					const fileName = rawFileName ? normalizeLayeredVideoFileName(playLayer, rawFileName) : ''

					piece.objectType = ObjectType.Video
					piece.clipName = fileName
					piece.attributes = {
						...piece.attributes,
						fileName: fileName || piece.attributes.fileName,
						playLayer,
						...(playLayer === 'background' && piece.attributes.loop === undefined ? { loop: true } : {}),
					}
				} else if (isRundownEditorGraphicPieceType(piece.objectType)) {
					const graphicPieceType = piece.objectType.trim().toLowerCase()
					piece.clipName = graphicPieceType === 'weather' ? 'gfx/pocasie' : 'gfx/' + graphicPieceType
					piece.objectType = ObjectType.Graphic

					// Pass piece name to template as an attribute if it exists
					if (piece.name) {
						piece.attributes.pieceName = piece.name
					}

					// Legacy spravy/<rundownId>/clips/… → flat clips/<file>
					const iluFile = piece.attributes.iluFile
					if (typeof iluFile === 'string' && iluFile.trim()) {
						piece.attributes.iluFile = getDemoClipPath(undefined, iluFile)
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
