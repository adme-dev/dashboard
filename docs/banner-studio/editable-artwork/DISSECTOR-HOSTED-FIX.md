# Dissector hosted event and storage correction

27 October 2026. Frozen original-worktree handoff for coordinator integration and independent review. This supersedes the **source defect** diagnosis in DEPLOYMENT-READINESS.md; it does not clear its hosted acceptance gate.

## Outcome and scope

Repaired request capability propagation through the existing queue-to-HTTP bridge, provider configuration, native source upload/read and signed extracted-asset persistence. Five production files and four focused test files changed, listed with SHA-256 below. Existing edits were preserved; no Git operation, candidate sibling edit, database operation, provider request, configuration change, build or deployment was performed. Root owns copying these files, clean-candidate review, rebuild, release and hosted acceptance.

The coordinator explicitly extended initial ownership to `server/api/internal/process-job.post.ts` and `server/api/agency/banner-studio/dissect/upload.post.ts` after the investigation identified their additional hosted failures.

## Cause and repaired boundaries

1. `workers/jobs-consumer/src/index.ts` POSTs queued jobs to `/api/internal/process-job`; this is the actual Pages ingress. The Nitro queue plugin is not the hosted consumer. The endpoint already forwarded its H3 event into `processJob`, but `processDissectAnalyze` discarded it. It now carries that exact event into the pipeline; payload `_event` is ignored.
2. `cfEnv` promotes `_platform.cloudflare` to `context.cloudflare` and caches primitive bindings. It deliberately does not copy secrets into global `process.env` or cache native capabilities. A test executes this real middleware and verifies capability identity and unchanged process configuration.
3. The internal endpoint previously authenticated only with `process.env.CRON_SECRET`. It now reads request `CRON_SECRET` whenever Cloudflare context exists; missing/empty/non-string/wrong hosted secrets fail before reading the body or starting the ledger. Process fallback is retained only without Cloudflare context. Existing development bypass and generic job dispatch/ledger behavior are preserved.
4. Dissection upload previously called generic storage without a bucket. Hosted upload now uses the request's native `MEDIA_BUCKET`, checks exact persisted size with `head`, then inserts and dispatches the job. Missing storage/signing configuration fails closed; no Pages filesystem/S3 fallback. Source key and dispatch generation shape remain unchanged.
5. The pipeline's private S3 client read process-only credentials and lacked the fetch handler. It is removed. Hosted source reads use the same request's native bucket; non-Cloudflare reads reuse `readStoredObject`, whose existing S3 client uses `FetchHttpHandler`. No new SDK client, remote URL fetch or credential cache is introduced.
6. Gemini, Groq and HuggingFace configuration now comes from `GEMINI_API_KEY`, `GROQ_API_KEY`, `HF_API_TOKEN` on that request, including segmentation. The `AI` binding is also preserved. A hosted binding bag is authoritative even when a field is empty or absent; only non-Cloudflare execution uses runtime config.
7. Extracted PNGs reuse `uploadBannerAsset` and the existing signed Banner delivery/catalogue. Fresh server-generated UUIDs define `banner-assets/<persisted-user-id>/...` keys and signed URLs. `banner_assets` insertion uses the uploader from the claimed database row, never queue/model input. No migration is needed. Native `put` is verified by the existing uploader's exact-size `head` before catalogue publication.

## Safety and compatibility review

- Source keys must equal `banner-dissector/<jobId>/original.png|jpg|webp`; traversal, another job's key and URLs fail before storage access. Reads reject missing, empty, over-10-MiB and truncated objects and stop streamed bytes at the declared bounded size. Existing dimension/pixel checks remain.
- Each extracted output is nonempty and at most 10 MiB before persistence. Provider model endpoints remain fixed; no model-controlled source URL is fetched.
- Upload/catalogue errors leave layers unresolved with content-free warnings. Compensation touches only the newly allocated asset UUID/key. Cancellation during native persistence removes that new object before catalogue insertion; failure to insert a catalogue row never publishes its URL.
- Attempt claims, generations, explicit retry limits, recovery leases and durable cancellation fences are unchanged. State is checked again around storage/catalogue boundaries; late work cannot replace a newer/cancelled result.
- Background repair is still unavailable. The original is never substituted for a cutout. Results remain `review_ready` when incomplete, and import readiness requirements are unchanged. This repair does not implement complete creative reconstruction.
- Re-read all five production files and four changed test files end-to-end. Server imports use `~~/server`; no frontend-only dependency was introduced. The only shared-consumer behavior changed is event forwarding for Dissector; endpoint authentication now supports bindings for all queue types.

## Verification

