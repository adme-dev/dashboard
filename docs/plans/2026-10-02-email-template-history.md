# Email template revision history and restore

Status: implementation, local acceptance and closed-preview/private-router release complete.
Hosted native acceptance and retained-runtime installation remain separate prerequisites.

## Spec

Customers can browse saved revisions from a website or shared-form Team/Customer
template editor, preview a selected revision, and explicitly use it as an unsaved
draft. Save appends a new revision using current permissions, website checkpoint
and expected head revision. Nothing is published or emailed. Opening, selecting
or closing history must not replace manual edits; only Use this version does so.

Restore only the selected template. Website restore preserves all current form
overrides. Form restore preserves the website default and other forms. If the
selected old record had no override, clearly restore inheritance of the CURRENT
website default rather than quietly copying an old default into a custom override.
Keep historical records immutable; removed form definitions are not recreated.

History is the audience document's revision log; entries may include saves to
other form templates in that audience. Say this plainly. List revision/date only,
then fetch one full revision for preview. Do not show internal actor identities.
Use existing Nuxt UI styling and a responsive USlideover with list, selected preview
and explicit Use this version action. Read-only members can browse, never apply.
Missing historical images show preview warnings and continue to block ordinary
saves; restoring inheritance preserves the existing reset semantics.

## Global constraints

- Dedicated native and invited-client sessions remain separate; reuse their current
  trusted form authority and exact scoped RPC binding, with fresh checks after awaits.
- No customer signup, capability activation, production gate, billing or sending changes.
- No migration: email_template_drafts is already append-only customer-owned storage.
- Fixed history page size 10, exclusive positive beforeRevision cursor, at most one
  extra metadata row to detect another page. No whole-record list/fetch-all loop.
- Detail reads accept an optional positive revision on the existing private read
  request. Omitted revision still means latest. Reject mismatched revision/scope/audience.
- Private history response: { scope, audience, revisions: [{ revision, updatedAt }],
  nextBeforeRevision: number | null }. Strict schemas, descending unique revisions;
  continuation is the last returned revision only when another page exists.
- Router and worker history method: listEmailTemplateDraftHistory, using the same
  retained form capability and managed route validation as existing draft reads.
- Public list suffix /email-templates/:audience/history; detail suffix
  /email-templates/:audience/history/:revision. Mirror under existing per-form
  and native-customer prefixes. No-store; reject malformed or injected query values.
- Restore applies to editor state only. Existing draft PUT is the only persistence
  path, with current expected revision, conflict preservation and no automatic replay.
- Keep saved Fantasy Limo data/media and active workspaces. Fixtures are local,
  backed up and scoped; preserve original designs after browser acceptance.
- Node 24.18.0; use each repository's declared package manager: Dashboard pnpm
  10.17.1, Studio pnpm 11.9.0. Normal hooks, no bypass. Before release fetch
  main again; guard the immutable agency-dashboard target and preserve QR navigation.

### Task 1: Private history reads and authenticated API adapters

Ownership: Studio email-template contract/store, content-router and runtime worker,
their focused tests; Dashboard shared email-template history schemas, service/types,
native/portal HTTP adapters/routes and focused tests. No UI or marketing changes.

Implement the Global constraints and data contracts above. Extend the existing
read schema with optional revision, add bounded metadata history read and exact
record validation at storage/router/dashboard boundaries. Reuse authority helpers;
do not return full override arrays or actor IDs from public history detail.
Public list can omit private scope; detail projects {revision,updatedAt,template}
where template is null only when a selected shared form inherited the default.
Unknown selected shared form or absent revision returns safe 404. Unavailable
private history methods fail closed with useful 503; latest read stays compatible.

Tests first: pagination boundaries/empty history/descending and foreign scope,
audience isolation, exact revision reads, corrupted or mismatched responses,
viewer read/current role and revoked access across awaits, per-form projection,
unknown definition, strict cursor/revision validation, old service unavailable.
Use real disposable SQLite for storage. No direct D1 writes or deployed mutations.
Read Studio AGENTS.md authoritative references before changes. Run focused tests
and affected lint/types while iterating; all Studio required broad checks once
before task completion. Commit only reviewed/self-reviewed task files with normal
hooks, no push or deployment (parent handles these). Write report with exact
commits, commands/results, files, contracts and any baseline failures.

### Task 2: Revision browser and unsaved restore

Ownership: Dashboard email template editor/history UI component and mounted tests,
relevant marketing descriptions, and local demo adapter bundle if required. Backend
contracts belong to completed Task 1; report any change needed before editing them.

