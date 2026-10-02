# Email template revision history and restore

Status: implementation in progress. This is the next approved CMS checklist item.

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
- Pinned Node 24.18.0 / pnpm 11.9.0, normal hooks, no bypass. Before release fetch
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
review findings live in this plan's .superpowers/sdd workspace until completion.
