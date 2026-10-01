# Native customer Forms connection — 2 October 2026

Status: closed-gate Dashboard preview deployed and verified. The operator’s final
bounded-file-read fix passed scoped review and is committed/pushed.
No hosted native acceptance, production promotion, delivery or publication is claimed.

## Reviewed source

- Dashboard: `a0e36959101e4a7b3759f875b207e23de675cf70`; includes freshly fetched main
  `a98b83a53c65fbb80da48e8a2348610d2c9d24bb`.
- Studio operator: `c219655659eaf0e034286c30faa1835766540eb3`; includes freshly fetched
  main `50d372e1cb0bc92a661379866062dbe75a4539d0`.
- Both source branches pushed. Studio final normal hook checked 1,553 files in 332 seconds,
  changed none; all twelve post-hook file hashes match the reviewed candidate.
- Existing private workers stay at source `e26199556` and the exact versions in the
  [backend receipt](2026-10-02-native-forms-staging-receipt.md). No new worker
  deployment or database migration is needed for the operator.

## Verification

- Current native authority: 44 real local PostgreSQL cases.
- Native/shared HTTP services: 98 focused tests and 69 PostgreSQL cases; the latter
  includes the 44 authority cases and 19 existing portal regressions.
- Forms UI: 47 tests after the permission-default and client-screen fixes. Earlier
  combined 135-test verification covers unchanged backend/adapter code. These are
  distinct runs, not a newly rerun combined total.
- Operator: original 26 core/coordinator/capability tests; final eight Node tests
  and amended retained-proof IPC integration pass; affected types/lint pass.
- Deployment guards: 21 tests and guarded source/target check pass.
- Final isolated build: raw 25,454,785 / 25,468,928 bytes, gzip 7,027,877 / 9,750,000.
  Existing limits unchanged; 14,143 raw bytes spare.
- Full Dashboard typecheck exits 2: 933 existing diagnostics against 934 baseline,
  no new normalized diagnostics. Existing import cycles/Vite warning remain.
- Local Chrome: Fantasy Limo editing restored; transient edit enabled Save and dirty
  navigation guards; Discard restored original revision 2 without persistence.
  Team template customise enabled. Native closed-gate Forms/overview routes render;
  390px layout has no horizontal overflow and no client console errors.
- Final integration review: no outstanding findings. The original Minor file-read
  issue was fixed with bounded ingestion and failure/cleanup tests; scoped review
  approved the two-file delta.

## Release verification

- Target: Cloudflare Pages `agency-dashboard`, branch `preview`, using only the
  guarded `pnpm deploy:check` / `pnpm deploy:preview` commands.
- Deployment: `1d44f4ee-c171-4fc3-b47b-23bbcb17f531`.
- URL: https://1d44f4ee.agency-dashboard-6cm.pages.dev
- Alias: https://preview.agency-dashboard-6cm.pages.dev
- Provider readback confirms preview branch and source `a0e3695`; pre/post-build
  source guard confirms full source SHA above and current main ancestry.
- Deployment build: raw 25,454,785 / 25,468,928, gzip 7,027,901 / 9,750,000.
- Signed-in Chrome: `/studio/sites` lists the existing retained synthetic website;
  `/agency/qr-codes` shows its existing synthetic QR entry and navigation.
- `/studio/website` renders the reviewed Forms unavailable screen. Direct browser
  availability navigation is denied by the closed native signup gate with the
  application’s safe 404. No portal identity/data appears in the native screen.
- Command-line HTTP readback encountered Cloudflare bot-filter 403/code 1010; it
  is not application endpoint acceptance. The actual application state was checked
  in Chrome without extracting cookies, tokens or network records.
- Screenshot: `customer-cms-demo/native-forms-preview-release.jpg`.
- Signup/editor/browser/preview gates remain closed, approval list empty and Forms
  gate absent/closed. No configuration activation, account creation, email,
  customer D1 mutation, private worker redeployment or production release occurred.

The owned release checkout was clean at the deployed SHA; its only observed open
handles belonged to the completed inspection commands, whose exit was verified.
It was retired after live verification. Disposable logical footprint was 3,039,084
KiB (~2.90 GiB); observed filesystem free space increased by 474,256 KiB (~463 MiB),
consistent with shared clone/dependency blocks and concurrent filesystem activity.
Active source repositories, branches, local demo and private logs remain. Cleanup
receipt: `customer-cms-demo/private/native-form-ui-release-cleanup.json`.

Logs are under
`customer-cms-demo/private/native-form-ui-*` and `native-form-operator-commit.log`.
Previous verified Pages deployment: `9fef28bd-b866-4d8a-be04-1dcefbf686de`, source
`5b9b978e0ee2f19b68428fc25e0ea9fb9003fc36`.

## Remaining acceptance

Two real native test mailboxes remain pending. Use supported sign-up/approval and
exact retained staging scopes; do not renew expired approval by editing dates.
Verify private remote transport, install runtime/storage, activate explicitly and complete the full matrix in the
[integration plan](2026-10-02-native-forms-acceptance.md). Keep gates closed until
native browser CRUD and cross-account acceptance pass. Local process/workerd
termination does not prove Cloudflare teardown of an inaccessible remote session.

Native enquiries, sender/reply routing, delivery outbox, published outcomes,
webhooks, AI template proposals and broader CMS rollout remain separate work.
Active source workspaces and the Fantasy Limo demo are retained for that work.
