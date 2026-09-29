import { CasparCGLayers } from '../../base/studio/layers.js'

/** Final mixer opacity after applying route keyframes (dual always-live PGM routes). */
export function routeFinalOpacity(obj: {
	content?: unknown
	keyframes?: ReadonlyArray<{ enable?: unknown; content?: unknown }>
}): number {
	let opacity = (obj.content as { mixer?: { opacity?: number } } | undefined)?.mixer?.opacity
	if (typeof opacity !== 'number') opacity = 1
	for (const kf of obj.keyframes ?? []) {
		const kfOpacity = (kf.content as { mixer?: { opacity?: number } } | undefined)?.mixer?.opacity
		if (typeof kfOpacity === 'number') opacity = kfOpacity
	}
	return opacity
}

/** Take-relative ms when dual-route opacity swaps (0 = visible from Take). */
export function routeSwitchStartMs(obj: {
	enable?: unknown
	keyframes?: ReadonlyArray<{ enable?: unknown; content?: unknown }>
}): number {
	for (const kf of obj.keyframes ?? []) {
		if (
			!Array.isArray(kf.enable) &&
			typeof (kf.enable as { start?: number } | undefined)?.start === 'number' &&
			(kf.content as { mixer?: unknown } | undefined)?.mixer !== undefined
		) {
			return (kf.enable as { start: number }).start
		}
	}
	const enable = obj.enable as { start?: number } | undefined
	return typeof enable?.start === 'number' ? enable.start : 0
}

type TimelineObj = {
	layer?: unknown
	content?: unknown
	keyframes?: ReadonlyArray<{ enable?: unknown; content?: unknown }>
	enable?: unknown
}

/** Live (opacity≥1) dual PGM route object from a flat timeline or piece list. */
export function findLivePgmRouteObj(
	piecesOrTimeline:
		| ReadonlyArray<{ content?: { timelineObjects?: ReadonlyArray<TimelineObj> } }>
		| ReadonlyArray<TimelineObj>
): TimelineObj | undefined {
	const routes: TimelineObj[] = []
	const first = piecesOrTimeline[0] as
		| TimelineObj
		| { content?: { timelineObjects?: ReadonlyArray<TimelineObj> } }
		| undefined
	const isFlat =
		first !== undefined &&
		'layer' in first &&
		!('content' in first && (first as { content?: { timelineObjects?: unknown } }).content?.timelineObjects)

	if (isFlat) {
		for (const obj of piecesOrTimeline as ReadonlyArray<TimelineObj>) {
			if (obj.layer === CasparCGLayers.CasparCGPgmRoute || obj.layer === CasparCGLayers.CasparCGPgmRouteA) {
				routes.push(obj)
			}
		}
	} else {
		for (const piece of piecesOrTimeline as ReadonlyArray<{
			content?: { timelineObjects?: ReadonlyArray<TimelineObj> }
		}>) {
			for (const obj of piece.content?.timelineObjects ?? []) {
				if (obj.layer === CasparCGLayers.CasparCGPgmRoute || obj.layer === CasparCGLayers.CasparCGPgmRouteA) {
					routes.push(obj)
				}
			}
		}
	}
	return routes.find((obj) => routeFinalOpacity(obj) >= 1) ?? routes[0]
}
