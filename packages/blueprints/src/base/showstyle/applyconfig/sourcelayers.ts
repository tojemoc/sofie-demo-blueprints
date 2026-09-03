import { ISourceLayer, SourceLayerType } from '@sofie-automation/blueprints-integration'
import { SourceLayer } from './layers.js'

export function getSourceLayer(): ISourceLayer[] {
	const layers: ISourceLayer[] = [
		{
			_id: SourceLayer.Titles,
			_rank: 200,
			name: 'Titles',
			abbreviation: 'VT',
			type: SourceLayerType.VT,
			onPresenterScreen: true,
		},
		{
			_id: SourceLayer.PgmIntro,
			_rank: 198,
			name: 'Intro',
			abbreviation: 'INT',
			type: SourceLayerType.VT,
			onPresenterScreen: true,
			// No exclusiveGroup — intro overlay coexists with Camera / wipe on PGM.
		},
		{
			_id: SourceLayer.Camera,
			type: SourceLayerType.CAMERA,
			_rank: 100,
			name: 'Camera',
			abbreviation: 'Cam',
			exclusiveGroup: 'pgm',
			onPresenterScreen: true,
		},
		{
			_id: SourceLayer.Remote,
			type: SourceLayerType.REMOTE,
			_rank: 100,
			name: 'Remote',
			abbreviation: 'Rem',
			exclusiveGroup: 'pgm',
			onPresenterScreen: true,
			isRemoteInput: true,
		},
		{
			_id: SourceLayer.VO,
			type: SourceLayerType.LIVE_SPEAK,
			_rank: 101,
			name: 'Voice Over',
			abbreviation: 'VO',
			exclusiveGroup: 'pgm',
			onPresenterScreen: true,
		},
		{
			_id: SourceLayer.VT,
			type: SourceLayerType.VT,
			_rank: 100,
			name: 'VT',
			abbreviation: 'VT',
			exclusiveGroup: 'pgm',
			onPresenterScreen: true,
		},
		{
			_id: SourceLayer.DVE,
			type: SourceLayerType.SPLITS,
			_rank: 100,
			name: 'DVE',
			abbreviation: 'DVE',
			exclusiveGroup: 'pgm',
			onPresenterScreen: true,
		},
		{
			_id: SourceLayer.GFX,
			type: SourceLayerType.GRAPHICS,
			_rank: 100,
			name: 'GFX',
			abbreviation: 'GFX',
			exclusiveGroup: 'pgm',
			onPresenterScreen: true,
		},

		{
			_id: SourceLayer.LowerThird,
			type: SourceLayerType.GRAPHICS,
			_rank: 200,
			name: 'Lower Third',
			abbreviation: 'L3d',
		},
		{
			_id: SourceLayer.IluMedia,
			type: SourceLayerType.GRAPHICS,
			_rank: 199,
			name: 'ILU',
			abbreviation: 'ILU',
		},
		{
			_id: SourceLayer.PgmLowerThird,
			type: SourceLayerType.GRAPHICS,
			_rank: 205,
			name: 'PGM L3D',
			abbreviation: 'L3dP',
			// No exclusiveGroup. Output is GFX (not flattened PGM) so overlays coexist
			// with Camera in the UI while Caspar still plays on channel 2.
		},
		{
			_id: SourceLayer.PgmDoubleBoxLoop,
			type: SourceLayerType.GRAPHICS,
			_rank: 204,
			name: 'PGM DoubleBox frame',
			abbreviation: 'DbF',
			isHidden: true,
			// No exclusiveGroup — persistent db_loop must not block VT parts on SourceLayer.VT.
		},
		{
			_id: SourceLayer.PgmWipe,
			type: SourceLayerType.GRAPHICS,
			_rank: 206,
			name: 'PGM Wipe',
			abbreviation: 'Wipe',
			onPresenterScreen: true,
			// No exclusiveGroup — must coexist with Camera / VT / VO on the same Take.
		},
		{
			_id: SourceLayer.PgmRoute,
			type: SourceLayerType.GRAPHICS,
			_rank: 207,
			name: 'PGM route',
			abbreviation: 'Rte',
			isHidden: true,
			// Hard-cut look routing; wiped Takes use PgmWipe instead.
		},
		{
			_id: SourceLayer.Strap,
			type: SourceLayerType.GRAPHICS,
			_rank: 201,
			name: 'Strap',
			abbreviation: 'Strap',
		},
		{
			_id: SourceLayer.Ticker,
			type: SourceLayerType.GRAPHICS,
			_rank: 202,
			name: 'Ticker',
			isHidden: true,
		},
		{
			_id: SourceLayer.Logo,
			type: SourceLayerType.GRAPHICS,
			_rank: 204,
			name: 'Logo',
			isHidden: true,
		},

		{
			_id: SourceLayer.AudioBed,
			type: SourceLayerType.AUDIO,
			_rank: 203,
			name: 'Audio Bed',
			abbreviation: 'Bed',
			isHidden: true,
		},
		{
			_id: SourceLayer.StudioGuests,
			type: SourceLayerType.UNKNOWN,
			_rank: 204,
			name: 'Studio Guest',
			abbreviation: 'Guest',
			isHidden: true,
			isGuestInput: true,
		},
		{
			_id: SourceLayer.HostOverride,
			type: SourceLayerType.AUDIO,
			_rank: 205,
			name: 'Host Mic override',
			abbreviation: 'HostMic',
			isHidden: true,
		},
		{
			_id: SourceLayer.DVE_RETAIN,
			type: SourceLayerType.UNKNOWN,
			_rank: 206,
			name: 'DVE Retain',
			abbreviation: 'DVE',
			exclusiveGroup: 'pgm',
			isHidden: true,
		},

		{
			_id: SourceLayer.Script,
			type: SourceLayerType.SCRIPT,
			_rank: 50,
			name: 'Script',
			abbreviation: 'Scr',
		},
	]
	return layers
}