Read the required frontend-design skill before UI edits. Add revision history entry
and Nuxt UI slideover following the Spec. Fetch pages lazily, provide Load older,
and fetch only the selected detail. Use the existing safe preview service, with
synthetic answers and current scoped media. Failed/stale async loads must not show
another selected revision/site/audience, and unmount cancels pending requests.
Apply is explicit, replaces local edits only after visible warning, remains unsaved
and supports existing dirty navigation/discard/save behavior. Preserve exact
historical template representation when unchanged by the editor, including absent
legacy identity fields. Form inheritance restoration previews the current default
and saves null override. Never roll back other forms or resurrect removed overrides.

Tests first for current template unchanged before Apply, cancellation and stale
responses, read-only, pagination, targeted website/form restore, legacy fields,
dirty/conflict handling and native/portal URL selection. Do not send messages or
change saved demo samples while implementing. Self-review and run relevant lint/
tests; commit only task files with normal hooks. Parent handles actual browser
acceptance, broad Dashboard checks and release. Write full task report.

### Task 3: Integration verification and release checkpoint

Parent owns local demo adaptation/backup, real browser acceptance on desktop and
390px, scoped HTTP restore verification, final integration review, current-source
checks, builds and release documentation. Run broad tests required by either repo
once for the candidate. Check no new Dashboard type errors against baseline.

Release worker/router changes only through existing staging runbooks and record
versions. New customer runtime artifact must remain unapproved/uninstalled while
hosted native setup is pending; don't pretend a private router rollout upgrades
retained customer runtimes. Dashboard closed preview is allowed only after build
size guard and review pass. No production enablement. Account for any additional
runtime-upgrade requirement in the hosted checklist. Keep the local demo working.

## Progress / evidence

Dashboard reconciled main 9c095c174 before implementation (social feed fix only).
Studio includes main 50d372e1c; feature branches clean at start. Task reports and
review findings were recorded in this plan's temporary .superpowers/sdd workspace.
The completed evidence is archived privately as
`customer-cms-demo/private/template-history-sdd-evidence.tar.gz`; this document is
the durable public development record.

## Accepted implementation and verification

- [x] Task 1: bounded private metadata history, exact revision reads, native and
  invited-client APIs; independent spec and quality review approved.
- [x] Task 2: lazy revision browser, safe preview and explicit unsaved targeted
  restore; independent review approved, including mobile and void-handler fixes.
- [x] Real Chrome desktop and 390×844 acceptance: browsing preserves manual edits;
  Apply does not persist; Save appends; pagination has no duplicates; restoring
  inherited form settings preserves the current default and other form overrides.
  Fantasy Limo's original templates were restored exactly (Team revision 8,
  Customer revision 16). All 75 pages, 109 media assets and shared forms retained.
- [x] Final independent integration review approved Dashboard `3f48a78455818c1ee617ca06775c5681c9ac69b9`
  and Studio `6adea020968da49c9a0aa46ff7665b0872b976e9`.
- [x] Both implementation feature branches pushed; no production/main merge.
- [x] Private staging router release, provider readback and bindings verified.
- [x] Dashboard final type-baseline comparison: zero new diagnostics.
- [x] Dashboard guarded preview build/deploy and live CMS/QR/closed Forms checks.
- [ ] Hosted native two-customer acceptance (separate rollout prerequisite).

Checks: Dashboard backend 69/69, mounted UI 37/37, source/target guards 17/17,
operator deployment tests 2/2; affected ESLint passes. Studio final focused
65/65 (real SQLite and local workerd D1), full build 28 tasks, types 44 tasks plus
security, full tests 40 tasks plus security/action-runtime/transport suites, and
repository lint over 1,553 files pass. Content-worker 1,063/1,063 and sandbox-worker
900/900 pass. Four existing astro-publisher test skips remain. Normal Studio
pre-commit and commit-message hooks pass. The initial final Dashboard typecheck
found one new click-handler diagnostic; `3f48a7845` fixes it. The final full check
confirms 499 baseline and 499 candidate unique diagnostic identities, zero new or
removed. The full check still exits 2 on pre-existing diagnostics; it is not a pass.

Local evidence is retained under `customer-cms-demo/private/template-history-*`;
backup: `private/backups/2026-10-02T00-13-54.328Z/`. Desktop/mobile screenshots are
`customer-cms-demo/fantasy-limo-template-history.jpg` and
`customer-cms-demo/fantasy-limo-template-history-mobile.jpg`. A fresh mobile tab
logged a browser connection error (“Receiving end does not exist”); no other CMS
console errors were observed in that tab. The temporary viewport override was reset.

## Private staging release receipt

