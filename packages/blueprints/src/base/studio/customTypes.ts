/**
 * This file can be used to add additional types to some of the
 * interfaces that may change between blueprints such as
 * metadata etc.
 */

import type { SetRequired } from 'type-fest'

import {
	IBlueprintActionManifestDisplay,
	IBlueprintActionManifestDisplayContent,
	OnGenerateTimelineObj,
	TimelineObjectCoreExt,
	TSR,
} from '@sofie-automation/blueprints-integration'

export interface PartEndStateExt {
	_customTypes: void // just here to satisfy the linter
}

export interface TimelinePersistentStateExt {
	_customTypes: void // just here to satisfy the linter
}

export interface TimelineObjectMetaData {
	_customTypes: void // just here to satisfy the linter
}

export interface TimelineObjectKeyframeMetaData {
	_customTypes: void // just here to satisfy the linter
}

export type TimelineBlueprintExt<T extends TSR.TSRTimelineContent = TSR.TSRTimelineContent> = TimelineObjectCoreExt<
	T,
	TimelineObjectMetaData,
	TimelineObjectKeyframeMetaData
>
export type OnTimelineGenerateBlueprintExt = TimelineBlueprintExt &
	OnGenerateTimelineObj<TSR.TSRTimelineContent, TimelineObjectMetaData, TimelineObjectKeyframeMetaData>

export interface PieceMetaDataExt {
	_customTypes: void // just here to satisfy the linter
}

export type AdLibActionDisplayContentExt = SetRequired<IBlueprintActionManifestDisplayContent, 'tags'>
export type AdLibActionDisplayExt = IBlueprintActionManifestDisplay
