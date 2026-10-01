# CMS hosted release — 1 October 2026

User authorized deployment and continued implementation. Release is staged:
Dashboard preview and private staging router first, then customer storage capability
installation and hosted acceptance before production activation.

## Source and rollback

- Dashboard deployed source `fb1e1b61069ba95c0848b2d787ba8872d4166eab` includes freshly fetched main
  `a98b83a53c65fbb80da48e8a2348610d2c9d24bb` (zero behind).
- Studio `01010462722bfe9b90580412239af4135bfc4a8a` includes current main
  `50d372e1cb0bc92a661379866062dbe75a4539d0` (zero behind).
- Prior Pages preview: `6ae12ccc-139f-4cfa-ba7f-06da82a7b13e`, source `9f4c613`.
- Prior private router: `448bf25a-150c-478e-be72-ef750d257dfe`, source
  `a49c2ab85047a84f9e6ada74fc0e414c0053c62e`.
- Rollback to those exact artifacts if regression; keep additive customer data.

## Readiness

- [x] Deployment target and current-main guard pass.
- [x] 83 focused Dashboard deployment/media/forms/workspace tests pass.
- [x] Close temporary native signup/editor/browser/preview flags and clear the
  synthetic provisioning approvals before shipping the current preview.
- [x] Deploy and read back private staging router.
- [x] Deploy Dashboard through `pnpm deploy:preview`, verify exact artifact.
- [x] Signed-in standalone site list and agency QR navigation smoke.
- [ ] Invited-customer workspace smoke: synthetic staging entitlement expired;
      access correctly fails closed. Restore the test entitlement through the
      normal authorized administration process before accepting the workspace.
- [ ] Managed form-settings catalogue/runtime capability upgrade and scope tests.
- [ ] Hosted form/settings/template save, reload, isolation and conflict acceptance.
- [ ] Production release after hosted acceptance; do not call preview production.

The existing hosted schema upgrade accepts only collection, workflow and
collection-staging. Local form-settings migrations 0001–0004 cannot be applied
ad hoc to customer production databases. Until managed installation is complete,
new settings RPCs must remain unavailable; deployment alone is not activation.
The local Fantasy Limo fixture and saved template revision 14 remain intact.

## Router receipt and Pages build repair

Private staging router deployed from Studio `0101046`: version
`cb5ea5be-39d0-4f20-820e-e3773b4f1d12`, read back at 100% on 1 October 2026.
No Sandbox/container or customer runtime was deployed and no customer database
was modified. Existing runtime pins and capability state are unchanged.

The first Pages attempt stopped at the active Nuxt demo lock. This release used
`customer-cms-release`, an isolated clean worktree, preserving port 3044.
The next build stopped at the unchanged raw Worker size guard: 25,489,492 bytes,
20,564 over the 25,468,928-byte safety budget. No Pages upload occurred.
Dashboard `fb1e1b610` extends the existing lossless static SQL compaction threshold
from 512 to 256 characters. Seventeen exact-roundtrip, exclusion and actual-workerd
checks pass, as does lint. The budget and transformation restrictions are unchanged.
The corrected clean build passed the unchanged budget and deployed successfully.

## Pages receipt and hosted verification

- Source: `fb1e1b61069ba95c0848b2d787ba8872d4166eab`.
- Target: `agency-dashboard`, branch `preview` (not production).
- Deployment: `2632007c-c8b9-4a4a-9b7e-840da2e830b9`.
- Artifact: https://2632007c.agency-dashboard-6cm.pages.dev
- Alias: https://preview.agency-dashboard-6cm.pages.dev
- Wrangler deployment-list readback matches the source and deployment ID.
- Raw Worker: 25,455,897 / 25,468,928 bytes (13,031 headroom).
- Gzip Worker: 7,026,571 / 9,750,000 bytes.
- Public signup configuration reads `enabled: false`; temporary native gates
  remain closed. Signed-in site list, agency navigation and QR Codes render.
- Site workspace displays “Website unavailable”. Read-only, explicitly scoped
  staging Neon metadata confirmed the synthetic site's entitlement ended at
  `2026-09-30T10:42:44.371Z`; database time was `2026-10-01T08:03:54.567Z`.
  Client and site remain active. No permissions or entitlement dates were changed.
- Hosted workspace/form acceptance is therefore incomplete. Production was not
  deployed, and no hosted form storage or sending capability was activated.

Evidence and build logs are preserved in `customer-cms-demo/private/`, including
`cms-hosted-preview-deploy.log`, `pages-post-release-list.log` and
`router-post-release-list.log`. Local Fantasy Limo remains running on port 3044.
The owned release worktree and its merged temporary branch were retired after
verification; only generated build output was removed. The development dependency
directory remains intact and the local demo returned HTTP 200 after cleanup.
Browser evidence: `customer-cms-demo/cms-deployed-preview-sites.png`.

