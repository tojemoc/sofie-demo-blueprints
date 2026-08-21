/**
 * Caspar layer numbers on the LED channel.
 * Clip preview (100) and clip player (110) hold background/fullscreen media;
 * ILU (115) sits above the bg loop so MIXER FILL does not transform layer 110;
 * gfx layers use 120+ to avoid collisions.
 * Logo/bug lives on PGM (see PgmChannelLayers.GraphicsLogo) — LED stays loop-only for DoubleBox.
 */
export const LedChannelLayers = {
	AudioBed: 80,
	ClipPreview: 100,
	ClipPlayer: 110,
	IluPlayer: 115,
	GraphicsTicker: 120,
	GraphicsLowerThird: 121,
	GraphicsStrap: 122,
	/** @deprecated Prefer PGM logo; retained so layer numbers stay stable if remapped. */
	GraphicsLogo: 123,
	EffectsPlayer: 200,
} as const

/**
 * Caspar layer numbers on the PGM channel (DoubleBox compose).
 * Camera (115) sits under ILU (116) so the left ILU window covers CAM overhang without
 * needing a left cover-crop; both sit under DoubleBoxLoop (118); wipe (200); intro (210).
 * GraphicsLogo (123) is the 360° sekúnd bug — PGM only, not LED.
 */
export const PgmChannelLayers = {
	ClipPlayer: 110,
	Camera: 115,
	IluPlayer: 116,
	/** DoubleBox compositing frame (alpha loop) — above ILU/CAM, below L3D. */
	DoubleBoxLoop: 118,
	GraphicsLowerThird: 121,
	GraphicsLogo: 123,
	EffectsPlayer: 200,
	/** Intro / znelka — above wipe; PGM only (never LED). */
	IntroOverlay: 210,
} as const

/**
 * DoubleBox CAM under the frame: ~80% of the frame, right edge stuck to the screen
 * right edge. ILU (higher layer) covers the left overhang — no CAM crop required.
 * The alpha `db_loop`/`dp_loop` cutouts reveal the right window; left is ILU.
 */
export const PGM_DOUBLEBOX_CAMERA_FILL = {
	x: 0.2,
	y: 0.1,
	xScale: 0.8,
	yScale: 0.8,
} as const

/** Starting FILL for DoubleBox story ILU window (left — measured from db_loop.mov). */
export const PGM_DOUBLEBOX_ILU_FILL = {
	x: 0.0219,
	y: 0.0769,
	xScale: 0.6802,
	yScale: 0.6824,
} as const

/** Fullscreen PGM camera (headlines / MOD after intro — no DoubleBox frame yet). */
export const PGM_FULLSCREEN_CAMERA_FILL = {
	x: 0,
	y: 0,
	xScale: 1,
	yScale: 1,
} as const

export type MixerFillRect = {
	x: number
	y: number
	xScale: number
	yScale: number
}

export type MixerCropRect = {
	left: number
	top: number
	right: number
	bottom: number
}

/**
 * Cover-crop a 16:9 source into a MIXER FILL rect on a 16:9 output (no squish).
 * `from-left` removes from the left edge (keeps the right portion of the frame).
 */
export function coverCropForFill(
	fill: Pick<MixerFillRect, 'xScale' | 'yScale'>,
	align: 'center' | 'from-left' = 'center',
	sourceAspect = 16 / 9,
	outputAspect = 16 / 9
): MixerCropRect {
	const boxAspect = (fill.xScale / fill.yScale) * outputAspect

	if (sourceAspect >= boxAspect) {
		const visibleWidth = boxAspect / sourceAspect
		const cropped = Math.max(0, 1 - visibleWidth)
		if (align === 'from-left') {
			return { left: cropped, top: 0, right: 0, bottom: 0 }
		}
		const side = cropped / 2
		return { left: side, top: 0, right: side, bottom: 0 }
	}

	const visibleHeight = sourceAspect / boxAspect
	const cropped = Math.max(0, 1 - visibleHeight)
	const side = cropped / 2
	return { left: 0, top: side, right: 0, bottom: side }
}

/** Keep CAM aspect ratio under the ~80% right-aligned box (near-16:9 → little/no crop). */
export const PGM_DOUBLEBOX_CAMERA_CROP = coverCropForFill(PGM_DOUBLEBOX_CAMERA_FILL, 'from-left')

/** Center cover-crop for DoubleBox left ILU window. */
export const PGM_DOUBLEBOX_ILU_CROP = coverCropForFill(PGM_DOUBLEBOX_ILU_FILL, 'center')
