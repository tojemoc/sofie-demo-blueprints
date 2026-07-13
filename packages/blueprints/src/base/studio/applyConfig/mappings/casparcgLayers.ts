/**
 * Caspar layer numbers on the LED channel.
 * Clip preview (100) and clip player (110) share the LED stack with HTML graphics;
 * gfx layers use 120+ to avoid collisions.
 */
export const LedChannelLayers = {
	AudioBed: 80,
	ClipPreview: 100,
	ClipPlayer: 110,
	GraphicsTicker: 120,
	GraphicsLowerThird: 121,
	GraphicsStrap: 122,
	GraphicsLogo: 123,
	EffectsPlayer: 200,
} as const

export const PgmChannelLayers = {
	ClipPlayer: 110,
	GraphicsLowerThird: 121,
} as const
