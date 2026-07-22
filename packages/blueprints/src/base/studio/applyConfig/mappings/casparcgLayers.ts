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
 * Camera (116) sits beside ILU (115); wipe (200); intro (210) is above wipe.
 * GraphicsLogo (123) is the 360° sekúnd bug — PGM only, not LED.
 */
export const PgmChannelLayers = {
	ClipPlayer: 110,
	IluPlayer: 115,
	Camera: 116,
	GraphicsLowerThird: 121,
	GraphicsLogo: 123,
	EffectsPlayer: 200,
	/** Intro / znelka — above wipe; PGM only (never LED). */
	IntroOverlay: 210,
} as const

/** Starting FILL for DoubleBox CAM window (right). Tune against HTML chrome. */
export const PGM_DOUBLEBOX_CAMERA_FILL = {
	x: 0.62,
	y: 0.08,
	xScale: 0.34,
	yScale: 0.72,
} as const
