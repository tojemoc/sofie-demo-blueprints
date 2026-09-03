export enum SourceLayer {
	Titles = 'opener',
	/** Intro / znelka overlay — PGM video clip, not the legacy Titles opener graphic. */
	PgmIntro = 'pgm_intro',
	Camera = 'cam',
	Remote = 'remote',
	VT = 'vt',
	VO = 'vo',
	DVE = 'dve',
	DVE_RETAIN = 'dveRetain',
	GFX = 'gfx',

	AudioBed = 'audioBed',
	StudioGuests = 'guest',
	HostOverride = 'hostOverride',

	LowerThird = 'lower_third',
	/** LED headline ILU media only — not PGM L3D chrome or headline-fallback HTML. */
	IluMedia = 'ilu_media',
	/**
	 * PGM L3D chrome (l3d-headline / tema / syn / mod / …).
	 * Must stay off `LowerThird`: Sofie prunes to one WithinPart piece per source
	 * layer at the same start, so ILU + L3D on LowerThird made one of them silent.
	 * Output layer is still GFX (PGM track is isFlattened) — Caspar channel is PGM.
	 */
	PgmLowerThird = 'lower_third_pgm',
	/**
	 * PGM DoubleBox compositing frame (db_loop). Separate from VT so editorial VT
	 * parts do not fight an OutOnRundownEnd piece on the exclusive VT source layer.
	 */
	PgmDoubleBoxLoop = 'pgm_doublebox_loop',
	/**
	 * PGM story-block wipe — drives the PGM route STING (not a standalone overlay on 200).
	 * Dedicated graphics source layer so wipe never shares Titles/VT with intro and is not
	 * pruned against Camera/VT on the exclusive `pgm` group.
	 */
	PgmWipe = 'pgm_wipe',
	/**
	 * Hidden PGM route bus (look CUT). Wiped Takes use {@link SourceLayer.PgmWipe} for the same
	 * Caspar route layer so operators still see the wipe label.
	 */
	PgmRoute = 'pgm_route',
	Strap = 'strap',
	Ticker = 'ticker',
	Logo = 'logo',

	Script = 'script',
}

export enum OutputLayer {
	Gfx = 'gfx',
	Pgm = 'pgm',
	Aux = 'aux',
	Script = 'script',
}

export function getOutputLayerForSourceLayer(layer: SourceLayer): OutputLayer {
	switch (layer) {
		case SourceLayer.Script:
			return OutputLayer.Script
		case SourceLayer.LowerThird:
		case SourceLayer.IluMedia:
		case SourceLayer.PgmLowerThird:
		case SourceLayer.PgmDoubleBoxLoop:
		case SourceLayer.PgmWipe:
		case SourceLayer.PgmRoute:
		case SourceLayer.Strap:
		case SourceLayer.Ticker:
		case SourceLayer.Logo:
			// Keep PGM L3Ds / wipes on GFX output (not flattened isPGM PGM track). Separate
			// sourceLayerId still avoids LowerThird processAndPrune; Caspar mapping
			// remains channel-2 PGM layers.
			return OutputLayer.Gfx
		case SourceLayer.StudioGuests:
		case SourceLayer.HostOverride:
		case SourceLayer.AudioBed:
		case SourceLayer.DVE_RETAIN:
			return OutputLayer.Aux
		default:
			return OutputLayer.Pgm
	}
}