Independent review confirmed the physical upgrade must recognize exact successor
schema in predecessor validators and retain a separate runtime successor. Directly
adding forms tables would break current exact-schema CMS checks. The private
installation/readback primitive now has nine SQL tests; it is deliberately unwired.
The Studio plan is `docs/architecture/form-drafts-hosted-upgrade.md`. Coordinator,
compatible runtime transition, scoped capability and hosted acceptance remain open.

Private primitive checks: nine SQLite tests, business-worker typecheck, full Studio
build (28 tasks), typecheck (44 tasks plus security types), package tests (40 tasks)
and lint (1,522 files) pass. Full tests retain the previously recorded staging-route
count assertion (35 pass / 1 fail). No hosted installer call has been made.
Studio checkpoint: `75e8a31`; the final pre-commit check passed all 1,522 files
with no fixes. This private installer is not part of the deployed router version.

## Next implementation boundaries

1. Studio protocol: add a versioned form-drafts upgrade operation beside
   `packages/protocol/src/collection-staging-upgrade.ts`, then extend the native
   customer upgrade union. Bind all three predecessor operation IDs, the exact
   runtime successor and fixed source/target catalogue digests.
2. Coordinator: use the existing staging operation store/executor as the pattern,
   with a new retained table. Every lease/retention mutation must conditionally
   check the ready database and unchanged collection/workflow/staging receipts.
   Cover two-scope isolation, duplicate requests, conflicting identity, expired
   leases, cancellation during provider awaits and lost-ack readback recovery.
3. Runtime: preserve `content-runtime-generation.ts` first-generation evidence;
   add an independently retained successor instead of overwriting migration
   `0010_content_runtime_generations.sql` records. Test provider etag changes and
   incomplete/disabled successors, then teach predecessor validators to accept
   only the exact installed form extension with verified evidence.
4. Dashboard: extend `server/utils/pageStudio/customerSchemaUpgrade.ts` only once
   the matching protocol/executor exists. Require the original current customer
   session, role, site and entitlement at each operation fence.
5. Activation: gate all six form draft RPCs on the installed receipt and selected
   runtime's actual bindings. A deployment/config flag alone is insufficient.
   Restore the synthetic staging entitlement through normal administration and
   run hosted save/reload, stale-write, isolation and legacy CMS regressions.

The list above defines integration work. The checkpoint below records the
completed private subset; it does not claim those hosted paths are wired.

## Continued implementation — private coordinator

The private form-drafts coordinator is implemented with immutable retained
operation identity, a five-minute lease, cancellation and recovery. Each state
mutation compares the exact snapshot of all three installed predecessors and
the ready database reservation. Installed replay verifies physical evidence;
missing schema is rejected rather than recreated. Runtime successor identity,
digest and provider etag are bound into the private request, but are not proof
of authorization until the native/runtime admission adapter is implemented.

Seventeen real D1 coordinator tests pass, including persisted restart recovery,
lost provider/coordinator responses, all predecessor revocations and changed
database state at completion, expired leases, duplicate callers, two-site isolation,
forged receipts and immutable history. The earlier installer suite still has nine
passing SQLite tests; the existing staging coordinator regression suite also passes.
Independent review found no blockers and both suggested test improvements were
added. Full build and typecheck pass; package tests pass and the broader security
suite retains the known staging-route assertion (35 pass / 1 fail).
Full lint passed all 1,525 files with no fixes. Package verification completed
40 tasks, including 978 business-content-worker tests. Build completed 28 tasks;
typecheck completed 44 tasks plus security types. Logs are retained under
`customer-cms-demo/private/forms-coordinator-{build,types,tests,lint}.log`.
Studio checkpoint: `508981e`. Its full pre-commit check also passed all 1,525
files with no fixes; the deployed router source remains `0101046`.

Provisioning migration `0011_form_drafts_upgrades.sql` has been exercised against
disposable real D1 only. No hosted database, deployment or capability changed in
this slice. The coordinator has no worker-entrypoint, RPC or native caller.
Next: independently retained runtime successor and actual-provider verifier,
then matching native customer admission/protocol and six-RPC activation.

Compatibility implementation detail: extract the pure form extension catalogue
and marker definitions before importing them into predecessor validators. The
current physical installer already imports collection/staging helpers, so making
those helpers import the installer would create an initialization cycle. Keep
catalogue identity separate from coordinator/native authorization and verify both.
