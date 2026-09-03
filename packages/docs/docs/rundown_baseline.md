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

Hypercomposed story looks are **not** in the rundown baseline. PGM starts without a route; the first camera / VT / VO / GFX part attaches `route://{bgA|bgB}` on take. Logo-bug (`assets/countup`) is revealed on the first DoubleBox, still on PGM above the route.
