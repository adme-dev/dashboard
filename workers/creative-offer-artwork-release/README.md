# MotorStack offer artwork release

This candidate adds offer hero images to the existing private MotorStack catalogue. The current Creative Worker also serves FigFlow EDM. `build.py` reconstructs that current gateway through the reviewed FigFlow release source, checks its two module hashes, and changes only:

- the media catalogue to include safely validated offer hero images under opaque asset IDs;
- the private offers catalogue to return the same opaque ID with title, offer copy, price, end date and disclaimer.

The media import route rebinds each ID to the current OEM catalogue before downloading. It retains the existing exact host allowlist, redirect checks, MIME and byte limits, managed Banner Studio storage, and private/no-store preview headers. Provider URLs and credentials stay out of catalogue responses. Unsupported image URLs produce no artwork ID. The Creative Worker HTTP authentication, seven launcher cards, FigFlow routes, assets and four existing bindings are preserved.

The reconstructed base matches the source composition recorded for active version `c74e9804-3e14-4a2b-a6b7-b65e79266008`, deployment `4b9f9b97-bdaa-4603-a154-a69f52d88b6c`, whose observed script etag is `1f84dbf76edc2d267209ff70734a30f8eaed003e19da4f8fb2b33a8f3d719f7f`. Wrangler does not provide an independently downloaded module copy here. Recheck the active and latest versions before upload; stop if either changes. Never release the older `creative-motorstack-brand-release` candidate directly because it predates the FigFlow gateway.

## Build and tests

```sh
python3 workers/creative-offer-artwork-release/build.py
node --test workers/creative-offer-artwork-release/*.test.mjs
```

## Production release

Use the repository's current, clean, merged `origin/main`. Confirm the active version, latest uploaded version, runtime, four binding names/types and script etag with normal Wrangler CLI readback. Do not use the older custom API transport. The new candidate must preserve the FigFlow service binding target `xeroflow-figflow-edm-assets` in `production`, `keep_assets: true`, compatibility date `2026-10-27`, flag `global_fetch_strictly_public`, and standard usage model.

```sh
node workers/creative-offer-artwork-release/prepare-cli.mjs FULL_CURRENT_MAIN_SHA
pnpm exec wrangler versions upload --config workers/creative-offer-artwork-release/dist/wrangler.release.json --no-bundle --dry-run --outfile /private/tmp/offer-artwork-dry-run.bin
```

Inspect the serialized multipart metadata and both module-part hashes against `dist/manifest.json`. It must contain no asset directory, manifest, JWT or copied secret. Upload is a separate version-only step:

```sh
pnpm exec wrangler versions upload --config workers/creative-offer-artwork-release/dist/wrangler.release.json --no-bundle --outfile /private/tmp/offer-artwork-upload.bin
```

Verify the submitted hashes, accepted version ID, annotation, runtime and inherited bindings through `wrangler versions view`. Then activate only that version with `pnpm exec wrangler versions deploy VERSION@100% --name xeroflow-creative-tools`. Confirm the new deployment shows 100% traffic and retest Creative Worker HTTP authentication, launcher/editor assets and FigFlow routes before deploying Pages.

Deploy current main with `pnpm deploy:check` and `pnpm deploy:production`. Verify the authenticated offer card shows the correct hero, import returns a managed asset, the banner contains editable offer text and full supplied disclaimer, and QR Codes still loads. Source publication, configuration, deployment and rendered results are separate evidence.
