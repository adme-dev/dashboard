# Editable artwork release review

Independent audit on 27 October 2026 of the isolated candidate against current supplied main `faad3ba572770f2cfb7cd1f2f705ebaf2497f06a`. Reviewer owns only this report in the original worktree; the release candidate was read-only. No Git mutation, remote fetch, deployment, credentials access, provider call or database write was performed.

## Disposition

**Conditional source acceptance; not yet an unconditional release pass.** One new P2 image-decoding issue was reported immediately and its original-worktree correction independently reviewed. The candidate must receive the exact corrected PNG validator, Pages build guard and Dissector binding/ingress sources, then pass the full dashboard build and the coordinator's final release checks. Missing hosted access is recorded separately below; it does not excuse these source/build gates.

At the initial checkpoint the candidate branch is `adme-dev/banner-artwork-release-20261027`; its HEAD and local `origin/main` both resolve to the supplied `faad3ba572770f2cfb7cd1f2f705ebaf2497f06a`. Changes are uncommitted. This reviewer verified local ancestry/state, not fresh remote state. A later read-only checkpoint resolved local `origin/main` to `d45326265f0dec387bd6ae3deb465b616a8f2b68` while candidate HEAD remained `faad3ba57`: one new docs-only commit (#719), touching Nissan evidence and the ITA ledger, with no runtime overlap. Reported immediately to the coordinator; the releasing coordinator must reconcile current main and record final source commit, target and deployment ID.

## Findings and corrective review

1. **P2 — unbounded interlaced PNG inflation (release code gate).** Candidate `server/utils/banner/artworkValidation.ts` initially bounded header dimensions but accepted Adam7 PNGs before `PNG.sync.read`. The installed `pngjs/lib/parser-sync.js` calls bare `zlib.inflateSync` for interlaced input, while the noninterlaced path supplies a calculated output bound. A small compressed user-owned reference or QR center logo can therefore allocate outside the checked pixel budget. This is reachable without image-provider credentials through `platformQr.ts`; no large-allocation exploit was executed. Escalated as `msg_a22cd132ce98`. The original correction now checks first IHDR/8-bit encoding/color type/compression/filter/interlace, rejects repeated IHDR/animation and malformed/excessive chunks before decode, and verifies decoded dimensions/data length. Reviewed the seven tests in `test/server/utils/bannerArtworkPngBounds.test.ts`, including assertions that decoder invocation never occurs on rejected headers. Coordinator reports six red before correction and seven green after; five overlapping artwork/repair suites total 78 passes. Close only on exact candidate copy.
2. **Known Dissector binding gap (release code gate, separately owned).** The initial pipeline read S3 credentials from process state and the queue branch passed null, despite Pages bindings being available on its authenticated HTTP ingress. Reviewed original corrective source in `bannerDissectorPipeline.ts`, `bannerDissector.ts`, `queueConsumer.ts`, upload endpoint and `server/api/internal/process-job.post.ts`. The actual event now carries bucket/provider capabilities, present Cloudflare context is authoritative, source keys must equal the exact database-owned job key, source bodies are bounded, uploaded sources are checked before dispatch, extracted layers receive owner-scoped catalog rows and signed delivery URLs, and cancellation/persistence failure removes only this invocation's new asset. Reviewed the native-bucket, bounded-source, cancellation, persistence-failure and actual ingress/middleware test cases. Acceptance still requires stable candidate copy and owner test receipt; this is not evidence of hosted queue/provider success.
3. **Full-build integration failures (release build gate).** Reviewed the `#shared/bannerFormats` re-export correction in `app/utils/banner-constants.ts` and matching Vitest alias. It preserves the shared format table and resolves the coordinator-reproduced Nuxt SSR relative-import failure. Reviewed the Pages guard correction allowing optional `.mjs` only on a single explicit Nitro dev/prerender entry; hash-pinned production Pages entry transformation and placement rejection remain enforced. The added test actually performs Nitro prepare/prerender/build with the dashboard plugin order, beyond an isolated transform test. Coordinator reports 74 guard/bridge tests passing; full dashboard build remains a separate gate.

No additional concrete P1/P2 was established in the inspected scope. Existing broader limitations are not silently relabelled as newly introduced defects.

## AGENTS and integration checks

- **Aliases and server/frontend boundaries:** inspected changed imports and searched the candidate runtime files. No added server `~/` alias or frontend runtime import was found. Server references to Banner types are type-only; shared runtime contracts use root/relative shared paths. The additional `#shared` fix is called out above.
- **Nuxt UI and reactivity:** new panels use Nuxt UI controls and UFormField; no new raw input/button/select/dialog or browser dialog was found in added diff lines. Pre-existing raw controls in large touched components remain baseline. Custom ease uses `__custom__`, not an empty item value. Selection/proposal watchers and guards cover project epoch, source revision, selection, canvas changes, close/unmount, review revocation and pending async continuations. Native text editing remains available; lettering, repair and companion workflows attach scoped metadata and atomic undo rather than replacing the text inspector. Did not independently repeat a full visual audit or assert the author invoked the form-design skill.
- **Duplicate UI, color and scroll:** checked inspector/menu entry points and new panels for duplicated sections. Shared client/server mask changes preserve RGBA alpha and exclude mask fills; paired HTML-builder changes retain semantic parity. Creative Studio provides its own bounded scroll region and semantic colors. No newly constructed short-hex-plus-alpha defect was identified.
- **URL and asset authority:** image generation/repair resolve owned database asset IDs and native storage, not arbitrary requested fetch URLs. Decompose accepts signed platform delivery or saved accessible legacy R2-domain assets, forbids redirects, and fixes Hugging Face output origins. Native engine HTTP origin is operator configuration; manifests and contracts do not authorize arbitrary commands/URLs. Local native archives are inspected without extraction and fixed commands run in constrained containers. Existing provider/image decoder and response-buffering behavior outside changed admission boundaries is not certified as a comprehensive resource-hardening audit.
- **Default-off optional engines:** Pages entry rejects engine requests before body consumption unless actual `env.BANNER_ENGINE_ENABLED === 'true'`; internal service additionally requires actual binding token and TLS. API authority requires private bucket/capability pins; local CLI requires explicit enablement. Recovery cron requires its explicit flag and secret; no scheduler, engine service, secret, bucket or migration was activated. The helper's process fallback does not bypass the authoritative Pages entry guard.
- **Native text, QR and navigation coexistence:** existing QR Codes route and permission branch remain, alongside Banner Studio, templates, brand kits and uploads. New Creative Studio links to established image/video/audio routes. Managed QR creates artwork from an existing active client-authorized QR and preserves its redirect/analytics identity; save/import/restore/duplicate paths check managed-QR invariants and reserved metadata. Animation, AI layer edits, merge, scoped design and companion paths exclude/protect managed QR. This is source and retained local fixture evidence, not a new live scan.
- **Dependencies/config:** only production dependency addition is exact `openai: 6.46.0`; lock diff adds its importer entry and reuses an existing resolved snapshot. No OpenUI package was added. Nuxt adds the Pages entry guard; Vitest gains `#shared`; gitignore adds local output directories. No changed Wrangler target, deploy script or unrelated runtime feature was found in the initial candidate inventory.
- **Scope hygiene:** two new `docs/ai-chat/` OpenUI documents explicitly preserve the user's separate accepted product direction and label implementation/deployment pending. They are documentation carryover, not implemented Banner runtime or evidence OpenUI ships here. Coordinator was asked to account for their intentional inclusion. Historical reports retain their historical branch/HEAD; they are not current release ancestry evidence.

## Retained evidence independently reconciled

Read the bounded review verdicts, findings and limits in GOVERNING-REVIEW, JOB-RELIABILITY-REVIEW, ASYNC-JOBS-REVIEW, RECOVERY-REVIEW, RETAIL-REVIEW, ANIMATION-REVIEW, BRIDGE-REPAIR-REVIEW, ONLINE-ENGINE-REVIEW, LINUX-NATIVE-REVIEW, COMPANION-REVIEW and ENGINE-JOBS-REVIEW. Their local acceptance scopes are cumulative, not proof of complete creative reconstruction or hosted acceptance.

| Retained original-worktree artifact | Independent comparison to candidate at initial checkpoint |
| --- | --- |
| `output/editable-artwork-engine-jobs/release-regression-20261027.json` | Parsed successful result: 1,224 tests passed, 18 optional pending, zero failures; 101 file results. Coordinator execution, not rerun by this reviewer; predates today's corrective changes. |
| `output/editable-artwork-recovery/postgres-proof.json` | Passed, sources unchanged during proof, test exit 0 and owned-cluster cleanup recorded. 34/35 hashes match; `app/types/banner-studio.ts` changed in later increments. Previous review records 43 actual local PostgreSQL cases. |
| `output/editable-artwork-engine-jobs/proof-2026-10-27T05-26-57-516Z/postgres-proof.json` | 28/28 source files present match; three intentionally absent local runtime/capability artifacts are not deployed candidate files. Passed/unchanged-source/exit-0/cleanup fields true. Today's guard correction later supersedes that file's old hash. Twelve local SQL/native cases are not hosted R2/Neon proof. |
| `output/editable-artwork-companion/ui-2026-10-27T04-32-30-268Z/source-hashes-after.json` | All 20 present files match, including final font/export/native refinements; only local font runtime manifest is intentionally absent. Evidence reports actual Nuxt controls with fixture API persistence and real local CLI proposal, not deployed service. |
| `output/editable-artwork-linux-native/integration-2026-10-27T03-22-34-330Z/source-hashes.json` | 6/10 match; native PhotoCraft adapter, shared document bridge, constants and client HTML builder changed afterward. Later companion evidence covers the relevant later subset. |
| `output/editable-artwork-animation/evidence.json` | 18/22 match; Artboard, Inspector and both HTML builders changed afterward. Do not treat this as a final-candidate browser run. |
| `output/editable-artwork-animation/alpha-mask/evidence.json` | 13/16 match; Artboard and both builders changed afterward. Numeric alpha/mask proof remains historical bounded evidence. |
| `output/editable-artwork-online-engine/creative-ui/evidence.json` | Recorded Creative Studio source SHA matches candidate exactly. |
| `output/editable-artwork-v2/managed-qr/ui-evidence.json` and retail-invitation evidence | Local UI assertions/persistence/QR preservation and zero live scans/providers are explicitly bounded; no code source hashes in those artifacts establish exact final-candidate execution. |

Independently hashed the font (428,176 bytes, SHA-256 `9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a`) and OFL file (4,579 bytes, `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c`); both match content-addressed paths. Candidate `git diff --check` passed. No full test suite, native process, browser proof or database proof was repeated by this reviewer; targeted source checks and hashes avoid duplicating the coordinator's active build/test work.

## Release risks and limits

- Keep optional native engines/recovery disabled until separately configured and accepted. Migration 483 is additive and belongs to engine activation/release accounting; this read-only reviewer did not apply it. No hosted acceptance is inferred from local SQL/container tests.
- Provider credentials/entitlements, live model availability, quality/cost, authenticated customer tenancy, production object delivery, queue consumer/scheduler behavior and Neon concurrency remain hosted gates. An honestly failed/review-required result is expected when capability is absent; do not advertise complete automatic flattened reconstruction, four-page fidelity or print/vector acceptance.
- Source Sans 3 normal 700 is now globally reserved for pinned 3.052 bytes in font/export paths. Existing custom headings with that identity can render differently; this disclosed compatibility caveat from COMPANION-REVIEW remains relevant. Other fonts and native editing remain available; original Arial artwork is not silently certified as faithfully recovered.
- Optional skipped browser/native/SQL tests are not successful hosted checks. The retained broad typecheck historically failed on repository baseline diagnostics; no clean global typecheck is claimed here.
- Final release still requires successful full dashboard build, deployment-target guard, refreshed main ancestry and the coordinator's source/deployment/live-navigation record. User authorization exists; this is a verification condition, not a request for new permission.

## Exact inspected runtime/configuration inventory

Modified files were reviewed through their complete diffs and relevant surrounding call paths; new production contracts/helpers/endpoints and native worker modules were read as source. The list below identifies all 138 candidate runtime/configuration/operator files in that audit snapshot; it is not a claim that every unchanged line of each large pre-existing page or every proof harness was independently re-audited. Additional existing supporting files inspected include `server/utils/banner/assetDelivery.ts`, `server/utils/bannerStorage.ts`, `server/utils/storage.ts`, installed pngjs parser/inflater, and installed Nitro Pages entry. Supplemental original-only corrections and regression test files are identified above. Proof/benchmark fixture generators and historical research documents are not production endpoints.

Snapshot UTC: `2026-10-27T06:44:28.086454+00:00`. SHA-256 over exact candidate bytes:

| File | SHA-256 |
| --- | --- |
| `.gitignore` | `c3786103a512ddb2c006012d00691f13d5dbc698aba1617c2e45853e49d5dd0c` |
| `app/components/MarketingNav.vue` | `dd6892c4690da504a260de76182e2ba15215ea45aebcb9aec04ea7bd72839f3e` |
| `app/components/banner/Artboard.client.vue` | `3720be53865843cbb77c11e53f3683d2e9ef86407efb51f2c79a95a01adc01c7` |
| `app/components/banner/ArtworkCreateSlideover.client.vue` | `9ce85e136d9a34bd8618e64482eb65a23c13e651c1e01ef5583cb92265742979` |
| `app/components/banner/DesignAssistant.client.vue` | `cf7b300a09da2257f1cad58add5d4087ad9d40a4889efc2d7c4fae47445f41ba` |
| `app/components/banner/DissectorModal.client.vue` | `4bd09c9452d6210db913445d4a82953ddb0187a176ef5ae815e5ced07e479093` |
| `app/components/banner/Inspector.client.vue` | `d07150a7401288cc50d51a040d9b9ca53b1f13c065f4e04e4b208ee76e02f055` |
| `app/components/banner/LayerContextMenu.vue` | `3f3fba7a47b2b64101a14b58afa1db501af59caa611518926cfc0a6153db7c77` |
| `app/components/banner/QrSlideover.client.vue` | `391b74a951efc0ab61cfa1ffe7c2565d2cf37cd906961ebc1ad36bf162f841cc` |
| `app/components/banner/Timeline.client.vue` | `6de14da99001de2c0194f14d8f650b4693e6cdbe8ca48a1abacdf2d2b96a581d` |
| `app/components/banner/inspector/Companion.vue` | `970ea2c70f2e23f81adc3585bc08378d4baa7e20ac95f56e42cf6cb3f2a46799` |
| `app/components/banner/inspector/Lettering.vue` | `4a2b446ca8aed95cc8d751e09543506fccd87db212533bbb78e5f42fd75db3de` |
| `app/components/banner/inspector/LetteringRepair.vue` | `798e09f58420fea0e441cffeb27fe33bb35a12f93c99d5e31675a401e90ef6fd` |
| `app/components/banner/inspector/MotionPath.vue` | `2897f35dedbeb4aa09341d36866b8129fd6eab892da0d42e33a9e785250ad10c` |
| `app/components/banner/inspector/Text.vue` | `4394e89a88dc0d80e9587b1bdc76b5792e13d09b2aa099fb6d40b5f73bc4dfa4` |
| `app/components/banner/layers/Bg.client.vue` | `0d89d9ee32b75e95f73892270a37a0dce52d9b10ff638b70e481f64122c5a586` |
| `app/components/banner/layers/Button.client.vue` | `efb4d69bcb4140b9e0579d829d1185be089d000548236b92cc5ab78f08bde838` |
| `app/components/banner/layers/Image.client.vue` | `daef64c24aeb5c70fccf6f94ebfd8ff9cdbf66f14d8fa17e84a16794491d31ed` |
| `app/components/banner/layers/Rect.client.vue` | `c407f16e8a29b4c22301c202f5f48403f7a6a6f9329ddde995c628f0fa3cda5a` |
| `app/components/banner/layers/Text.client.vue` | `0c3d81456ea0dc44e80ffbb564d478d0cbb1caab09b6fe3dcdb488c6b827faa3` |
| `app/components/banner/layers/Video.client.vue` | `0179e3058d56920d7cd9b37a8aff922b03d347c35b2d2dbe882996678f9b3777` |
| `app/composables/useAiLayerEdit.ts` | `3d8f2330a5a39c2d0274a1a7eae40a1ebbf7870b1ccbd669e09c9f6828a80c66` |
| `app/composables/useBannerAnimationActions.ts` | `7f9e3a15ee66cbf024aefc2dee4be7cd225bfdaaf3892931b6a8d58120d1ab23` |
| `app/composables/useBannerArtworkCreation.ts` | `e1cf3d7c30b7d490f66ef73f709676b450c1d8c9315cc354c3bec90f96fabb91` |
| `app/composables/useBannerCompanion.ts` | `ac3de29e4d77de2ee908367e8dd16b92e81bbea84dbbd623772c6fb2ac2ca04b` |
| `app/composables/useBannerCopyProposal.ts` | `d223ee646f7b9f96ea834d0d48d7b7f0e766e1754fd03ba1fdd93123203d942a` |
| `app/composables/useBannerDissectionJob.ts` | `5c74fd3445e2afcd9228eed776ba4c78ad1a8449b504453eba41daf11ac3c238` |
| `app/composables/useBannerFonts.ts` | `2bbe1b94a444c4478582c3384739b4ef1f0109654abf2e945c5b3ec69d169d35` |
| `app/composables/useBannerInspector.ts` | `2757a7e6f4df73fd40292684132b6ecbe2f738a634f76d64bc1f3fbc5e4a6227` |
| `app/composables/useBannerLettering.ts` | `86f28a50d5b5341d74b47a80b71fe96894b6beedf3c5501a67bda0b17530ba5d` |
| `app/composables/useBannerLetteringRepair.ts` | `93f0822dafccde0ad3be75e954a85f6e7ff396452598cd2246bfa29b8e031a66` |
| `app/composables/useBannerQr.ts` | `2ed61097f52d7180d918ba0a5539c694e6c2b24bf05c36389458e361b48b7f58` |
| `app/composables/useBannerRealtime.ts` | `d396c67681c600806fc5d4efe9a60ea9bb8a2d213460e4acfeb6bc3d2c6e2393` |
| `app/composables/useBannerStudio.ts` | `e5dc2a56ec1ea564195b05c9a4d2952b2a6e047dd33f74bce6927dffb6b4487e` |
| `app/composables/useBannerTimeline.ts` | `63eb7bcb97f2b606c63484680b0db81fb9ee6ea4a6a70b4084858560f4dd2501` |
| `app/composables/useDecompose.ts` | `9c199b4d62405d04f6657a615eb87799987268cb5c24adf2349789524330e663` |
| `app/composables/useMergeLayers.ts` | `f18dbf949052608152d8bb0c1147bd9256712113c3d3465c5a3cc7dbd7047a41` |
| `app/layouts/agency.vue` | `feefbd29e13a2288c9e70ccdccbbaa833160d92e4d5e2ebafc245f7986d7e1c1` |
| `app/pages/admin/ai/model-ops.vue` | `12c575ad3bab8fd04174cb99d97bdc96c193704afc734ded6e674d19ee78a4e8` |
| `app/pages/agency/banner-studio/[id].client.vue` | `050d15147925f6cb56a8944d25b56527f0b2862ae0b389b12a2c1154843050c7` |
| `app/pages/agency/creative.vue` | `fc3389e42bd82956b8b840bf11bace56e3ebc2f7e2573022e68a5376f8090a1b` |
| `app/pages/features/[slug].vue` | `e5dca4ca33cbcf39b9cf592e7d9cd3c9daf563f6762c35ac8c71ad612b52042e` |
| `app/pages/features/index.vue` | `3693c149e5a12046cb8599ff02142cc9e06530f175d8cd1660a60a51a9e77fa2` |
| `app/types/banner-studio.ts` | `09caafdf955a58b8fcecac3530544eb976507b8873537c762030f256f922fbef` |
| `app/utils/banner-artwork-creation.ts` | `3a22a7f5b55bca37b57b1e042a9312848119ab44e7949d75a66f227abbacd8a3` |
| `app/utils/banner-constants.ts` | `1c8c288ee141f54c593300ec957921208c94d22248e0747bbfa2ce645f6469ee` |
| `app/utils/banner-context-menu.ts` | `98b2a77c4f054715ce4467118f1d008fbe4a6a725cbef48670790c016b440df0` |
| `app/utils/banner-html-builder.ts` | `30ef3e9c45e65e7f35328d4859d7716c2f4cc3cba2d79d8875dc310c47fe9d92` |
| `app/utils/banner-mask.ts` | `7a6fd0559f7350be86de1fed795513d23e1d0ef011de0fdd2f1e806dfd72abda` |
| `app/utils/banner-pinned-font.ts` | `3f7a1a8b0f5329f7807f793dbf5177eeb53d15abd7635668d4ee804d090aef93` |
| `app/utils/banner-scoped-preview.ts` | `738d2ae026e9aff49af995d582823593a89af2a86b5b025af7b5b8055898d288` |
| `nuxt.config.ts` | `fea6a1bd3354974b151a30187583531c0db528448420e6922bdbf6ebaecf04a3` |
| `package.json` | `11669e45db5854be98b79dbda7408bb8cc0dead1d3af439d984a24e2b091e3d1` |
| `pnpm-lock.yaml` | `a5bfda2c7283355b82e046acd6906a8a8ab00a1effa1987706438701b4732e1e` |
| `public/fonts/banner/OFL-SourceSans3.89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c.md` | `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c` |
| `public/fonts/banner/SourceSans3-Bold.9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a.ttf` | `9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a` |
| `scripts/banner-engine-pages-guard.mjs` | `2d272d5fd447dd96fd8b9f19404a4d388b791cb38385a452541d550f5ef76736` |
| `scripts/banner-studio/companion-wording.ts` | `031c7d4f82c102f7c28a3d5121de8c6665cc11591de06e1cbac28022f7e25299` |
| `scripts/banner-studio/engine-worker.ts` | `9f260f5a2e60c91fe6ca6005d1cacd5fa61822b5129300d5e525470dc176aaf9` |
| `scripts/banner-studio/photocraft-bridge.ts` | `d63da6d88ab9eb98cb59b738ca7a1f7ea727ae1cde2e5723f8e05a782a9e1a92` |
| `scripts/banner-studio/photocraft-control.ts` | `47e689375a622cab482b20f2b8792586ae39332e682ef618de96e2aa7c47e4fa` |
| `scripts/banner-studio/photocraft-linux-bridge.ts` | `7a901f46c01997764c002ebc4c329ca44fd7548af0c0dd1b0a13e829c626771e` |
| `scripts/banner-studio/photocraft-read-archive.py` | `e20245c99b1b8ebe7782e1cea101cdd1b8572053d58f4c8a285fe118038900e4` |
| `server/api/admin/ai/model-ops/assignments/[featureKey].patch.ts` | `ddf1f826ae4bf63a08d3c46f81ae458c98fa3fdc0ca8002da8eaa090b3332c1b` |
| `server/api/agency/banner-studio/ai/copy-suggest.post.ts` | `237a7895f6aabd3ee1a5a5bb0cd9696225ea6b19a72a398f911b76d9a5e9fb10` |
| `server/api/agency/banner-studio/ai/decompose.post.ts` | `4038499c55bc70cad2b8e17a55537b0fd040b7f2957f6f6c73c8d85188b76856` |
| `server/api/agency/banner-studio/ai/design-assist.post.ts` | `7ddf38bbdbba156fd5065feb29de3fcaeda671977c5a480c899af81debcdf388` |
| `server/api/agency/banner-studio/ai/generate.post.ts` | `b5d9272c721ee81fb52b444d9da0500d8106798ee1d50d0b7e77d9522822f59e` |
| `server/api/agency/banner-studio/ai/lettering.post.ts` | `7074e99952f5c3ed96c0eb694f3ab0ca18d6098e6dcbd9992185c17904ba9943` |
| `server/api/agency/banner-studio/ai/repair-lettering.post.ts` | `626043385bcd1833c4dd2c92b7fa2d05c9f90e0b52463e23b2848039e4ff4d95` |
| `server/api/agency/banner-studio/assets/[id].patch.ts` | `9264e5aeb3a0b6f56ef90b4328d5cc47db59a76887234e95956687fab63c73b6` |
| `server/api/agency/banner-studio/dissect/[jobId].get.ts` | `e510d0be8ec7db6c41e210af2dfa36a959c7919efa4d887d5a7c67548b000189` |
| `server/api/agency/banner-studio/dissect/[jobId]/cancel.post.ts` | `13677710e5f1f06b6dba0c4bdee8198327511890effd75c5394f64489de11186` |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | `d7a9c546d3a50cfab5276ab1ef56a539a54b73cf9df883ba9f5f262384c1b239` |
| `server/api/agency/banner-studio/dissect/history.get.ts` | `3b38d3024ad59c57de365fe839ef97989d07864076869bd79707ddb7a67f5ab5` |
| `server/api/agency/banner-studio/dissect/process.post.ts` | `6839d7d5bc76dabd07f105a389b73776e8e816268a323e6016388958d270c922` |
| `server/api/agency/banner-studio/dissect/upload.post.ts` | `3cf22b472f321a149c5fa8f84857b5e16792d27c13934722634340557db3d7b6` |
| `server/api/agency/banner-studio/engine-jobs/[jobId].get.ts` | `32773e2472a8e47cc89be5a850cdf3e16722e465b0607c9220fd9e38aeddc3f9` |
| `server/api/agency/banner-studio/engine-jobs/[jobId]/cancel.post.ts` | `280e93b4ee31a2c5a3356441fed811dd301daf990ca64cbc97f5dfd2ad24d5d3` |
| `server/api/agency/banner-studio/engine-jobs/[jobId]/output.get.ts` | `2449e2c22511c3afa79824040e582752c8d1094cf14fd353aa26094c33d06e24` |
| `server/api/agency/banner-studio/engine-jobs/index.post.ts` | `21182604440ee85b10a6886041437668da853d62569d3fb4c3fe88c94eeace94` |
| `server/api/agency/banner-studio/projects/[id].patch.ts` | `e0ac7e64dbd212d128672acbcde814fcac27575617b9e20f4865377c900a60e0` |
| `server/api/agency/banner-studio/projects/[id]/duplicate.post.ts` | `51dc715a2e4b4b0458942cb19593182c6dea59460b49a42f9459df70e2c1e392` |
| `server/api/agency/banner-studio/projects/[id]/qr.post.ts` | `0f1a7e04f4546e7b0df7d5daf44097478ec5c173912d74b2c365f5a386a0b16d` |
| `server/api/agency/banner-studio/projects/index.post.ts` | `baf4fb87ec949b144806979f79fa40830f09d1cf10760bd45a6306dc899a4789` |
| `server/api/agency/banner-studio/versions/restore.post.ts` | `27c4c636081ccbd7a859520cf4b5dca8fb4de85a825b397013f1af689cb281e8` |
| `server/api/cron/banner-dissection-recovery.post.ts` | `cc6f1a74023c8f6f0871c66c74d3d361362b6017789d4c95ac34b28d380c4a80` |
| `server/api/internal/banner-engine.post.ts` | `273b16088171b1d3fe192aa111071afe8c6fd840857c902c120201b62ea10ca2` |
| `server/database/migrations/483_banner_engine_jobs.sql` | `39e14feb2058d6517b4b19eb639e61728d5de704b26fa42174e7aeb732812b80` |
| `server/runtime/banner-engine-pages-guard.ts` | `3e45b1c035b227059086a437c99f82977456122fbb8a9fe8fd247a8c2248530f` |
| `server/utils/ai/modelAssignments.ts` | `8bf9e08aa89491b7a90e79d11e0a09ae3f3c794e14d620b73510fed51d4a5178` |
| `server/utils/ai/modelRegistry.ts` | `63b7471e9a8eb52928063a6206b87843e246a7c926adf9ad2d64d2ebd0b2f7cb` |
| `server/utils/banner/artwork.ts` | `97c1273c72fb08e6cf7f1dcfb8610dc1abbdb17487c828e3cf8abf2253bfad55` |
| `server/utils/banner/artworkProvider.ts` | `f8c54d44218ea3db93a8b318cae2ec34b446957887d2dfcb39aead7183b13897` |
| `server/utils/banner/artworkValidation.ts` | `8772aa4dea0431f69f58e210e2eccccb8237952502464cff7944648a97447ffb` |
| `server/utils/banner/designAssistant.ts` | `5547cc3d8a24751f44d6d176c2b8f19b698d9fe4bb57cf6b319140beed5e0ce3` |
| `server/utils/banner/dissectionDispatch.ts` | `ddef30e4633795ca6d590f09e5125981f14ebdd53abc38632fad9c3edb8b9254` |
| `server/utils/banner/dissectionJobs.ts` | `94273074646c4345312d48a5b3fdeb3a97b51ae6ae4988365e1e67ed7380382e` |
| `server/utils/banner/dissectionRecovery.ts` | `91d36717c0f37deffcf5b2faf01e83c9c0e91e8c8f8835c3dbd9a2f513ea7a84` |
| `server/utils/banner/engineJobHttp.ts` | `176d0e25df7a35b80964ae69bad5a966459a0418fe18a3e5d58a714da7893ff1` |
| `server/utils/banner/engineJobStorage.ts` | `7a9bf76aea6b4c8282df8eaad87bd2d1bdd8c4eccc0bbefa95f7318f45bf6824` |
| `server/utils/banner/engineJobs.ts` | `7159a50ca3798939228053d46dee0ddf0f4475cbc59e11a5970533da5affd270` |
| `server/utils/banner/engineResult.ts` | `950c9394cd79f665586c86ee479f3dde33945c9fcdf9de5bd96842de3b16ea0c` |
| `server/utils/banner/htmlBuilder.ts` | `1200b177fe98ca7b2ad05bcaeb2aa336575bc4f6a03e3a6e43eab922d6d62e82` |
| `server/utils/banner/mask.ts` | `27eb77f76f771c9b369318fad505601fe8e3d033cc0b27d56849e95d4eebf139` |
| `server/utils/banner/platformQr.ts` | `afbcb70212a1295e8ea0c21d7d7e87a7cf890461c5e222b379bf3e370ccadd4f` |
| `server/utils/banner/platformQrCanvas.ts` | `03872a7dc105e60b18def36f290bb836acab6b934e14546d9887201f47983c0f` |
| `server/utils/bannerDissector.ts` | `1bb87863b296b76c275238e8c284db6625209915f16279051d9a878b5e6fce13` |
| `server/utils/bannerDissectorPipeline.ts` | `ce30f089c901bfe30ecf844a75e1465f2532d7556022bd5bd531bed9a8987d58` |
| `server/utils/queueConsumer.ts` | `370df7d2efdbac9d249805e878e7b6de81c3622664ef3892b2a68f83756dfcbe` |
| `server/utils/qwenLayerDecomposer.ts` | `187e1b96203416b344e1f09ba2c3392356a545ac72be0c7b546117a380f18684` |
| `shared/bannerArtwork.ts` | `f923fce27334955aa5af5ebd3ea5257694e77ffebc0a69c3628827f2f372b93f` |
| `shared/bannerCompanion.ts` | `bf593de00db26215d86024bb6622c7c3d478866189f86e5999302e8e8a0a3d55` |
| `shared/bannerCopyProtection.ts` | `497f1372e0b8758b94fa33bb4bf4eadd61fd06cace1a916d8bcc6a6b29245af0` |
| `shared/bannerDesignScope.ts` | `860feb198d1a1b29fd83d67626083ca00189c46dfe71f9afbfae338f81686785` |
| `shared/bannerDissectionReadiness.ts` | `8127a057d2a3b454dc83286bd54e84c5222d76a3d3b34c636d7c5c46bf538237` |
| `shared/bannerDocumentBridge.ts` | `3fa557a86b74a547d4f6594d980b7bf82ae7c64216758d14f640c502f2d52abe` |
| `shared/bannerEngine.ts` | `e6c332b808064bf49006f015241c5158bbb13e6cb61050766cc52f19f92aac70` |
| `shared/bannerEngineJobs.ts` | `3f50cba0f098f62ab4a1ef100c4cfd7668ce1a5fe131d8c30e68e873e757c770` |
| `shared/bannerFormats.ts` | `f8cd2b3b4b7ed58182c6bb84d3d9a8c849caa664f1080956d42103f2e1295f59` |
| `shared/bannerLetteringRepair.ts` | `ff7a3fa348d02d18883cbdc722eb6262b7a58ea9b536cb31464edce12d1c4b71` |
| `shared/bannerPinnedFont.ts` | `52a2a53025fb194f7f61ee62811576c4864a6b7b66562804d4849c5966015471` |
| `shared/bannerQr.ts` | `ea7c4c5c2c4602ba1180fe989e959c01e424cb73ee91141d83300029c1de5211` |
| `shared/bannerQrProtection.ts` | `99623ebdc4b8a14a2f8fe54d6444cd506ec2f3f64b3ac36f094a1318d20ef97d` |
| `shared/bannerReconstruction.ts` | `37bd33762df650dfba8d0f90643e75fd98583a10b2ef170b3a74b844fdbf47ce` |
| `vitest.config.ts` | `f867d2467d04f0e99a2ec2056b0cd536d965c559bcc32449c83a777dc4fcacae` |
| `workers/banner-engine/fonts/Dockerfile` | `fd8921060535bd2c9d9d127f1abc168a80e22ad34ae69c32900651b96cbbeb24` |
| `workers/banner-engine/fonts/LICENSE-SourceSans3.md` | `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c` |
| `workers/banner-engine/fonts/runtime.mjs` | `b6a0da5c1fac5be8bddc1c108f2f95897e061f4ad7f5fd995c1f3a80b9ec5dc5` |
| `workers/banner-engine/native/inspect_archive.py` | `81efefcbd891b57a953f8b2262c373c70cbfed410bbaaf0f06cf2ca6a836d6e3` |
| `workers/banner-engine/native/photocraft.ts` | `c1e8a42043d55b64b744cdf472d9b71f9ebab370521c056733fd757a7a488091` |
| `workers/banner-engine/runner/index.ts` | `180c89fe642e9d133826ea1c45b15ff680ccbd6133c7fefb545ae565af3bc4bb` |
| `workers/banner-engine/runtime/Dockerfile` | `0f86dc38448bdf6c57a7cbfd647a6afff7b6e1829b5a0d04ca7680d3f53ee1dc` |
| `workers/banner-engine/runtime/index.ts` | `b501b2b57fa5e5467d370cf81edb3765fbca4887d33a53795e6e0d936d19e6da` |
| `workers/banner-engine/runtime/render-preview.mjs` | `7de038750b2cb39c9b6d7a5472da19bab1ffc2f8f144b5fdf77fdd1559d7c101` |
| `workers/banner-engine/transport/files.ts` | `83e6a8ae8bf05fdabefb34d111566be86ff54aa83863af88a59f6a107231890f` |
| `workers/banner-engine/transport/http.ts` | `77af5b272395b9fbdfd8dc322764e47439d9f79ffb2dbf6493386ba40a20c9a8` |
| `workers/banner-engine/transport/index.ts` | `251e4fd82b46198d2e4b3bc5d017294ac5e10a821768cdafbc2edf34d58bf78d` |

Original/candidate differences still pending at this snapshot:

- `app/utils/banner-constants.ts`
- `scripts/banner-engine-pages-guard.mjs`
- `server/api/agency/banner-studio/dissect/upload.post.ts`
- `server/utils/banner/artworkValidation.ts`
- `server/utils/bannerDissector.ts`
- `server/utils/bannerDissectorPipeline.ts`
- `server/utils/queueConsumer.ts`

The original also contains the corrective internal process-job ingress and its tests, not yet included in the initial candidate diff. This inventory must be refreshed after the coordinator stabilizes/copies the correction set.

## Reviewed correction handoff

These are the exact original-worktree bytes independently inspected after the initial candidate snapshot. They permit the coordinator to verify copying without treating the older candidate hash table as a final release certificate. Dissector owner may still add tests; changed implementation beyond these hashes requires another review of that delta. The unused shared-format import was removed in the original; only its direct `#shared` re-export remains.

Checkpoint UTC: `2026-10-27T06:46:17.767788+00:00`.

| Original file | SHA-256 |
| --- | --- |
| `app/utils/banner-constants.ts` | `047a1eba35fa25f157865e66de5ccac58279b001c5e02ef03e813fbd0de1312d` |
| `vitest.config.ts` | `f867d2467d04f0e99a2ec2056b0cd536d965c559bcc32449c83a777dc4fcacae` |
| `scripts/banner-engine-pages-guard.mjs` | `6d947b19b9adeb1ea2b6c316d1f8c69241c5b7e72a019cd7123d956e0c5eab6c` |
| `server/utils/banner/artworkValidation.ts` | `10799763c545c681f7f52f47e530f2cc636b0d3ffcc56e0b5bf0775b4b196368` |
| `server/utils/bannerDissector.ts` | `7d15e89394e2462618fd392685d521e247198ff5a2ad9b1b13f584ec7490c823` |
| `server/utils/bannerDissectorPipeline.ts` | `bab9ad074c896bfdf2bc51acb3feb384b971c61323e924a7222671452f1bb182` |
| `server/utils/queueConsumer.ts` | `f7c806649711aca7330811d4f2053681681d02fe045150848010e231d40dbaa0` |
| `server/api/agency/banner-studio/dissect/upload.post.ts` | `221be326dedb910293cea7d6b2929652b08a9f2410d6d4c2aad2365c61d219c5` |
| `server/api/internal/process-job.post.ts` | `cc9ae2352df652096f0a8fe6f10d899c9965c29ae60113dc1af8414d2b5e1841` |
| `test/banner/enginePagesGuard.test.ts` | `b08abe681e464bfa1232860cc789eb70a4c92026f4adb8bd410190082c323def` |
| `test/server/utils/bannerArtworkPngBounds.test.ts` | `5bea8b2190d35797b7d9de6586f9f2bf10f6cc5a4634d3caf21bc880fb859ebc` |
| `test/banner/dissectorPipeline.test.ts` | `c43ea4cd731d9e894a2f5ffa1c9e362d1b139795e6cf48e7960ddc3f6cc78639` |
| `test/server/api/bannerDissectionUpload.test.ts` | `d3e3771212ba3d0fe2dd353d955fe1b18fd9b49d5ff09484be86327ee4ba34a6` |
| `test/server/api/dissectorQueueIngress.test.ts` | `d609a517f41b8dde514f7875705fd6de04cdb5a4aa4e00ed8656cc5f04ff3e86` |

Review task is complete with conditional source acceptance. No release, build completion, correction-copy completion or hosted/provider acceptance is asserted. The coordinator owns those remaining actions and may append its release record separately.
