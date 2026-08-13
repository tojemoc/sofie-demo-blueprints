export enum SourceLayer {
	Titles = 'opener',
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
	/**
	 * PGM L3D chrome (l3d-headline / tema / syn / mod / …).
	 * Must stay off `LowerThird`: Sofie prunes to one WithinPart piece per source
	 * layer at the same start, so ILU + L3D on LowerThird made one of them silent.
	 * Output layer is still GFX (PGM track is isFlattened) — Caspar channel is PGM.
	 */
	PgmLowerThird = 'lower_third_pgm',
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
		case SourceLayer.PgmLowerThird:
		case SourceLayer.Strap:
		case SourceLayer.Ticker:
		case SourceLayer.Logo:
			// Keep PGM L3Ds on GFX output (not flattened isPGM PGM track). Separate
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
