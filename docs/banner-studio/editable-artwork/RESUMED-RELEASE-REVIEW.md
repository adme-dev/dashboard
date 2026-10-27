# Resumed Banner release review

27 October 2026. Independent, read-only review of `/Users/paulgiurin/orca/workspaces/dashboard/banner-artwork-release-20261027`; this report is the reviewer's only owned output. Root owns correction, integration, build, release and live acceptance.

## Disposition

**CHANGES REQUIRED / RELEASE BLOCKED at the reviewed checkpoint.** The 17 correction/report files in `/private/tmp/banner-resume-20261027/integration-receipt.json` match their recorded `after` SHA-256 values exactly. That closes their copy-integration gate, not the remaining release gates: two P2 authoritative-binding defects remain in the new artwork path, and the coordinator's full build failed the immutable Worker size guard. No P1 was established.

Candidate branch is `adme-dev/banner-artwork-release-20261027`, tracking `origin/main`. HEAD and local `origin/main` both resolve to `d45326265f0dec387bd6ae3deb465b616a8f2b68`; local divergence is `0 0`. Implementation remains uncommitted, so HEAD alone does not identify the reviewed source. No fetch was performed; current remote freshness must be re-established by root before release. The tables below identify exact working-file bytes.

## Findings reported immediately

### P2 — OpenAI client uses ambient credentials when hosted capability is absent

`server/utils/banner/artworkProvider.ts:11` resolves `event.context.cloudflare?.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY`. With a present Cloudflare context and an absent or deliberately empty binding, this still constructs a paid provider client from an ambient key. Generation, native lettering and lettering repair all call this helper. Consequently, removing the request capability is not sufficient to make these operations unavailable when ambient configuration remains present; approved customer references can be sent under that ambient account.

Read-only reproduction extracted the exact `artworkClient` body into a Node VM with a stub OpenAI constructor and a synthetic process environment. Both `hostedMissing` (`env: {}`) and `hostedEmpty` (`OPENAI_API_KEY: ''`) returned `USES_AMBIENT_KEY`; local execution did too. No real key was read and no network/provider operation occurred. Existing provider tests cover a populated hosted key but omit these negative cases.

Required correction: a present Cloudflare context must be authoritative, including absent/empty/non-string fields; use process fallback only when that context is absent. Assert 503 before constructing the client for missing/empty hosted capability while retaining local fallback. Escalated as `msg_d1a7035b70fb`.

### P2 — artwork reference reads fall back to ambient storage in hosted requests

`server/utils/banner/artwork.ts:138-146` reads `MEDIA_BUCKET` and calls `readStoredObject(asset.r2_key)` whenever `bucket?.get` is absent. It does not distinguish local execution from a hosted request with a missing/unreadable bucket. The existing fallback in `server/utils/storage.ts:343` can select local uploads, cached native storage or S3 configuration instead of this request's bucket. Generation checks required output delivery only after reference reads; native lettering does not require image-output delivery at all.

This permits reading an ambient object's bytes for a saved asset key after the request's storage capability is absent. Database client/asset authorization is present and does not cure the storage-capability mismatch. Required correction: reject hosted reference access without a usable request bucket/get, retain `readStoredObject` only outside Cloudflare context, and verify with a fallback spy that missing/unreadable hosted buckets fail without storage/provider invocation. This is a source-traced finding, not a live data-access experiment. Escalated as `msg_743119978744`.

### Release build gate — immutable raw Worker budget exceeded

Independently read the end of `/private/tmp/banner-resumed-build-20261027.log`. The build completed the Pages entry transformation and wrapper, then failed `scripts/check-worker-size.mjs` with exit 1:

```text
raw 25720161 / 25468928 bytes (251233 over)
gzip 7492133 / 9750000 bytes (2257867 remaining)
Worker exceeds the immutable Cloudflare Pages safety budget
```

This is a failed full build, not a passing release with a warning. Root is investigating bundle contributions. Preserve the fixed guard and obtain a successful full build after the reviewed remediation. Escalated as `msg_37d8788fc51e`; coordinator separately confirmed the same failure.

### P3 — additional prior correction handoff is not byte-identical

The 17-file receipt is accurate, but it omits `app/utils/banner-constants.ts`. Its candidate hash is `1c8c288ee141f54c593300ec957921208c94d22248e0747bbfa2ce645f6469ee`, while RELEASE-REVIEW's final correction handoff records `047a1eba35fa25f157865e66de5ccac58279b001c5e02ef03e813fbd0de1312d`. The candidate retains an unused `import { FORMATS } from '#shared/bannerFormats'`; its direct re-export already uses the corrected alias. This is an exact-handoff/lint discrepancy, not the current runtime/build blocker. Reported as `msg_1034bbb39979`.

## Source review and public claims

Read AGENTS.md, RELEASE-REVIEW.md, DISSECTOR-HOSTED-FIX.md and DEPLOYMENT-READINESS.md. The latter's claim that Dissector still passes null / lacks native storage is historical and superseded by the integrated correction report. Its hosted acceptance checklist remains outstanding.

