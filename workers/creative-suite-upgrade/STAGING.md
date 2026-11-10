# Standalone unpublished asset delta

`stage_assets.py` consumes only the exact successful build receipts and ZIPs listed in `stage-inputs.json`. Photo explicitly selects `photocraft-with-fonts`, and its compiler receipt is separately hash-verified. It writes a fresh external directory containing `public/` version scopes plus manifests. This is **not a complete ASSETS inventory and must not be deployed in isolation**. It contains no stable-route switch, launcher rewrite, gateway edit, upload or deployment command.

The stage must later be reconciled with the complete independently verified live inventory, including the unchanged FigFlow EDM 0.11.2 integration and every retained old version path. `version-flow1` names identify this candidate only; global path availability is not proven by creating a fresh local directory.

## Stored files and gateway contract

Oversized WASM files are compressed sequentially with Node's standard-library Brotli quality 11. Raw oversized WASM is never written to the stage. Each encoded file must round-trip to the original bytes, and every stored public file must be strictly smaller than 25 MiB. Other oversized files are rejected. Compression failure leaves an incomplete evidence directory without a success receipt; use a new output root rather than overwriting it.

- `compressed.json` maps the requested WASM URL to the actual `.wasm.br` URL as **string-to-string** entries.
- `asset-sha256.json` hashes decoded response bytes by requested URL, matching the preserved builder convention.
- `stored-assets.json` records actual filenames, encoded size/hash, decoded URL/size/hash and encoding.
- `stage-receipt.json` records the exact input receipts/ZIPs, manifest hashes, limits and the incomplete-inventory restriction.

Source review compared the preserved `workers/craft-editors/worker.mjs` and `prepare.py` with current-main `workers/creative-motorstack-brand-release/source/worker.js` and the release builder. Both gateways look up a requested URL in the compressed string map, fetch its mapped asset, and serve it with `Content-Type: application/wasm`, `Content-Encoding: br` and manual body encoding. Current-main's captured worker embeds this table as `compressed_default`. The new delta table is compatible in shape but is not automatically merged into that captured worker. Publication requires a separately reviewed complete-inventory merge, including the compressed table; changing only static files would not be sufficient.

Only `.htaccess` and `_headers` from upstream packaging are omitted because they are host-specific configuration. License, attribution and font files are retained. ZIP paths, symlinks, duplicate/file-directory/encoded-name collisions, unsafe URL characters, unsupported/encrypted ZIP members, expansion/member limits, overwritten outputs and mismatched receipt/package hashes are rejected.

## Run

```sh
python3 workers/creative-suite-upgrade/stage_assets.py \
  --builds /Volumes/Backups/Development/creative-suite-upgrade-20261110/builds \
  --output /Volumes/Backups/Development/creative-suite-upgrade-20261110/assets-candidate-standalone-flow1 \
  --node /path/to/node

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s workers/creative-suite-upgrade -p 'test_stage*.py' -v
```

Tests use temporary ZIP fixtures and real Brotli compression. This stages existing binaries; it does not compile an editor. Local file/hash/round-trip verification does not establish hosted delivery, authentication, browser runtime, or save/reopen acceptance. Root's manual build receipts remain independent from the unexecuted candidate bootstrap/build helper.

## Verified staged candidate

The retained `stage-verification.json` records all six packages: 185 stored assets, 159,455,929 total stored bytes, and three Brotli files. Effect is 14,162,426 bytes, Film 12,682,235 bytes and Vector 23,382,437 bytes. The largest actual file is Fig's uncompressed WASM at 25,546,822 bytes, below the strict 26,214,400-byte limit. Every stored file was independently re-read and hashed; every compressed file was independently decoded and checked against its original hash/size. Nine fixture guard tests passed. No editor build or deployment ran during staging.

Recheck a retained stage without recompressing:

```sh
node workers/creative-suite-upgrade/verify-stage.mjs /path/to/assets-candidate-standalone-flow1
```


## Photo startup repair — 10 November

Browser startup qualification found that Photo's relocated `app/photocraft-web.js` imported `./snippets/eframe-d31a8450ea12dfc1/inline0.js`, while the ZIP included that module only at root `snippets/`. The official upstream 0.22.0 ZIP has the same layout defect; `packaging/web/package.sh` copies the glue into `app/` without its relative snippets.

`repair_photo_package.py` adds the verified root snippet under `app/snippets/` in a new ZIP, preserving all54 original file payloads. No Rust source, Cargo.lock, WASM or compressed WASM part changes. Corrected Photo scope is `0.22.0-flow2`; previous outputs remain retained. ZIP SHA256 `7752ab741a35d3f2b94a0cac68c13127f3b718a0294ade980b8892a5223d572f`,45,330,944 bytes. Selected build receipt lives under `builds/photocraft-with-fonts-and-snippets/` on the backup drive.

Fresh stage: `/Volumes/Backups/Development/creative-suite-upgrade-20261110/assets-candidate-standalone-flow2` (186 stored files). Every literal relative JavaScript dependency resolves across all6 packages, including dynamic `import()` and export-from paths. The staging helper now rejects unresolved literal module imports before issuing a success receipt. Nonliteral dynamic imports and browser execution still require runtime acceptance.

Three unchanged Brotli assets were reused only after input archive/hash checks and lossless decoded-byte comparison; output files are newly written. The reuse fixture confirms differing input is rejected. This avoids recompressing unchanged binaries and does not trust a cache key alone. Actual stored/decoded files passed `verify-stage.mjs` again. No deployment occurred.


## Film browser encoder correction and stageflow3

Selected Film package is `filmcraft-flow2/filmcraft-web-0.19.0-flow2.zip`, SHA256 `2c99b48538caa7f37bd53a53ff325f2df2fc50a1d8b2ac33658f522513e8587b`,18,535,895 bytes. The successful compiler receipt and unchanged Cargo.lock were verified. Its explicit archive root is bounded to the pinned engine/version plus a Flow suffix. New Film WASM SHA256 is `217b2a5e447bb0334e6487477289789d1ca82255ca643af8b6207d46ffc85101`; real MP4 browser acceptance remains separate.

Fresh final standalone stage is `/Volumes/Backups/Development/creative-suite-upgrade-20261110/assets-candidate-standalone-flow3`. Effect/Vector Brotli files were reused only after hash and decoded-byte equality checks; Film's new binary was freshly compressed with quality11. The actual stage passed all stored/decoded hash, file-size, exact-inventory and literal JavaScript module-resolution checks. Film and Photo use flow2 paths; earlier stages and packages remain unchanged. The connected candidate adds the preserved Fig library shell and separate canonical promotion module; see `../creative-suite-release/README.md`.
