import { PartBaseProps } from '../definitions/index.js'

/**
 * Core only auto-takes when both `autoNext` and `expectedDuration` are set
 * (`stateCacheResolver`). Never claim true when Core cannot take.
 *
 * Editorial AUTO from the Rundown Editor (`payload.autoNext`) is the single
 * source of truth for VO / VT / GFX / ILU / DoubleBox / LayeredVideo / Camera /
 * Remote. Implicit rules (duration > 0, hardcoded true) are forbidden here.
 */
export function autoNextFromRe(
	payload: Pick<PartBaseProps, 'autoNext'>,
	expectedDuration: number | undefined
): boolean {
	return (
		payload.autoNext === true &&
		typeof expectedDuration === 'number' &&
		Number.isFinite(expectedDuration) &&
		expectedDuration > 0
	)
}

export function autoNextPublicData(
	payload: Pick<PartBaseProps, 'autoNext'>,
	autoNext: boolean
): { autoNextSource: 'blueprint' } | undefined {
	return autoNext && payload.autoNext !== true ? { autoNextSource: 'blueprint' } : undefined
}

/**
 * Intro overlay (and outro overlay, which uses the same adapter) always auto-takes
 * once a duration is known — the show must open without a director Take.
 * Exposed through publicData so RE can label the exception on read-back.
 */
export const FORCE_INTRO_AUTO_NEXT = true

/** The titles opener always auto-takes once timed; RE labels this on read-back. */
export const FORCE_TITLES_AUTO_NEXT = true

/**
 * Počasie / weather GFX always auto-takes once timed. ILU is never forced
 * (operators Take ILU). RE labels this exception using Core's read-back.
 */
export const FORCE_WEATHER_AUTO_NEXT = true

/** Forced AUTO still requires a duration Core can use. */
export function autoNextForced(expectedDuration: number | undefined): boolean {
	return Number(expectedDuration) > 0
}
