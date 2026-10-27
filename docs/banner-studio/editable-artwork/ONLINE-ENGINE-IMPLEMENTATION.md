# Online engine foundation implementation

27 October 2026. Continuation authorised by Paul after ONLINE-ENGINE-DESIGN.md. Implement a bounded engine job boundary and prove actual headless Linux execution locally. Preserve Banner Studio as document authority; this increment does not provision public compute or claim every engine integration.

Source: fresh origin/main `ec2b67ff4d7952ca0ea33a4cd98365a1d9a18798`. Existing documentation commit rebased to HEAD `6c9d2cff5e3eb2210598a0ac35ff4398dd312dd5` before implementation. All 213 existing modified/untracked non-output files retained identical SHA-256 values; proof under `output/editable-artwork-online-engine/pre-rebase-hashes.json`. Parent checkout untouched. No merge, deployment or purchase.

## First executable slice

Define a strict versioned request/result contract for a selected pinned engine to render a supplied native document to a PNG preview. Request binds job/attempt, project/client/source revision/hash, engine/version, operation, input asset identity/hash/size and limits. No arbitrary command, script, URL or output path may be supplied by a job. Unsupported engines/operations fail explicitly.

Build an isolated local runner with a trusted configured adapter, staged immutable inputs, output hash/type/dimension validation, deadlines/cancellation, bounded process output, no automatic mutation retry and result/proposal identity fencing. This is a worker execution boundary, not a replacement application queue or authority store. Production queue/transport/authentication and result import must be connected separately after this contract is tested.

Prove PhotoCraft and, if its Linux CLI is available, VectorCraft rendering in disposable Linux containers. Download only pinned official releases after checking hashes; retain notices. Use no network during engine execution, read-only inputs, separate output/scratch mounts, an unprivileged user and explicit CPU/memory/process/time limits. Test native text/masks/alpha and an exact reference render where supported. Stop only owned processes/containers and retain small evidence. Document any missing runtime honestly.

## Ownership and acceptance

1. Contract worker: new `shared/bannerEngine.ts`, optional new server-side pure result-boundary utility, focused tests and ONLINE-ENGINE-CONTRACT.md. Coordinate exact exported types with runner worker before edits depend on them.
2. Runner worker: new `workers/banner-engine/runner/` plus tests and ONLINE-ENGINE-RUNNER.md. No deployment or database migration. Use the shared contract and coordinate runtime adapter shape with Linux worker.
3. Linux worker: new `workers/banner-engine/runtime/`, local proof scripts and ONLINE-ENGINE-LINUX.md, plus ignored output. Own container/build/download actions; no shared application edits.
4. Coordinator: source reconciliation, integration proof, public capability documentation, overall report and independent review.

Meaningful tests must cover wrong tenant/project/source/result identity, altered input/output hashes, unsupported engine/version/operation, malformed/native paths, cancellation/timeout, duplicate attempts, oversized output and resource failures. A rendered preview is not an editable round-trip or print acceptance. No claimed native import until the corresponding adapter's validation succeeds.

Paul supplied the ArtCraft online hub screenshot during this continuation. Preserve its useful separation of creation, editing and assets in the product direction. AI image/video/audio generation and 3D capabilities are distinct from deterministic Rust editing engines. This foundation implements engine execution, not all hub cards or 3D support.


## Implemented application and integration surface

The Creative Studio home is `app/pages/agency/creative.vue`, linked in the existing creative navigation in `app/layouts/agency.vue`. It reuses `/agency/banner-studio`, `/agency/audio/projects?mediaType=av` and `/agency/audio`, plus existing templates, brand kits, audio projects and banner uploads. Existing creative-role middleware owns access. No new generation catalogue, asset library, database or provider call was introduced. Public feature index/detail and MarketingNav describe the home as a local preview; engine infrastructure is not advertised as hosted.

`prove-creative-home.mjs` exercises the actual Nuxt application with explicit local auth/read fixtures and denied writes. Dark/light desktop, narrow-screen resource reachability, destination links and finance-role denial are covered. This is fixture-backed browser proof, not hosted authentication/provider acceptance. Screenshot directory: `output/editable-artwork-online-engine/creative-ui/`.

`prove-engine-job.ts` invokes the actual Linux adapter through the durable runner and independently checks the result with the server validator. The output identity is reserved before execution. Both engines are checked for accepted PNG bytes, exact retained input, duplicate attempt rejection, invalid input rejection, pre-cancellation, stale source rejection, wrong client rejection and output-byte tampering. Synthetic project authority is explicit; no project is written to the application database. Real active cancellation/resource/container checks belong to the separate Linux safety proof.

Final proof paths are recorded below. No hosted end-to-end or complete editable interchange claim is made.

## Remaining integration work

