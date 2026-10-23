# Staging CMS acceptance diagnostics — 23 October 2026

## Scope and state

Owned worktree: `/Users/paulgiurin/Documents/Projects/studio-management-parity-20261023`, branch `fix/staging-management-parity-20261023`, based on freshly fetched main `3150d05334a02775c3aa8bf4fbda556a21e2193b`.

The staging Management receiver was updated from a source without `cmsAuthoring` to current main (version `4af2a596-8208-453f-a836-b5cebde2f231`, deployment `01571bc4-96e2-4b58-b68b-79e261f79f97`). The RPC is reached, but accepting the existing synthetic Pi candidate still returns503, mapped to502 by the editor. No durable save or production fix is claimed.

## Change

Add fixed failure categories and stages to the private CMS management handler. Logs include only validated operation enum, fixed stage and fixed category. They exclude requests, SQL, error messages, validation values and credentials. Authorization, error responses and write/replay behavior are unchanged. No new public feature or marketing change.

Regression test failed before the change and passed afterward. Three focused test files/19tests passed; Worker typecheck and guarded staging dry-run passed. Logs: `/tmp/pi-v8-cms-diagnostic-{red,tests,types,build}.log` (red log is the intentional before-fix failure).

Read both edited files end-to-end; checked aliases, absence of UI changes, unchanged authorization and absence of new fetching/SSRF surfaces. No migration. Deployment pending at this commit.

## Next steps

Commit and deploy staging only through `node workers/page-studio-management/deploy.mjs staging`. Read the exact deployment/version back. Retest existing authenticated proposal acceptance with service-tail capture filtered to fixed diagnostic fields. Never archive request headers/tokens. Check the current checkpoint and operation receipt before interpreting a retry. Production is not authorized for this diagnostic deployment until its normal exact-main release gates pass.

Main Pi release handoff: `/Users/paulgiurin/Documents/XeroFlow Imports/Recovery 2026-10-23/PAGE-STUDIO-HANDOFF.md`.

## First hosted diagnostic result

Version45e4dc2d-b795-48f8-bc15-0ecb70c052e8 received the fresh synthetic AI acceptance and reported operationcheckpoint / stagecoordinate / categoryunexpected. Jobpi_ui_b4ca3c19-ae0a-4da0-936d-b1b0d6d7bf67 produced a valid one-heading proposal in1model call; accept still502. Thus neither request validation nor final result validation explains this failure. Existing candidate remains available for idempotent retry; do not generate another.

Added fixed classification for existing checkpoint codes and exact known storage errors; unknown error values still never logged. Regression cases failed before and passed after;26focused tests, types and guarded dry-run pass (`/tmp/pi-v8-cms-storage-{tests,types,build}.log`). No changes to persistence or authorization. Follow-up staging deployment pending.

## Coordinator stage diagnostics

Storage classifier deployed as version `1da02a1c-b71f-44e4-845f-69633212cdf0` from `f1ebec233`; retrying the same candidate still reported coordinate/unexpected. Added fixed snapshot/replay/base/artifacts/candidate/verify/commit stages and bounded SQLSTATE categories. The wrapper rethrows the exact original error and invokes work once; transaction boundaries and authorization remain unchanged. Six focused files / 44 tests, Worker typecheck and guarded staging dry-run pass. Evidence: `/tmp/pi-v8-cms-stage-{tests,types,build}.log`. Reviewed the narrow diff and new files; staging deployment follows this commit.

## Hosted result after stage instrumentation

Source `7bf2ee7fa9ba7d997dbdf6867b12fa095b00ebc9` deployed to staging only: version `07e1682b-a98b-4594-a012-a423ffd7dca5`, deployment `d8b64962-5fcd-430b-905e-bfcba81668f9`, API verified100%. Retrying the same candidate succeeded; fresh Launch Studio proved the heading persisted. Supported History restore to the immediately preceding draft succeeded, and another fresh launch proved restoration. Further proposal rejection and generation cancellation left the original heading unchanged. Safe tail emitted no failure for this successful acceptance. This diagnostic change does not explain earlier intermittent failures, so root cause remains unproven.

Pi test admission closed afterward (version `2419e61a-abaf-4854-8784-43e615f8c4e1`, deployment `b8136864-24bd-430c-b900-af0188e7143d`, disabled/empty allowlist/Linux verified). Production unchanged. Full exact-head native CI39942489039 still running. Screenshot and latest operational details are in the stable external handoff folder.