Re-read the complete PNG validator, Pages build guard, Dissector implementation, Dissector pipeline, queue consumer, internal queue ingress and upload route. The integrated changes propagate the actual H3 event, reject missing hosted queue secrets before reading the body, resolve Dissector provider secrets from authoritative request bindings, bound database-owned source reads and persist new owner-scoped signed assets. Failure/cancellation compensation is limited to newly allocated assets. Missing cutouts and unrepaired backgrounds remain unresolved; no original-image-as-extraction fallback was restored.

Also read the complete new artwork provider and artwork orchestration helper, dissection dispatch/recovery/job authority and cron route, shared artwork/copy/scope/reconstruction/QR-readiness contracts, managed QR canvas validation, copy/QR composables and Creative Studio page. Read the Pages request guard and engine HTTP capability/auth/body helpers. Remaining new engine/companion/proof modules were reconciled against the prior review's exact hashes rather than independently repeating every native runtime review. This is a focused resumed release audit, not a new exhaustive audit of every unchanged line or test harness.

Inspected the tracked changed files through their diffs, including server project/restore/asset/import authorization and revision changes; model assignment/catalogue additions; animation, mask and paired HTML export changes; editor/inspector/proposal/dissection UI changes; font loading; configuration/dependency changes; and changed tests. For large existing components the complete changed hunks and relevant call paths were inspected, rather than claiming an end-to-end reread of their entire unchanged baseline. The hash inventory below names those files. Supporting reads included Banner asset delivery, generic storage read fallback and the size guard.

Public changes in `app/pages/features/index.vue`, `app/pages/features/[slug].vue` and `MarketingNav.vue` retain local-preview / hosted-pending language for new scoped edits, companion exchange, Dissector jobs, Creative Studio and Craft previews. Decomposition is explicitly raster; flattened generation does not claim native text recovery; managed QR placement still requires final-export scan review. Checked the relevant existing `/banner-studio` page wording and preserved QR Codes navigation in the agency layout. No additional concrete P1/P2 public-claim defect was established in this scope. Do not remove the pending labels merely because a build or deployment succeeds.

## Independent verification

- Recomputed all 17 receipt hashes twice: **17/17 match**.
- Reconciled the prior RELEASE-REVIEW runtime/config inventory: **132/138 match**. The six differences are precisely the integrated Pages guard, PNG validator, upload route, Dissector implementation/pipeline and queue consumer. Internal ingress was additionally reviewed and receipt-verified.
- Candidate `git diff --check`: exit 0.
- Constructor-only provider-binding probe: reproduces both missing and empty hosted-key fallback using synthetic data, without provider calls.
- Focused tests: **71 passed across six files**, exit 0, on explicit Node **24.18.0**:

```sh
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run \
  test/server/utils/bannerArtworkPngBounds.test.ts \
  test/server/utils/bannerArtworkProvider.test.ts \
  test/banner/dissectorPipeline.test.ts \
  test/banner/dissectorFailure.test.ts \
  test/server/api/dissectorQueueIngress.test.ts \
  test/server/api/bannerDissectionUpload.test.ts
```

The initial bare `pnpm exec vitest` launch selected an incompatible runtime and failed at startup (`node:util` lacks `styleText`); no tests ran in that launch. The explicit-runtime rerun above is the successful evidence. These existing suites do not negate the two newly identified missing-binding cases.

Root reports 321 focused tests across 20 files and a passing deploy:check before dispatch. Those are coordinator-reported results, not independently repeated here. No full build, SQL proof, native container proof, browser run, hosted queue/job, provider request, migration, credential read, live-service mutation, commit, rebase, fetch or deployment was performed by this reviewer.

## Remaining release conditions

1. Root corrects the two artwork binding boundaries, adds meaningful negative regression cases and obtains review of the resulting source delta.
2. Root remediates bundle size without relaxing the immutable budgets and obtains a successful full dashboard build plus required release guards/checks.
3. Record final current-main ancestry, source commit, deployment target and immutable deployment ID, then verify authenticated core save/reopen, asset delivery, QR/navigation and shared video/realtime behavior against that exact deployment.
4. Keep optional engines/recovery disabled until separately configured and accepted. Hosted scheduler, queue, Neon, provider entitlements, actual storage delivery and visual/cost quality remain separate evidence. This report does not certify full PRD completion, complete four-side reconstruction, original-font fidelity, print/vector acceptance or hosted native-engine readiness.

The review task is complete with changes required. The release task is not complete.

## SHA-256 evidence

The following generated inventory records candidate bytes at report preparation, not a source commit. The 17 correction/report entries are explicitly marked; historical match status refers only to the earlier review's 138-file inventory. Files marked `diff` were inspected through their complete tracked diff; `retained` files outside the detailed reread scope above were hash-reconciled against retained review evidence.

Snapshot UTC: `2026-10-27T07:15:57.366132+00:00`.

