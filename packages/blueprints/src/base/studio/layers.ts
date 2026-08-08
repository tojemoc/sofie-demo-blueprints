export enum AtemLayers {
	AtemMeProgram = 'atem_me_program',
	AtemMePreview = 'atem_me_preview',
	AtemDskGraphics = 'atem_dsk_graphics',
	AtemSuperSourceProps = 'atem_supersource_props',
	AtemSuperSourceBoxes = 'atem_supersource_boxes',
}

export enum VMixLayers {
	VMixMeProgram = 'vmix_me_program',
	VMixMePreview = 'vmix_me_preview',
	VMixOverlayGraphics = 'vmix_overlay_graphics',
	VMixDVEMultiView = 'vmix_dve_multiview',
}

export enum CasparCGLayers {
	CasparCGClipPlayer1 = 'casparcg_clip_player1',
	CasparCGClipPlayer2 = 'casparcg_clip_player2',
	CasparCGClipPlayerPreview = 'casparcg_clip_player_preview',
	/** Headline ILU media framed with MIXER FILL — must not share ClipPlayer1 with the bg loop. */
	CasparCGIluPlayer = 'casparcg_ilu_player',
	CasparCGEffectsPlayer = 'casparcg_effects_player',
	/** PGM story-block alpha wipe (channel 2 layer 200). */
	CasparCGPgmEffectsPlayer = 'casparcg_effects_player_pgm',
	/** PGM intro / znelka overlay (channel 2 layer 210) — never LED. */
	CasparCGPgmIntroPlayer = 'casparcg_intro_player_pgm',
	/** PGM DoubleBox story ILU (channel 2 layer 115) — left window; not headline chrome. */
	CasparCGPgmIluPlayer = 'casparcg_pgm_ilu_player',
	/** PGM CAM / UVC (OBS Virtual Camera) framed into the DoubleBox right window. */
	CasparCGPgmCamera = 'casparcg_pgm_camera',

	CasparCGGraphicsLowerThird = 'casparcg_graphics_l3d',
	CasparCGGraphicsPgmLowerThird = 'casparcg_graphics_pgm_l3d',
	CasparCGGraphicsTicker = 'casparcg_graphics_ticker',
	CasparCGGraphicsStrap = 'casparcg_graphics_strap',
	/** 360° sekúnd logo-bug — mapped to PGM channel (not LED). */
	CasparCGGraphicsLogo = 'casparcg_graphics_logo',
	CasparCGAudioBed = 'casparcg_audio_bed',
}

export enum AbstractLayers {
	CoreAbstract = 'core_abstract',
}

export enum SisyfosLayers {
	Baseline = 'sisyfos_baseline',
	Primary = 'sisyfos_primary',
	Guests = 'sisyfos_guests',
	HostOverride = 'sisyfos_host_override',
	ForceMute = 'sisyfos_forceMute',
}
