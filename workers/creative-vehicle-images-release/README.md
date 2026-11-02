# MotorStack vehicle image release

`build.py` patches the pinned offer-artwork Creative Worker. The all-model media list now uses the published model heroes without requesting the large variants catalogue. Selecting a model still requests its paint and gallery images. The private service binding retains a 60-second, credential and model scoped catalogue cache so previews do not rebuild the same list. The cache holds plain validated data and is capped at 20 entries.

The Pages UI starts with all models and all colours, renders previews in batches, and shows intrinsic dimensions plus transfer size when the browser exposes it. The image import still uses the original source file and the existing validation and storage path.

Build and check the release candidate:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 workers/creative-vehicle-images-release/build.py
node --test workers/creative-vehicle-images-release/vehicle-images.test.mjs
node workers/creative-vehicle-images-release/prepare-cli.mjs FULL_CURRENT_MAIN_SHA
```

The generated `dist/` modules and Wrangler config are ignored. The deploy config inherits the existing assets, credentials and FigFlow service binding. Record the reviewed commit and both deployment IDs when releasing.
