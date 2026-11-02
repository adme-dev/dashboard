# Multi-brand offer date release

`build.py` patches the pinned vehicle-image Creative Worker. MotorStack supplies Renault offer end dates such as `31 December 2026`; the existing catalogue rejected these and returned 502 for the entire brand. The private offer catalogue now converts full English month-name dates to ISO before returning them to Banner Studio. Existing ISO dates pass through. Invalid or ambiguous dates still fail closed.

The generated `dist/` modules are ignored. `worker.js` is byte-for-byte the vehicle-image release; only `brand-rpc.mjs` changes. The release configuration inherits existing assets, secrets and the FigFlow service binding. The UI and Pages endpoint do not change.

Build and test:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 workers/creative-multibrand-release/build.py
node --test workers/creative-multibrand-release/offer-dates.test.mjs workers/creative-vehicle-images-release/vehicle-images.test.mjs
node workers/creative-multibrand-release/prepare-cli.mjs FULL_CURRENT_MAIN_SHA
```