Initial reproduction runs failed on hosted queue execution, binding-only providers, binding-only queue authentication and native source persistence before implementation. Final run: **200 tests passed across 24 files**, exit 0:

```sh
pnpm exec vitest run test/banner/dissectorPipeline.test.ts test/banner/dissectorFailure.test.ts test/server/api/dissectorQueueIngress.test.ts test/server/api/bannerDissectionUpload.test.ts test/server/api/bannerDissectionProcess.test.ts test/server/api/bannerDissectionRecovery.test.ts test/server/utils/bannerDissectionJobs.test.ts test/server/utils/bannerDissectionDispatch.test.ts test/server/utils/bannerDissectionRecovery.test.ts test/banner/dissectionJobControls.test.ts test/banner/dissectionImportControls.test.ts test/server/utils/*QueueConsumer.test.ts test/server/storageCloudflareBindings.test.ts test/server/storageNativeBinding.test.ts test/server/utils/bannerAssetDelivery.test.ts test/server/utils/bannerStorage.test.ts
```

Normal ESLint passes (exit 0) for the pipeline, both routes and all four changed tests:

```sh
pnpm exec eslint server/utils/bannerDissectorPipeline.ts server/api/internal/process-job.post.ts server/api/agency/banner-studio/dissect/upload.post.ts test/banner/dissectorPipeline.test.ts test/banner/dissectorFailure.test.ts test/server/api/dissectorQueueIngress.test.ts test/server/api/bannerDissectionUpload.test.ts
```

Unmodified legacy sections in the two large files retain **114 full-file lint errors**: `bannerDissector.ts` 77 and `queueConsumer.ts` 37. These concern explicit `any`, trailing commas, member delimiters, quote properties and multiple statements per line. Broad cleanup was deliberately excluded. Checking those files with only these existing rule categories disabled passes (exit 0):

```sh
pnpm exec eslint server/utils/bannerDissector.ts server/utils/queueConsumer.ts --rule '@stylistic/comma-dangle: off' --rule '@typescript-eslint/no-explicit-any: off' --rule '@stylistic/member-delimiter-style: off' --rule '@stylistic/quote-props: off' --rule '@stylistic/max-statements-per-line: off'
```

Tests use synthetic database/storage/provider boundaries. They include the real queue branch, real provider credential resolution, real native Banner uploader/signing code, cfEnv promotion, generic queue compatibility, invalid source bounds, failed persistence, cancellation, duplicate generation delivery, retries and recovery. They do not prove live Neon writes, live queue delivery, provider entitlement, hosted native storage, remote cancellation/refunds, reconstruction quality or scheduler behavior. No real-SQL proof or full application suite/build was run in this dispatch.

Root must still verify the deployed consumer/secret match, upload and poll an approved hosted test job, retrieve the signed extracted bytes where available, confirm explicit incomplete/provider-unavailable status and cancellation/retry behavior, and record actual deployment/source evidence. Keep automatic recovery default-off pending hosted acceptance.

## Frozen SHA-256 manifest

Copy these complete original-worktree files, preserving root's unrelated candidate changes. Recompute hashes after copying. This report's own hash is supplied in the worker completion message to avoid a self-referential digest.

| Path | SHA-256 |
|---|---|
| `server/utils/bannerDissectorPipeline.ts` | `bab9ad074c896bfdf2bc51acb3feb384b971c61323e924a7222671452f1bb182` |
| `server/utils/bannerDissector.ts` | `7d15e89394e2462618fd392685d521e247198ff5a2ad9b1b13f584ec7490c823` |
| `server/utils/queueConsumer.ts` | `f7c806649711aca7330811d4f2053681681d02fe045150848010e231d40dbaa0` |
| `server/api/internal/process-job.post.ts` | `cc9ae2352df652096f0a8fe6f10d899c9965c29ae60113dc1af8414d2b5e1841` |
| `server/api/agency/banner-studio/dissect/upload.post.ts` | `221be326dedb910293cea7d6b2929652b08a9f2410d6d4c2aad2365c61d219c5` |
| `test/banner/dissectorPipeline.test.ts` | `c43ea4cd731d9e894a2f5ffa1c9e362d1b139795e6cf48e7960ddc3f6cc78639` |
| `test/banner/dissectorFailure.test.ts` | `b3777c46708137ce8ded3a8aff23f89eccf08aa829e010324a83348b254ca444` |
| `test/server/api/dissectorQueueIngress.test.ts` | `d609a517f41b8dde514f7875705fd6de04cdb5a4aa4e00ed8656cc5f04ff3e86` |
| `test/server/api/bannerDissectionUpload.test.ts` | `d3e3771212ba3d0fe2dd353d955fe1b18fd9b49d5ff09484be86327ee4ba34a6` |
