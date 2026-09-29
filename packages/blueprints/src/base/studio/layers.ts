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
	/** Look A (BG channel A) sticky `loops/bg_loop` underlay (layer 110) — never CLEAR. */
	CasparCGLookBgLoop = 'casparcg_look_bg_loop',
	/** Look B (BG channel B) sticky `loops/bg_loop` underlay (layer 110). */
	CasparCGLookBgLoopB = 'casparcg_look_bg_loop_b',
	/** Look A (BG channel A) fullscreen clip / SYN / weather (layer 111, above bg_loop). */
	CasparCGClipPlayer2 = 'casparcg_clip_player2',
	/** Look B (BG channel B) fullscreen clip / SYN / weather (layer 111). */
	CasparCGClipPlayer2B = 'casparcg_clip_player2_b',
	CasparCGClipPlayerPreview = 'casparcg_clip_player_preview',
	/** Headline ILU media framed with MIXER FILL — must not share ClipPlayer1 with the bg loop. */
	CasparCGIluPlayer = 'casparcg_ilu_player',
	/** LED pod underlay under headline ILU movs (`assets/pod_headline`, layer 112). */
	CasparCGLedPodHeadline = 'casparcg_led_pod_headline',
	CasparCGEffectsPlayer = 'casparcg_effects_player',
	/**
	 * Classical story wipe (`wipes/wipe`) — PGM Caspar layer 205.
	 * Themed wipes use sibling mappings below so Sofie PRELOAD of one file cannot
	 * LOADBG-evict another on the same physical layer (cold PLAY Latency 22–34f).
	 */
	CasparCGPgmEffectsPlayer = 'casparcg_effects_player_pgm',
	/** Themed SJV wipe (`wipes/wipe_sjv`) — PGM Caspar layer 206. */
	CasparCGPgmEffectsPlayerSjv = 'casparcg_effects_player_pgm_sjv',
	/** Themed ŠPORT wipe (`wipes/wipe_sport`) — PGM Caspar layer 207. */
	CasparCGPgmEffectsPlayerSport = 'casparcg_effects_player_pgm_sport',
	/** Themed Počasie wipe (`wipes/wipe_pocasie`) — PGM Caspar layer 208. */
	CasparCGPgmEffectsPlayerPocasie = 'casparcg_effects_player_pgm_pocasie',
	/**
	 * PGM route from BG A — always-live MEDIA `route://bgA` on layer 110.
	 * Takes cut by opacity/volume; never re-PLAY a fresh route producer.
	 */
	CasparCGPgmRouteA = 'casparcg_pgm_route_a',
	/**
	 * PGM route from BG B — always-live MEDIA `route://bgB` on layer 111.
	 * Baseline defaults this layer visible (rehearsal / headlines underlay).
	 * Sofie layer id kept as `casparcg_pgm_route` so existing studio mappings still resolve.
	 */
	CasparCGPgmRoute = 'casparcg_pgm_route',
	/** PGM intro / znelka overlay (channel 2 layer 210) — never LED; stays above the route. */
	CasparCGPgmIntroPlayer = 'casparcg_intro_player_pgm',
	/** Look A DoubleBox story ILU (BG A layer 116) — left window; not headline chrome. */
	CasparCGPgmIluPlayer = 'casparcg_pgm_ilu_player',
	/** Look B DoubleBox story ILU (BG B layer 116). */
	CasparCGPgmIluPlayerB = 'casparcg_pgm_ilu_player_b',
	/**
	 * Live CAM ingest helper channel (default Caspar **5**) — the only mapping that
	 * opens DeckLink / dshow. Look A/B camera layers route from here.
	 */
	CasparCGPgmCameraIngest = 'casparcg_pgm_camera_ingest',
	/** Look A CAM framed into the DoubleBox right window (layer 115 under ILU) — usually route://ingest. */
	CasparCGPgmCamera = 'casparcg_pgm_camera',
	/** Look B CAM (BG B layer 115) — usually route://ingest. */
	CasparCGPgmCameraB = 'casparcg_pgm_camera_b',
	/** Look A DoubleBox compositing frame (alpha loop) — above ILU/CAM, below L3D. */
	CasparCGPgmDoubleBoxLoop = 'casparcg_pgm_doublebox_loop',
	/** Look B DoubleBox compositing frame (BG B layer 118). */
	CasparCGPgmDoubleBoxLoopB = 'casparcg_pgm_doublebox_loop_b',

	CasparCGGraphicsLowerThird = 'casparcg_graphics_l3d',
	/** Look A topic L3Ds that belong inside the wiped scene (BG A layer 121). */
	CasparCGGraphicsPgmLowerThird = 'casparcg_graphics_pgm_l3d',
	/** Look B topic / SYN L3Ds (BG B layer 121). */
	CasparCGGraphicsPgmLowerThirdB = 'casparcg_graphics_pgm_l3d_b',
	CasparCGGraphicsTicker = 'casparcg_graphics_ticker',
	CasparCGGraphicsStrap = 'casparcg_graphics_strap',
	/** 360° sekúnd logo-bug — mapped to PGM channel (not LED). */
	CasparCGGraphicsLogo = 'casparcg_graphics_logo',
	CasparCGAudioBed = 'casparcg_audio_bed',
	/** Background music bed on PGM — mirrors LED audio bed so PGM consumers hear kolíska. */
	CasparCGAudioBedPgm = 'casparcg_audio_bed_pgm',

	/** Debug burn-in labels (layer 990) — one mapping per hypercomposed channel. */
	CasparCGDebugLabelLed = 'casparcg_debug_label_led',
	CasparCGDebugLabelPgm = 'casparcg_debug_label_pgm',
	CasparCGDebugLabelDoubleBox = 'casparcg_debug_label_doublebox',
	CasparCGDebugLabelFull = 'casparcg_debug_label_full',
	CasparCGDebugLabelCamIngest = 'casparcg_debug_label_cam_ingest',
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