- Wire the existing platform job authority, authenticated transport and owned storage to a deployed Linux worker. Keep active-attempt and source-revision compare-and-swap in the same result-persistence transaction.
- Provision licensed/pinned fonts and require font/metric checks before accepting changed native text. Current Linux synthetic fixtures substitute Arial and resolve Inter Bold to SemiBold; matching Linux reopen pixels does not prove the requested font.
- Add reviewed native change proposals through the established Banner document bridge. This first online operation returns PNG preview evidence with `editableImport: false`.
- Prove EffectCraft, FilmCraft, FigCraft and SoundCraft runtime adapters separately. Recognized engine IDs alone do not enable execution. Existing audio/video application workflows remain the user-facing path.
- Obtain real provider quality and hosted project evidence; complete the four-side artwork and print gates. No automatic perfect flatten-to-editable recovery is claimed.


## Coordinator verification

| Check | Result | Evidence |
|---|---|---|
| Native Linux documents | 13 predicates pass: native text edit/save, untouched layer and mask retention, pixel/vector mask effects, fractional alpha, Linux reopen/undo exactness | `output/editable-artwork-online-engine/linux/proof-2026-10-27T02-21-08.831Z/acceptance.json` |
| Runtime safety | Seven checks pass: incorrect executable digest, active cancellation, deadline, log cap, file size cap, existing output protection and inspected resource/isolation settings | `output/editable-artwork-online-engine/linux/safety-2026-10-27T02-21-16.736Z/safety.json` |
| Runner to real Linux to result validator | PhotoCraft and VectorCraft pass all eight assertions each; final configuration and proof files retained beside receipt | `output/editable-artwork-online-engine/integration-2026-10-27T02-22-57-080Z/evidence.json` |
| Creative home | Actual Nuxt fixture navigation, public feature page, dark/light desktop, mobile scrolling and finance-role denial; no page errors or writes | `output/editable-artwork-online-engine/creative-ui/evidence.json` |
| Focused regression | 156 passed in six files; five additional bridge-editor/archive tests passed, and the initially skipped actual native bridge case subsequently passed with its real local artifact path (162 unique selected cases) | `regression.log`, `bridge-regression.log`, `bridge-editor-actual.log` under the same output root |
| Strict integrated types | Passed for shared contract, pure server boundary, runner, JS runtime adapter and integration proof | `output/editable-artwork-online-engine/typecheck.log` |
| Scoped lint | Passed for new application/runtime/integration paths and changed feature pages | `scoped-lint.log`, `final-lint.log` |
| Existing marketing lint | MarketingNav retains exactly the same 35 HEAD diagnostics by rule, message and source line; no whole-file formatting applied | `marketing-lint-baseline.json` |

The final trusted runtime image is `sha256:1fbdad626b0f743bfcd4fd308342b7feeb877473579da2ca52d0e97cda9597f8`. Runtime binary hashes are verified inside the immutable image before the engine executes. Preparation compares copied executables to members of the checksum-verified official archives. Capability manifests bind actual native acceptance bytes; setup-only packaging manifests cannot activate the public adapter. Failed cleanup cannot be reported as verified absence.

The integration script preserves exact manifest/proof snapshots for future audits. Earlier integration directories are historical runs against earlier proof identities and must not substitute for the final directory above. Native alpha sample includes RGBA `(240,80,40,128)` and VectorCraft mask alpha128; raster transparency is not confused with native text editability.

No full production build or hosted test was run. The local Nuxt server on port3137 was stopped after browser verification, and Orca reported no remaining workspace listeners. Container cleanup is checked per owned container; shared Docker/Colima and unrelated containers are preserved.


## Final source and team settlement

Independent review [ONLINE-ENGINE-REVIEW.md](ONLINE-ENGINE-REVIEW.md) accepts the bounded local foundation after one P1 and two P2 findings were fixed and rechecked. Contract `ctx_316fe3cf3c87`, runner `ctx_04f804192c54`, Linux runtime `ctx_209b8e935622` and reviewer `ctx_eb9bf3a4a917` all succeeded and were released with captured transcripts. Run `run_666e5ba6039d` has no reclaimable worker terminals.

After all workers stopped writing, reconciled current origin/main `4469d6a2fb873c2d7b90ece9a359dd571def0ba2` into HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`. The two incoming commits changed only the unrelated ITA dealer ledger. All 237 existing modified/untracked non-output files retained identical SHA-256 values through the tracked-only stash/rebase/apply sequence; the exact owned stash was dropped after verification. Evidence: `output/editable-artwork-online-engine/final-reconciliation.json` and `final-pre-rebase-hashes.json`. At reconciliation, branch was one documentation commit ahead and zero behind. No application source changed during reconciliation, so the measured checks remain applicable; only this completion documentation was updated afterward.

Changes remain local and uncommitted. Parent checkout and other contributors' work are preserved. No merge, production or preview deployment, client publication or subscription purchase occurred. Orca card is in review; it is not marked product-complete.
