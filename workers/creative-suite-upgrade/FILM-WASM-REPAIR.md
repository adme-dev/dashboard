# FilmFlow 0.19.0-flow2 browser H.264 repair

The bounded browser export (320×180, 24 fps, custom 0–1 second) failed before encoding with `cannot build the 1-thread pool: operation not supported on this platform`. Upstream `crates/h264enc/src/lib.rs` constructed an explicit Rayon pool even on wasm32. The browser build now uses the existing `Pool(None)` path; native builds retain the original fallible explicit pool. Encoder slices, rate control, formats and storage identifiers are unchanged.

Rayon-core 1.13.0 is pinned in Cargo.lock. Its [documented global sequential fallback](https://docs.rs/rayon-core/1.13.0/rayon_core/) supports the blocking joins and parallel iterators used by this encoder; explicit ThreadPoolBuilder has no fallback. No Web Workers, shared memory, headers or native threading changes are introduced.

## Regression evidence

`test_film_wasm_encoder.py SOURCE NEW_FIXTURE_DIR TARGET_DIR` builds an actual default-feature wasm32 encoder fixture and runs it in Node WebAssembly with no imports. Four 64×80 frames exercise lookahead, AQ, two slices, B-frame buffering and flush. Before the fix, the fixture returned constructor-error code100 instead of4 and the assertion failed. After the fix it returns4. This proves encoder operation, not browser download or MP4 playback.

The helper requires the existing pinned Rust1.95.0 wasm32 target, Cargo cache and Node24 on PATH. It installs nothing; caller supplies CARGO_HOME/RUSTUP_HOME. It creates a separate fixture lock seeded from the source lock and does not edit source dependencies.

External evidence: `/Volumes/Backups/Development/creative-suite-upgrade-20261110/ports/filmcraft/wasm-regression/` contains red/green logs, original source and flow1 patch, build driver, native test commands/results and exact patch replay receipts.

Native default encoder unit tests21/21, no-default encoder unit tests21/21 and export determinism tests13/13 pass. Native invalid-configuration and thread-count independence integration tests also pass (one each), and the reusable WASM helper replay passes. Logs and the final package receipt are recorded in the external evidence directory.

## Provenance and remaining acceptance

Final patch SHA256: `0ae6f5451631468fe0054620dfc08090f97e2ea3a15a20c340b04f166d900eac`. Exact pristine replay applies49 files/277 hunks with no fuzz or offsets and matches all patched source bytes. Cargo.lock remains `ef042555a5b44d503ee9b0844d3c226b5bb287e4b30671220020a32f18d17cb5`.

The new package is built into `builds/filmcraft-flow2/filmcraft-web-0.19.0-flow2.zip` under the external root. The old build/ZIP and receipts remain intact. The deployable URL scope must be `/filmflow/0.19.0-flow2/`, never overwrite flow1. A new stage and browser export/download/decode check are still required; this work does not deploy or mutate Cloudflare.

Package SHA256: `2c99b48538caa7f37bd53a53ff325f2df2fc50a1d8b2ac33658f522513e8587b` (18535895 bytes). WASM SHA256: `217b2a5e447bb0334e6487477289789d1ca82255ca643af8b6207d46ffc85101`. Package ZIP integrity checked; browser acceptance remains pending.

## Local browser acceptance

Root tested the rebuilt flow2 in Brave at127.0.0.1:8778. It reopened the exact previously saved native demo project, then one unique-name320×180 custom0–1second H264/AAC export downloaded successfully. MP4 SHA256 `8d7077f204b98fe4ba6714ab72913a22dc336a61d9960e3fc854ca8a213a4546`,106,144 bytes. ffprobe counted24H264frames at24000/1001 and48kHzstereoAAC, duration1.002s; full ffmpeg decode exited0. Receipt: backup `browser-evidence/filmflow-flow2-local.json`. Hosted acceptance and publication remain separate.