Target: `xeroflow-content-router-staging`, account `a5b299b3ad15c1b5b895dc66f9357b17`.
Source `6adea020968da49c9a0aa46ff7665b0872b976e9` includes freshly fetched Studio
main `50d372e1cb0bc92a661379866062dbe75a4539d0`. Both router dry-runs pass.
Deployment `2b357e22-e357-4ba8-b07e-4c4463c9eb5f`, 100% version
`c12c04e7-441f-48ad-b363-0d13f3aacfd0`; source annotation and bindings read back
from Cloudflare. Upload 770.46 KiB / gzip 125.10 KiB; startup 212 ms.
No public worker URL, routes or cron targets. Staging provisioner/dispatch bindings
and placed-fetch transport are retained. Rollback version:
`efb24dbe-dd5d-4754-9be0-f44649edafa6`. Existing coordinator migrations 0011–0013
confirmed applied; this slice adds no migration.

This router release does not upgrade retained customer runtimes. The new runtime
candidate is 908,727 bytes, SHA-256
`b566720839a7938773ef5ebcfc9d1ac65d5097dc5fd5a0e56c9a3b52b61421a9`,
compatibility date `2026-08-18`, `releaseApproved: false`, uninstalled. Hosted
history requires the scoped managed upgrade and acceptance; old runtimes return
503 without changing drafts. Signup, native Forms, billing and sending stay closed.

## Decisions and tooling follow-up

The execution ledger's decisions are preserved here before its temporary workspace
is retired. Earlier package-manager rulings are superseded by the final decision.

1. Use the audience-wide saved revision log and label saves to other forms clearly.
   Per-form-only indexed history is excluded; changing this later requires a new index.
2. Restore only the selected current template and never recreate removed overrides.
   The tradeoff is that bulk document rollback is unavailable.
3. Omit actor identities, private scope and other form overrides from public history
   responses. An administrative audit view would need a separately authorized API.
4. Accept the normal Studio hook's pnpm 10.15 launcher because the required checks
   used pinned 11.9 and the installed Biome was unchanged. If that assumption proves
   false, repeat the affected hook with the exact 11.9 launcher; future commands use it.
5. Initially retain the Dashboard typecheck run with its automatically selected
   10.17.1, while repeating only fast checks with 11.9. This was superseded by the
   repository-pin decision below and a fresh final full check. Any differing result
   would require rerunning the affected check.
6. Correct the original universal pnpm 11 assumption: use Dashboard 10.17.1 and
   Studio 11.9.0. Preserve the dependency graph and add only verified SheetJS integrity.
   pnpm 11's different override handling proposed 621 lines of transitive lock changes;
   archive those rather than adopt them. A future package-manager/override migration
   needs separate validation. No policy was relaxed.

Tooling repair `401f4205b` adds only the missing SheetJS 0.20.3 tarball SRI.
The official vendor tarball matched all 26 installed archive files; parsed lockfile
content is otherwise identical. Fresh frozen Dashboard 10.17.1 install passes.
pnpm 11 verified dependency integrity but interprets workspace overrides differently;
its proposed transitive lock changes were archived privately and not adopted.
Treat any pnpm/override migration as a separate reviewed dependency change.

## Closed Dashboard preview release receipt

Source `3f48a78455818c1ee617ca06775c5681c9ac69b9` includes freshly fetched main
`9c095c174562d39244f1b662a9f2e5712f465f01`. Clean detached release checkout;
`pnpm deploy:check` and `pnpm deploy:preview` pass with immutable target
`agency-dashboard`, no guard or budget changes. Deployment
`00e6ade1-0d35-4784-8b3b-9a7c62ea298d` is successful and its exact source and
preview alias were independently read back from Cloudflare:
https://00e6ade1.agency-dashboard-6cm.pages.dev
(alias https://preview.agency-dashboard-6cm.pages.dev).

Final bundle: raw 25,462,776 / 25,468,928 bytes (6,152 remaining); gzip 7,030,461 /
9,750,000 bytes. This passes the existing safety budget, but leaves very little room
for new server code. Before extending backend features, plan a bounded extraction
into an existing or dedicated Worker. Do not raise the budget or alter deployment
compaction to fit another feature without a separate justified design/review.

Chrome live checks pass: signed-in `/studio/sites` shows the existing site and
navigation; `/agency/qr-codes` retains its existing synthetic entry and QR navigation;
`/studio/website` displays the expected Forms unavailable state. Provider preview
signup flag remains false; native Forms flag absent. No production enablement,
customer emails, billing changes or hosted form submissions occurred.

Next: two real approved native test identities, supported signup/approval, exact
managed runtime/storage upgrade using the recorded candidate, and the hosted
acceptance matrix. AI template proposals follow that prerequisite and require
explicit text-credit admission, structured validation and Apply semantics.
The Pages bundle capacity constraint is now an additional release-planning item.

## Cleanup

Removed only the owned clean detached `customer-cms-release` build checkout after
all build processes finished. Its ignored files were only dependencies, generated
Nuxt output, deployment output and the Wrangler redirect. Observed available disk
space increased by 532,168,704 bytes (about 508 MiB). Active development repositories,
Fantasy Limo demo/server/data, screenshots and private evidence remain intact.
