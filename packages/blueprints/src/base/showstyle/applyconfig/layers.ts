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
		case SourceLayer.Strap:
		case SourceLayer.Ticker:
		case SourceLayer.Logo:
			return OutputLayer.Gfx
		case SourceLayer.PgmLowerThird:
			// PGM Caspar overlays — same visual track as Camera, no exclusiveGroup.
			return OutputLayer.Pgm
		case SourceLayer.StudioGuests:
		case SourceLayer.HostOverride:
		case SourceLayer.AudioBed:
		case SourceLayer.DVE_RETAIN:
			return OutputLayer.Aux
		default:
			return OutputLayer.Pgm
	}
}