| Candidate file | SHA-256 | Evidence |
| --- | --- | --- |
| `.gitignore` | `c3786103a512ddb2c006012d00691f13d5dbc698aba1617c2e45853e49d5dd0c` | historical match, diff |
| `AGENTS.md` | `5fc97fa17118c369b33f3b242f9e39f5d3f9ee4510cf7f0860bbfcf29e224853` | supporting/correction |
| `app/components/MarketingNav.vue` | `dd6892c4690da504a260de76182e2ba15215ea45aebcb9aec04ea7bd72839f3e` | historical match, diff |
| `app/components/banner/Artboard.client.vue` | `3720be53865843cbb77c11e53f3683d2e9ef86407efb51f2c79a95a01adc01c7` | historical match, diff |
| `app/components/banner/ArtworkCreateSlideover.client.vue` | `9ce85e136d9a34bd8618e64482eb65a23c13e651c1e01ef5583cb92265742979` | historical match, retained |
| `app/components/banner/DesignAssistant.client.vue` | `cf7b300a09da2257f1cad58add5d4087ad9d40a4889efc2d7c4fae47445f41ba` | historical match, diff |
| `app/components/banner/DissectorModal.client.vue` | `4bd09c9452d6210db913445d4a82953ddb0187a176ef5ae815e5ced07e479093` | historical match, diff |
| `app/components/banner/Inspector.client.vue` | `d07150a7401288cc50d51a040d9b9ca53b1f13c065f4e04e4b208ee76e02f055` | historical match, diff |
| `app/components/banner/LayerContextMenu.vue` | `3f3fba7a47b2b64101a14b58afa1db501af59caa611518926cfc0a6153db7c77` | historical match, diff |
| `app/components/banner/QrSlideover.client.vue` | `391b74a951efc0ab61cfa1ffe7c2565d2cf37cd906961ebc1ad36bf162f841cc` | historical match, retained |
| `app/components/banner/Timeline.client.vue` | `6de14da99001de2c0194f14d8f650b4693e6cdbe8ca48a1abacdf2d2b96a581d` | historical match, diff |
| `app/components/banner/inspector/Companion.vue` | `970ea2c70f2e23f81adc3585bc08378d4baa7e20ac95f56e42cf6cb3f2a46799` | historical match, retained |
| `app/components/banner/inspector/Lettering.vue` | `4a2b446ca8aed95cc8d751e09543506fccd87db212533bbb78e5f42fd75db3de` | historical match, retained |
| `app/components/banner/inspector/LetteringRepair.vue` | `798e09f58420fea0e441cffeb27fe33bb35a12f93c99d5e31675a401e90ef6fd` | historical match, retained |
| `app/components/banner/inspector/MotionPath.vue` | `2897f35dedbeb4aa09341d36866b8129fd6eab892da0d42e33a9e785250ad10c` | historical match, diff |
| `app/components/banner/inspector/Text.vue` | `4394e89a88dc0d80e9587b1bdc76b5792e13d09b2aa099fb6d40b5f73bc4dfa4` | historical match, diff |
| `app/components/banner/layers/Bg.client.vue` | `0d89d9ee32b75e95f73892270a37a0dce52d9b10ff638b70e481f64122c5a586` | historical match, diff |
| `app/components/banner/layers/Button.client.vue` | `efb4d69bcb4140b9e0579d829d1185be089d000548236b92cc5ab78f08bde838` | historical match, diff |
| `app/components/banner/layers/Image.client.vue` | `daef64c24aeb5c70fccf6f94ebfd8ff9cdbf66f14d8fa17e84a16794491d31ed` | historical match, diff |
| `app/components/banner/layers/Rect.client.vue` | `c407f16e8a29b4c22301c202f5f48403f7a6a6f9329ddde995c628f0fa3cda5a` | historical match, diff |
| `app/components/banner/layers/Text.client.vue` | `0c3d81456ea0dc44e80ffbb564d478d0cbb1caab09b6fe3dcdb488c6b827faa3` | historical match, diff |
| `app/components/banner/layers/Video.client.vue` | `0179e3058d56920d7cd9b37a8aff922b03d347c35b2d2dbe882996678f9b3777` | historical match, diff |
| `app/composables/useAiLayerEdit.ts` | `3d8f2330a5a39c2d0274a1a7eae40a1ebbf7870b1ccbd669e09c9f6828a80c66` | historical match, diff |
| `app/composables/useBannerAnimationActions.ts` | `7f9e3a15ee66cbf024aefc2dee4be7cd225bfdaaf3892931b6a8d58120d1ab23` | historical match, retained |
| `app/composables/useBannerArtworkCreation.ts` | `e1cf3d7c30b7d490f66ef73f709676b450c1d8c9315cc354c3bec90f96fabb91` | historical match, retained |
| `app/composables/useBannerCompanion.ts` | `ac3de29e4d77de2ee908367e8dd16b92e81bbea84dbbd623772c6fb2ac2ca04b` | historical match, retained |
| `app/composables/useBannerCopyProposal.ts` | `d223ee646f7b9f96ea834d0d48d7b7f0e766e1754fd03ba1fdd93123203d942a` | historical match, retained |
| `app/composables/useBannerDissectionJob.ts` | `5c74fd3445e2afcd9228eed776ba4c78ad1a8449b504453eba41daf11ac3c238` | historical match, retained |
| `app/composables/useBannerFonts.ts` | `2bbe1b94a444c4478582c3384739b4ef1f0109654abf2e945c5b3ec69d169d35` | historical match, diff |
| `app/composables/useBannerInspector.ts` | `2757a7e6f4df73fd40292684132b6ecbe2f738a634f76d64bc1f3fbc5e4a6227` | historical match, diff |
| `app/composables/useBannerLettering.ts` | `86f28a50d5b5341d74b47a80b71fe96894b6beedf3c5501a67bda0b17530ba5d` | historical match, retained |
| `app/composables/useBannerLetteringRepair.ts` | `93f0822dafccde0ad3be75e954a85f6e7ff396452598cd2246bfa29b8e031a66` | historical match, retained |
| `app/composables/useBannerQr.ts` | `2ed61097f52d7180d918ba0a5539c694e6c2b24bf05c36389458e361b48b7f58` | historical match, retained |
| `app/composables/useBannerRealtime.ts` | `d396c67681c600806fc5d4efe9a60ea9bb8a2d213460e4acfeb6bc3d2c6e2393` | historical match, diff |
| `app/composables/useBannerStudio.ts` | `e5dc2a56ec1ea564195b05c9a4d2952b2a6e047dd33f74bce6927dffb6b4487e` | historical match, diff |
| `app/composables/useBannerTimeline.ts` | `63eb7bcb97f2b606c63484680b0db81fb9ee6ea4a6a70b4084858560f4dd2501` | historical match, diff |
| `app/composables/useDecompose.ts` | `9c199b4d62405d04f6657a615eb87799987268cb5c24adf2349789524330e663` | historical match, diff |
| `app/composables/useMergeLayers.ts` | `f18dbf949052608152d8bb0c1147bd9256712113c3d3465c5a3cc7dbd7047a41` | historical match, diff |
| `app/layouts/agency.vue` | `feefbd29e13a2288c9e70ccdccbbaa833160d92e4d5e2ebafc245f7986d7e1c1` | historical match, diff |
| `app/pages/admin/ai/model-ops.vue` | `12c575ad3bab8fd04174cb99d97bdc96c193704afc734ded6e674d19ee78a4e8` | historical match, diff |
| `app/pages/agency/banner-studio/[id].client.vue` | `050d15147925f6cb56a8944d25b56527f0b2862ae0b389b12a2c1154843050c7` | historical match, diff |
| `app/pages/agency/creative.vue` | `fc3389e42bd82956b8b840bf11bace56e3ebc2f7e2573022e68a5376f8090a1b` | historical match, retained |
| `app/pages/features/[slug].vue` | `e5dca4ca33cbcf39b9cf592e7d9cd3c9daf563f6762c35ac8c71ad612b52042e` | historical match, diff |
| `app/pages/features/index.vue` | `3693c149e5a12046cb8599ff02142cc9e06530f175d8cd1660a60a51a9e77fa2` | historical match, diff |
| `app/types/banner-studio.ts` | `09caafdf955a58b8fcecac3530544eb976507b8873537c762030f256f922fbef` | historical match, diff |
| `app/utils/banner-artwork-creation.ts` | `3a22a7f5b55bca37b57b1e042a9312848119ab44e7949d75a66f227abbacd8a3` | historical match, retained |
| `app/utils/banner-constants.ts` | `1c8c288ee141f54c593300ec957921208c94d22248e0747bbfa2ce645f6469ee` | historical match, diff |
| `app/utils/banner-context-menu.ts` | `98b2a77c4f054715ce4467118f1d008fbe4a6a725cbef48670790c016b440df0` | historical match, retained |
| `app/utils/banner-html-builder.ts` | `30ef3e9c45e65e7f35328d4859d7716c2f4cc3cba2d79d8875dc310c47fe9d92` | historical match, diff |
| `app/utils/banner-mask.ts` | `7a6fd0559f7350be86de1fed795513d23e1d0ef011de0fdd2f1e806dfd72abda` | historical match, diff |
| `app/utils/banner-pinned-font.ts` | `3f7a1a8b0f5329f7807f793dbf5177eeb53d15abd7635668d4ee804d090aef93` | historical match, retained |
| `app/utils/banner-scoped-preview.ts` | `738d2ae026e9aff49af995d582823593a89af2a86b5b025af7b5b8055898d288` | historical match, retained |
| `docs/banner-studio/editable-artwork/DEPLOYMENT-READINESS.md` | `7de4060a39f376c1501f95afd14d7022b37786cd9b76e8a8cc37dfc1fd1d7793` | receipt match, supporting/correction |
| `docs/banner-studio/editable-artwork/DISSECTOR-HOSTED-FIX.md` | `36ab6c5206fcb651badc8dbc676c0d31c87730a52ee683ea025e8266feac98ed` | receipt match, supporting/correction |
| `docs/banner-studio/editable-artwork/HOSTED-ENGINE-READINESS.md` | `d617271912f0ac6df4509c272bb4c40117d473c50986301124ee186d3725eee3` | receipt match, supporting/correction |
| `docs/banner-studio/editable-artwork/RELEASE-REVIEW.md` | `e962e945c77deb8b847ecaa727dfe12fe5a59d2b1465b3d3ebde4207a55fd34d` | receipt match, supporting/correction |
| `nuxt.config.ts` | `fea6a1bd3354974b151a30187583531c0db528448420e6922bdbf6ebaecf04a3` | historical match, diff |
| `package.json` | `11669e45db5854be98b79dbda7408bb8cc0dead1d3af439d984a24e2b091e3d1` | historical match, diff |
| `pnpm-lock.yaml` | `a5bfda2c7283355b82e046acd6906a8a8ab00a1effa1987706438701b4732e1e` | historical match, diff |
| `public/fonts/banner/OFL-SourceSans3.89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c.md` | `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c` | historical match, retained |
| `public/fonts/banner/SourceSans3-Bold.9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a.ttf` | `9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a` | historical match, retained |
| `scripts/banner-engine-pages-guard.mjs` | `6d947b19b9adeb1ea2b6c316d1f8c69241c5b7e72a019cd7123d956e0c5eab6c` | receipt match, historical delta, retained |
| `scripts/banner-studio/companion-wording.ts` | `031c7d4f82c102f7c28a3d5121de8c6665cc11591de06e1cbac28022f7e25299` | historical match, retained |
| `scripts/banner-studio/engine-worker.ts` | `9f260f5a2e60c91fe6ca6005d1cacd5fa61822b5129300d5e525470dc176aaf9` | historical match, retained |
| `scripts/banner-studio/photocraft-bridge.ts` | `d63da6d88ab9eb98cb59b738ca7a1f7ea727ae1cde2e5723f8e05a782a9e1a92` | historical match, retained |
| `scripts/banner-studio/photocraft-control.ts` | `47e689375a622cab482b20f2b8792586ae39332e682ef618de96e2aa7c47e4fa` | historical match, retained |
| `scripts/banner-studio/photocraft-linux-bridge.ts` | `7a901f46c01997764c002ebc4c329ca44fd7548af0c0dd1b0a13e829c626771e` | historical match, retained |
| `scripts/banner-studio/photocraft-read-archive.py` | `e20245c99b1b8ebe7782e1cea101cdd1b8572053d58f4c8a285fe118038900e4` | historical match, retained |
| `scripts/check-worker-size.mjs` | `6f67d9bd19db9b35e86dd1204a1df3f3c65afe5ccd22a857a8c11cafdfdb72b7` | supporting/correction |
| `server/api/admin/ai/model-ops/assignments/[featureKey].patch.ts` | `ddf1f826ae4bf63a08d3c46f81ae458c98fa3fdc0ca8002da8eaa090b3332c1b` | historical match, diff |
| `server/api/agency/banner-studio/ai/copy-suggest.post.ts` | `237a7895f6aabd3ee1a5a5bb0cd9696225ea6b19a72a398f911b76d9a5e9fb10` | historical match, diff |
| `server/api/agency/banner-studio/ai/decompose.post.ts` | `4038499c55bc70cad2b8e17a55537b0fd040b7f2957f6f6c73c8d85188b76856` | historical match, diff |
| `server/api/agency/banner-studio/ai/design-assist.post.ts` | `7ddf38bbdbba156fd5065feb29de3fcaeda671977c5a480c899af81debcdf388` | historical match, diff |
| `server/api/agency/banner-studio/ai/generate.post.ts` | `b5d9272c721ee81fb52b444d9da0500d8106798ee1d50d0b7e77d9522822f59e` | historical match, retained |
| `server/api/agency/banner-studio/ai/lettering.post.ts` | `7074e99952f5c3ed96c0eb694f3ab0ca18d6098e6dcbd9992185c17904ba9943` | historical match, retained |
| `server/api/agency/banner-studio/ai/repair-lettering.post.ts` | `626043385bcd1833c4dd2c92b7fa2d05c9f90e0b52463e23b2848039e4ff4d95` | historical match, retained |
| `server/api/agency/banner-studio/assets/[id].patch.ts` | `9264e5aeb3a0b6f56ef90b4328d5cc47db59a76887234e95956687fab63c73b6` | historical match, diff |
| `server/api/agency/banner-studio/dissect/[jobId].get.ts` | `e510d0be8ec7db6c41e210af2dfa36a959c7919efa4d887d5a7c67548b000189` | historical match, diff |
| `server/api/agency/banner-studio/dissect/[jobId]/cancel.post.ts` | `13677710e5f1f06b6dba0c4bdee8198327511890effd75c5394f64489de11186` | historical match, retained |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | `d7a9c546d3a50cfab5276ab1ef56a539a54b73cf9df883ba9f5f262384c1b239` | historical match, diff |
| `server/api/agency/banner-studio/dissect/history.get.ts` | `3b38d3024ad59c57de365fe839ef97989d07864076869bd79707ddb7a67f5ab5` | historical match, diff |
| `server/api/agency/banner-studio/dissect/process.post.ts` | `6839d7d5bc76dabd07f105a389b73776e8e816268a323e6016388958d270c922` | historical match, diff |
| `server/api/agency/banner-studio/dissect/upload.post.ts` | `221be326dedb910293cea7d6b2929652b08a9f2410d6d4c2aad2365c61d219c5` | receipt match, historical delta, diff |
| `server/api/agency/banner-studio/engine-jobs/[jobId].get.ts` | `32773e2472a8e47cc89be5a850cdf3e16722e465b0607c9220fd9e38aeddc3f9` | historical match, retained |
| `server/api/agency/banner-studio/engine-jobs/[jobId]/cancel.post.ts` | `280e93b4ee31a2c5a3356441fed811dd301daf990ca64cbc97f5dfd2ad24d5d3` | historical match, retained |
| `server/api/agency/banner-studio/engine-jobs/[jobId]/output.get.ts` | `2449e2c22511c3afa79824040e582752c8d1094cf14fd353aa26094c33d06e24` | historical match, retained |
| `server/api/agency/banner-studio/engine-jobs/index.post.ts` | `21182604440ee85b10a6886041437668da853d62569d3fb4c3fe88c94eeace94` | historical match, retained |
| `server/api/agency/banner-studio/projects/[id].patch.ts` | `e0ac7e64dbd212d128672acbcde814fcac27575617b9e20f4865377c900a60e0` | historical match, diff |
| `server/api/agency/banner-studio/projects/[id]/duplicate.post.ts` | `51dc715a2e4b4b0458942cb19593182c6dea59460b49a42f9459df70e2c1e392` | historical match, diff |
| `server/api/agency/banner-studio/projects/[id]/qr.post.ts` | `0f1a7e04f4546e7b0df7d5daf44097478ec5c173912d74b2c365f5a386a0b16d` | historical match, retained |
| `server/api/agency/banner-studio/projects/index.post.ts` | `baf4fb87ec949b144806979f79fa40830f09d1cf10760bd45a6306dc899a4789` | historical match, diff |
| `server/api/agency/banner-studio/versions/restore.post.ts` | `27c4c636081ccbd7a859520cf4b5dca8fb4de85a825b397013f1af689cb281e8` | historical match, diff |
| `server/api/cron/banner-dissection-recovery.post.ts` | `cc6f1a74023c8f6f0871c66c74d3d361362b6017789d4c95ac34b28d380c4a80` | historical match, retained |
| `server/api/internal/banner-engine.post.ts` | `273b16088171b1d3fe192aa111071afe8c6fd840857c902c120201b62ea10ca2` | historical match, retained |
| `server/api/internal/process-job.post.ts` | `cc9ae2352df652096f0a8fe6f10d899c9965c29ae60113dc1af8414d2b5e1841` | receipt match, diff |
| `server/database/migrations/483_banner_engine_jobs.sql` | `39e14feb2058d6517b4b19eb639e61728d5de704b26fa42174e7aeb732812b80` | historical match, retained |
| `server/runtime/banner-engine-pages-guard.ts` | `3e45b1c035b227059086a437c99f82977456122fbb8a9fe8fd247a8c2248530f` | historical match, retained |
| `server/utils/ai/modelAssignments.ts` | `8bf9e08aa89491b7a90e79d11e0a09ae3f3c794e14d620b73510fed51d4a5178` | historical match, diff |
| `server/utils/ai/modelRegistry.ts` | `63b7471e9a8eb52928063a6206b87843e246a7c926adf9ad2d64d2ebd0b2f7cb` | historical match, diff |
| `server/utils/banner/artwork.ts` | `97c1273c72fb08e6cf7f1dcfb8610dc1abbdb17487c828e3cf8abf2253bfad55` | historical match, retained |
| `server/utils/banner/artworkProvider.ts` | `f8c54d44218ea3db93a8b318cae2ec34b446957887d2dfcb39aead7183b13897` | historical match, retained |
| `server/utils/banner/artworkValidation.ts` | `10799763c545c681f7f52f47e530f2cc636b0d3ffcc56e0b5bf0775b4b196368` | receipt match, historical delta, retained |
| `server/utils/banner/designAssistant.ts` | `5547cc3d8a24751f44d6d176c2b8f19b698d9fe4bb57cf6b319140beed5e0ce3` | historical match, diff |
| `server/utils/banner/dissectionDispatch.ts` | `ddef30e4633795ca6d590f09e5125981f14ebdd53abc38632fad9c3edb8b9254` | historical match, retained |
| `server/utils/banner/dissectionJobs.ts` | `94273074646c4345312d48a5b3fdeb3a97b51ae6ae4988365e1e67ed7380382e` | historical match, retained |
| `server/utils/banner/dissectionRecovery.ts` | `91d36717c0f37deffcf5b2faf01e83c9c0e91e8c8f8835c3dbd9a2f513ea7a84` | historical match, retained |
| `server/utils/banner/engineJobHttp.ts` | `176d0e25df7a35b80964ae69bad5a966459a0418fe18a3e5d58a714da7893ff1` | historical match, retained |
| `server/utils/banner/engineJobStorage.ts` | `7a9bf76aea6b4c8282df8eaad87bd2d1bdd8c4eccc0bbefa95f7318f45bf6824` | historical match, retained |
| `server/utils/banner/engineJobs.ts` | `7159a50ca3798939228053d46dee0ddf0f4475cbc59e11a5970533da5affd270` | historical match, retained |
| `server/utils/banner/engineResult.ts` | `950c9394cd79f665586c86ee479f3dde33945c9fcdf9de5bd96842de3b16ea0c` | historical match, retained |
| `server/utils/banner/htmlBuilder.ts` | `1200b177fe98ca7b2ad05bcaeb2aa336575bc4f6a03e3a6e43eab922d6d62e82` | historical match, diff |
| `server/utils/banner/mask.ts` | `27eb77f76f771c9b369318fad505601fe8e3d033cc0b27d56849e95d4eebf139` | historical match, diff |
| `server/utils/banner/platformQr.ts` | `afbcb70212a1295e8ea0c21d7d7e87a7cf890461c5e222b379bf3e370ccadd4f` | historical match, retained |
| `server/utils/banner/platformQrCanvas.ts` | `03872a7dc105e60b18def36f290bb836acab6b934e14546d9887201f47983c0f` | historical match, retained |
| `server/utils/bannerDissector.ts` | `7d15e89394e2462618fd392685d521e247198ff5a2ad9b1b13f584ec7490c823` | receipt match, historical delta, diff |
| `server/utils/bannerDissectorPipeline.ts` | `bab9ad074c896bfdf2bc51acb3feb384b971c61323e924a7222671452f1bb182` | receipt match, historical delta, diff |
| `server/utils/queueConsumer.ts` | `f7c806649711aca7330811d4f2053681681d02fe045150848010e231d40dbaa0` | receipt match, historical delta, diff |
| `server/utils/qwenLayerDecomposer.ts` | `187e1b96203416b344e1f09ba2c3392356a545ac72be0c7b546117a380f18684` | historical match, diff |
| `shared/bannerArtwork.ts` | `f923fce27334955aa5af5ebd3ea5257694e77ffebc0a69c3628827f2f372b93f` | historical match, retained |
| `shared/bannerCompanion.ts` | `bf593de00db26215d86024bb6622c7c3d478866189f86e5999302e8e8a0a3d55` | historical match, retained |
| `shared/bannerCopyProtection.ts` | `497f1372e0b8758b94fa33bb4bf4eadd61fd06cace1a916d8bcc6a6b29245af0` | historical match, retained |
| `shared/bannerDesignScope.ts` | `860feb198d1a1b29fd83d67626083ca00189c46dfe71f9afbfae338f81686785` | historical match, retained |
| `shared/bannerDissectionReadiness.ts` | `8127a057d2a3b454dc83286bd54e84c5222d76a3d3b34c636d7c5c46bf538237` | historical match, retained |
| `shared/bannerDocumentBridge.ts` | `3fa557a86b74a547d4f6594d980b7bf82ae7c64216758d14f640c502f2d52abe` | historical match, retained |
| `shared/bannerEngine.ts` | `e6c332b808064bf49006f015241c5158bbb13e6cb61050766cc52f19f92aac70` | historical match, retained |
| `shared/bannerEngineJobs.ts` | `3f50cba0f098f62ab4a1ef100c4cfd7668ce1a5fe131d8c30e68e873e757c770` | historical match, retained |
| `shared/bannerFormats.ts` | `f8cd2b3b4b7ed58182c6bb84d3d9a8c849caa664f1080956d42103f2e1295f59` | historical match, retained |
| `shared/bannerLetteringRepair.ts` | `ff7a3fa348d02d18883cbdc722eb6262b7a58ea9b536cb31464edce12d1c4b71` | historical match, retained |
| `shared/bannerPinnedFont.ts` | `52a2a53025fb194f7f61ee62811576c4864a6b7b66562804d4849c5966015471` | historical match, retained |
| `shared/bannerQr.ts` | `ea7c4c5c2c4602ba1180fe989e959c01e424cb73ee91141d83300029c1de5211` | historical match, retained |
| `shared/bannerQrProtection.ts` | `99623ebdc4b8a14a2f8fe54d6444cd506ec2f3f64b3ac36f094a1318d20ef97d` | historical match, retained |
| `shared/bannerReconstruction.ts` | `37bd33762df650dfba8d0f90643e75fd98583a10b2ef170b3a74b844fdbf47ce` | historical match, retained |
| `test/app/bannerStudioRevisions.test.ts` | `452fd767e1f5c9d6293d557c197af922b90417d4b05b7c6f6f5f48c4ff8cc2dc` | diff |
| `test/banner/artworkUndo.test.ts` | `0205ed28e215dc562075d73fd73c1ae66df839e03e4621d926d4eab490e79760` | diff |
| `test/banner/dissectorFailure.test.ts` | `b3777c46708137ce8ded3a8aff23f89eccf08aa829e010324a83348b254ca444` | receipt match, supporting/correction |
| `test/banner/dissectorPipeline.test.ts` | `c43ea4cd731d9e894a2f5ffa1c9e362d1b139795e6cf48e7960ddc3f6cc78639` | receipt match, supporting/correction |
| `test/banner/dragControls.test.ts` | `67f105f89030d4c59da1da40457e7fe6ab782fcd620f66f5ed59b19d4e7c29cd` | diff |
| `test/banner/enginePagesGuard.test.ts` | `b08abe681e464bfa1232860cc789eb70a4c92026f4adb8bd410190082c323def` | receipt match, supporting/correction |
| `test/banner/fontWeightInspector.test.ts` | `3419c834b0203d18472eb1b0406c1010636bc2e4187bf6274d6b4d2759fd9e37` | diff |
| `test/components/bannerDesignAssistant.test.ts` | `c23c4bcdf5c590ae41d69a81c83d6cb137d82c86cd00ad3ed94c377177db9c69` | diff |
| `test/server/api/bannerDesignAssist.test.ts` | `33527f49194ba8fc11870b293894f859f60082c4a51bf81898708dd4e6e8e888` | diff |
| `test/server/api/bannerDissectionUpload.test.ts` | `d3e3771212ba3d0fe2dd353d955fe1b18fd9b49d5ff09484be86327ee4ba34a6` | receipt match, supporting/correction |
| `test/server/api/bannerStudioAiModelOpsRuntime.test.ts` | `627ae773984bd42cd893444c1fb48b757dd14e1a8a95fc6ab4f17c26d27d09c7` | diff |
| `test/server/api/dissectorQueueIngress.test.ts` | `d609a517f41b8dde514f7875705fd6de04cdb5a4aa4e00ed8656cc5f04ff3e86` | receipt match, supporting/correction |
| `test/server/utils/bannerArtworkPngBounds.test.ts` | `5bea8b2190d35797b7d9de6586f9f2bf10f6cc5a4634d3caf21bc880fb859ebc` | receipt match, supporting/correction |
| `test/server/utils/bannerProjectGodModeMutation.test.ts` | `e0986a2015347ed9268f90278eebc4beb4c6385644cffcb8915859754e790ed8` | diff |
| `vitest.config.ts` | `f867d2467d04f0e99a2ec2056b0cd536d965c559bcc32449c83a777dc4fcacae` | historical match, diff |
| `workers/banner-engine/fonts/Dockerfile` | `fd8921060535bd2c9d9d127f1abc168a80e22ad34ae69c32900651b96cbbeb24` | historical match, retained |
| `workers/banner-engine/fonts/LICENSE-SourceSans3.md` | `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c` | historical match, retained |
| `workers/banner-engine/fonts/runtime.mjs` | `b6a0da5c1fac5be8bddc1c108f2f95897e061f4ad7f5fd995c1f3a80b9ec5dc5` | historical match, retained |
| `workers/banner-engine/native/inspect_archive.py` | `81efefcbd891b57a953f8b2262c373c70cbfed410bbaaf0f06cf2ca6a836d6e3` | historical match, retained |
| `workers/banner-engine/native/photocraft.ts` | `c1e8a42043d55b64b744cdf472d9b71f9ebab370521c056733fd757a7a488091` | historical match, retained |
| `workers/banner-engine/runner/index.ts` | `180c89fe642e9d133826ea1c45b15ff680ccbd6133c7fefb545ae565af3bc4bb` | historical match, retained |
| `workers/banner-engine/runtime/Dockerfile` | `0f86dc38448bdf6c57a7cbfd647a6afff7b6e1829b5a0d04ca7680d3f53ee1dc` | historical match, retained |
| `workers/banner-engine/runtime/index.ts` | `b501b2b57fa5e5467d370cf81edb3765fbca4887d33a53795e6e0d936d19e6da` | historical match, retained |
| `workers/banner-engine/runtime/render-preview.mjs` | `7de038750b2cb39c9b6d7a5472da19bab1ffc2f8f144b5fdf77fdd1559d7c101` | historical match, retained |
| `workers/banner-engine/transport/files.ts` | `83e6a8ae8bf05fdabefb34d111566be86ff54aa83863af88a59f6a107231890f` | historical match, retained |
| `workers/banner-engine/transport/http.ts` | `77af5b272395b9fbdfd8dc322764e47439d9f79ffb2dbf6493386ba40a20c9a8` | historical match, retained |
| `workers/banner-engine/transport/index.ts` | `251e4fd82b46198d2e4b3bc5d017294ac5e10a821768cdafbc2edf34d58bf78d` | historical match, retained |

Receipt JSON SHA-256: `ca429e0a567e07adae794941b215099ae1b0791c927cc4da92eeb7b9fca0de6a`.
