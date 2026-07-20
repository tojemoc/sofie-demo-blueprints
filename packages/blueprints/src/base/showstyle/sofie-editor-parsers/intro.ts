import { ObjectType, SomeObject, VideoObject } from '../../../common/definitions/objects.js'
import { t } from '../../../common/util.js'
import { EditorIngestPart } from '../../../code-copy/rundown-editor/index.js'
import { IntroProps, InvalidProps, PartProps, PartType } from '../definitions/index.js'
import { parseClipEditorProps } from '../helpers/clips.js'
import { parseBaseProps } from './base.js'
import { createInvalidProps } from './invalid.js'

function isEffectsOverlayVideo(piece: VideoObject): boolean {
	return piece.attributes?.playLayer === 'effects'
}

/**
 * Find the intro overlay video for an Intro (or recovered GFX) part.
 * Prefers an explicit `playLayer: effects` piece; falls back to the first video
 * so a GFX part that only has a clip still becomes an overlay intro.
 */
export function findIntroOverlayVideo(ingestPart: EditorIngestPart): VideoObject | undefined {
	const videos = ingestPart.pieces.filter((p): p is VideoObject => (p.objectType as ObjectType) === ObjectType.Video)
	return videos.find(isEffectsOverlayVideo) ?? videos[0]
}

export function parseIntro(ingestPart: EditorIngestPart): PartProps<IntroProps | InvalidProps> {
	const introVideo = findIntroOverlayVideo(ingestPart)
	if (!introVideo) {
		return createInvalidProps(t('No intro overlay video. Add an Intro piece (plays on top of everything).'), ingestPart)
	}

	// Ensure timeline routing even when recovering a plain video on a GFX part.
	introVideo.attributes = {
		...introVideo.attributes,
		playLayer: 'effects',
	}

	const clipProps = parseClipEditorProps(introVideo)
	if (!clipProps) {
		return createInvalidProps(t('Intro overlay video is missing file name'), ingestPart)
	}

	return {
		type: PartType.Intro,
		rawType: ingestPart.type,
		rawTitle: ingestPart.name,
		objects: ingestPart.pieces as SomeObject[],
		payload: {
			...parseBaseProps(ingestPart),
			clipProps,
		},
	}
}
