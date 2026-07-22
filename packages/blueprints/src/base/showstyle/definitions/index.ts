import { ITranslatableMessage } from '@sofie-automation/blueprints-integration'
import { GraphicObject, SomeObject } from '../../../common/definitions/objects.js'
import { ClipProps } from '../helpers/clips.js'
import { RawSourceInfo } from '../helpers/sources.js'
import { IntermediatePart, IntermediateSegment } from './intermediate.js'

/** Editorial segment presets from Rundown Editor (metadata for future automation). */
export enum SegmentType {
	NORMAL = 'normal',
	OPENING = 'opening',
	HEADLINES = 'headlines',
	STORY = 'story',
}

/** Technical part adapters used by blueprints after ingest. */
export enum PartType {
	Invalid = 'invalid',
	Camera = 'camera',
	Remote = 'remote',
	VT = 'vt',
	VO = 'vo',
	Titles = 'titles',
	/** Overlay intro (EffectsPlayer) with optional controllable bg-loop piece. */
	Intro = 'intro',
	DVE = 'dve',
	GFX = 'gfx',
	/** Video-only wipe / bg-loop (no graphic, no take-over VT). */
	LayeredVideo = 'layeredVideo',
}

export type AllProps =
	| CameraProps
	| RemoteProps
	| VTProps
	| VOProps
	| TitlesProps
	| IntroProps
	| DVEProps
	| GfxProps
	| LayeredVideoProps
	| InvalidProps

export interface PartProps<T extends AllProps> extends IntermediatePart {
	type: PartType | null
	rawType: string
	rawTitle: string
	payload: T
	objects: SomeObject[]
}

export interface SegmentProps extends IntermediateSegment {
	type: SegmentType | null
	parts: PartProps<AllProps>[]
	payload: {
		name: string
		externalId?: string
	}
}

export interface PartBaseProps {
	externalId: string
	duration: number
	name: string
	script?: string
}

export interface CameraProps extends PartBaseProps {
	input: RawSourceInfo
}

export interface TitlesProps extends PartBaseProps {
	variant: string
}

export interface IntroProps extends PartBaseProps {
	/** Overlay clip props (EffectsPlayer / Caspar layer 200). */
	clipProps: ClipProps
}

export interface RemoteProps extends PartBaseProps {
	input: RawSourceInfo
}

export interface VTProps extends PartBaseProps {
	clipProps: ClipProps
}

export interface VOProps extends PartBaseProps {
	clipProps: ClipProps
}

export interface DVEProps extends PartBaseProps {
	layout: string
	inputs: Array<RawSourceInfo | ClipProps>
}

export interface GfxProps extends PartBaseProps {
	graphic: GraphicObject
}

/** Payload for parts that only carry layered videos (wipe / bg-loop). */
export type LayeredVideoProps = PartBaseProps

export interface InvalidProps extends PartBaseProps {
	invalidReason: ITranslatableMessage
}
