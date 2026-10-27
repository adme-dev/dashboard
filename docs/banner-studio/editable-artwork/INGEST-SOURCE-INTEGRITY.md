# PNG source integrity — local integration checkpoint

27 October 2026, 15:12 UTC. This increment has passed independent integration review and release-candidate qualification. Independent integration review found no blocker; the subsequent signature check closes MIME relabelling bypass with two red/green tests. It does not complete R01 ownership, full reconstruction or hosted Dissector acceptance.

Supported PNG uploads now undergo structural and streamed scanline validation before storage, row insertion or queue dispatch. The exact original is retained, with server-generated SHA-256, byte length, MIME and pixel dimensions in `manifest.source`. Processing compares the stored original against that identity before inference. A present invalid identity fails closed; absence retains the existing legacy path.

Retry and progress updates preserve source identity from the existing database row. They never accept it from generated artwork. Retry still clears the previous artwork and import receipt, and existing result-ID algorithms, generation claims, deadlines, cancellation and import semantics remain unchanged.

Only static, noninterlaced 8-bit PNGs in the documented subset receive verified identity. Limits are 10 MiB, 4096px per edge, 10,000,000 pixels and 10,000 chunks. Common fixed-size colour/resolution metadata is supported; unsupported metadata and encodings are rejected clearly. JPEG and WebP retain their existing upload paths without verified-source metadata. Physical A4 intent is not inferred from pixel dimensions or pHYs.

The first attempted reuse of the existing full decoder was rejected in review: valid A4 JPEG exceeded its 64 MiB decoder budget, and large PNG validation retained full image buffers. The final PNG implementation streams zlib data without producing RGBA. Neither runtime nor decoder memory limits were raised. See [independent findings](INGEST-VALIDATION-REVIEW.md) and [the bounded validator and runtime evidence](INGEST-PNG-VALIDATION.md).

## Verification

- Three upload regressions first proved that empty, text-as-PNG and truncated PNG data were stored and queued. They pass after validation moved before side effects.
- Exact-original-byte/hash tests pass. A real 2480×3508 JPEG regression proves legacy upload remains available and receives no decoded-validation claim.
- Six pipeline regressions first failed because changed hash, size, dimensions, MIME, version and null source identity reached inference. All now fail before provider, segmentation or output calls; exact matching bytes reach inference once.
- Two actual PostgreSQL regressions first demonstrated source loss on progress and retry. After the SQL correction, the full 45-test disposable database suite passes, including concurrency, cancellation and acknowledgement uncertainty. Synthetic auth, storage and providers remain explicit test boundaries; the owned cluster was stopped and removed.
- The integrated suite passes 259 tests across nine files, including the helper's 124 tests and actual local workerd. Targeted lint passes for all ten source/test/page files. The final candidate verification below includes subsequent formatting and MIME-guard changes.
- The measured A4 RGBA helper peak was about 6.6 MiB of Node ArrayBuffers versus about 99.6 MiB for full pngjs decoding. These are local sampled observations, not hosted memory guarantees.

Durable local receipts are under `output/editable-artwork-ingest/`; detailed red/green logs remain under `/private/tmp/banner-ingest-*`. The database proof copies the existing owned-cluster runner with a separate output destination and current dirty-source provenance, preserving prior recovery evidence. No production database, provider or native-container invocation was used.

## Remaining boundaries

Independent review and candidate checks are complete; guarded release and hosted validation remain open. The existing multipart parser buffers before the file-size check; this change bounds PNG validation, not the entire request-ingress memory budget. Client/project authority, protected derived-asset delivery, physical metadata, verified JPEG/WebP decoding and complete R01 acceptance remain separate work in [the owned-ingestion plan](OWNED-INGEST-PLAN.md). Production engine execution and AI-provider acceptance remain separately gated.

## Candidate qualification — 27 October, 15:12 UTC

The independently reviewed files were copied and hash-verified into `banner-artwork-release-20261027`, preserving its clean current-main base. Candidate checks pass **282 tests across 12 files** (261 ingestion/job checks including real workerd, plus 21 deployment guards), all ten touched source/test/page files pass lint, and all **45 disposable PostgreSQL cases** pass on candidate source with cleanup verified. This includes the final MIME mismatch guard and typed fixtures. No provider or production database call was used.

Baseline full CI `40519026264` passed on `7eb52a6736989aacb3c4bd62ac086baf8a1bf0f4`: 20,631 tests passed and 3,809 optional tests skipped; production build and all six exact-artifact checks passed. That CI precedes this ingestion increment and does not substitute for its candidate build/CI or hosted validation.
