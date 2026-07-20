import { SpreadsheetIngestPiece } from '../../code-copy/spreadsheet-gateway/index.js'

export type SomeObject =
	| CameraObject
	| VideoObject
	| GraphicObject
	| SplitObject
	| RemoteObject
	| StudioGuestObject
	| GraphicObjectBase
	| SteppedGraphicObject

export type SomeAdlibPiece = VideoObject | GraphicObject

export enum ObjectType {
	Camera = 'camera',
	Video = 'video',
	Graphic = 'graphic',
	SteppedGraphic = 'stepped-graphic',
	Split = 'split',
	Remote = 'remote',
	StudioGuest = 'guest',
}

export interface BaseObject extends SpreadsheetIngestPiece {
	isAdlib?: boolean
	isStudioMon?: boolean
}

export interface CameraObject extends BaseObject {
	objectType: ObjectType.Camera
	attributes: {
		name: string
	}
}
export interface VideoObject extends BaseObject {
	objectType: ObjectType.Video
	adlibVariant?: string
	attributes: VideoObjectAttributes
}

/** Caspar play routing for layered video pieces from the Rundown Editor. */
export type VideoPlayLayer = 'effects' | 'background'

export type VideoObjectAttributes = {
	fileName?: string
	sourceDuration?: number
	/** `effects` = intro overlay (layer 200); `background` = LED bg loop (layer 110). */
	playLayer?: VideoPlayLayer | string
	loop?: boolean | string
}
export interface GraphicObjectBase extends Omit<BaseObject, 'attributes'> {
	objectType: ObjectType.Graphic | ObjectType.SteppedGraphic
	adlibVariant?: string
	attributes: GraphicObjectAttributes
}
export interface GraphicObject extends GraphicObjectBase {
	objectType: ObjectType.Graphic
	attributes: GraphicObjectAttributes
}
export type GraphicObjectAttributes = {
	name?: string
	description?: string
	location?: string
	text?: string
	title?: string
	subtitle?: string
	headline?: string
	subline?: string
	role?: string
	source?: string
	sourceEnabled?: boolean | string
	iluFile?: string
	iluFallback?: boolean | string
	url?: string
	pieceName?: string
	/**
	 * Weather city rows for gfx/weather.
	 * Prefer a JSON string from the editor; arrays are accepted from smoke fixtures.
	 */
	cities?: string
}
/*
Note that we are not using the interfaces defined in Sofie,
because we would need to be able to have object attributes ingested
from the rundown editor which is currently not possible.

Ideally we'd have a step attribute as a `NoraContentSteps` interface.

*/
export interface SteppedGraphicObject extends GraphicObjectBase {
	objectType: ObjectType.SteppedGraphic
	attributes: SteppedGraphicObjectAttributes
}
export interface SteppedGraphicObjectAttributes extends GraphicObjectAttributes {
	stepCount: number
	[key: string]: string | number | boolean | undefined
}
export interface SplitObject extends BaseObject {
	objectType: ObjectType.Split
	attributes: {
		layout: string
		input1: string
		input2: string
	}
}
export interface RemoteObject extends BaseObject {
	objectType: ObjectType.Remote
	attributes: {
		source: string
	}
}

export interface StudioGuestObject extends BaseObject {
	objectType: ObjectType.StudioGuest
	attributes: {
		count: number
	}
}
