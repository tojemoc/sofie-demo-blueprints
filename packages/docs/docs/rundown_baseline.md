---
sidebar_position: 8
---

# Rundown Baseline

The Rundown Baseline tells Sofie how the hardware in the studio should be configured when "at rest" (for example, when the Rundown in question is active but not yet playing). The Demo Blueprints' Rundown Baseline does the following:

- Configures a few ATEM SuperSource properties, such as the background art and boxes
- Configures the ATEM DSK used for Graphics
- Configures the ATEM AUX outputs
- Configures the vMix overlay graphics input
- Configures the CasparCG clip player preview
- Configures the Sisyfos audio channels

Hypercomposed studios also baseline:

- LED + Full (BG B) companion `loops/bg_loop`
- PGM `route://{bgChannelB}` (Full, default **4**) so rehearsal Ready already shows Full

Intro keeps Full underlay beneath the PGM overlay. Logo-bug (`assets/countup`) is revealed on the first DoubleBox, still on PGM above the route. See [PGM route contract](./pgm_route_contract.md).
