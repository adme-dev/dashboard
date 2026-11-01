# FigFlow EDM and shared modules implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` for implementation, or `superpowers:subagent-driven-development` when delegation is chosen. Claim tasks below before editing. Implementation progress is recorded below.

**Goal:** Let designers and staff share editable email templates/modules between FigFlow and XeroFlow, with validated email output and safe versioning.
**Architecture:** Extend the existing canonical email document and libraries. Add a bounded FigFlow adapter/bridge and versioned publishing, while retaining the existing private renderer and sending pipeline.
**Tech stack:** Nuxt 4/Vue/Nuxt UI, TypeScript/Zod, Neon Postgres, existing Cloudflare rendering/storage infrastructure; pinned Rust/WASM FigFlow source after ownership verification.
**Spec:** [PRD and design](../specs/2026-10-30-figflow-edm-design.md).

## Global constraints

- This is a tracked delivery plan; F01/F02 must refine exact bridge paths and contract signatures before implementation. Proposed paths below do not imply those files already exist.
- Preserve current template/module IDs, document compatibility, OEM provenance and the existing send pipeline.
- Do not change source, links, offers, locks or user edits silently during conversion.
- Never apply a module update implicitly to a draft or sent campaign.
- Existing bounds: 300 blocks / 512 KiB per module; enforce actual UTF-8 bytes and bounded graph traversal. F02 sets document/asset limits from measured fixtures and existing renderer constraints.
- All dashboard forms use Nuxt UI and the required frontend-design skill. Respect container widths, dark mode and explicit dashboard scroll ownership.
- Keep renderer logic private and reused. Use server-derived scope and server-enforced editing/publishing permissions.
- No live customer sends during acceptance. No production release until the required evidence is attached.
- Start implementation from freshly fetched current main after reconciling existing email work; do not overwrite this workspace's unrelated changes.

## Review focus

1. A staff edit followed by FigFlow reopen must not resurrect stale text or links (F06/F08).
2. A module update removing a personalised field must surface a conflict and retain the old draft (F03/F07).
3. A legacy imported HTML module must preserve content without pretending all layers are editable (F02/F05).
4. A revoked user with an open FigFlow tab must not publish into the previous client (F04/F06).
5. Missing images, long copy and classic Outlook fallback must remain usable or explicitly block publication (F05/F09/F10).

## Task ledger — update in place

Statuses: `not-started`, `in-progress`, `blocked`, `in-review`, `done`. Only use done after acceptance evidence and reviewer sign-off. Every row starts unassigned; no work is implied by a checkbox.

| ID | Deliverable | Depends on | Status | Owner | PR / evidence / blocker |
|---|---|---|---|---|---|
| F01 | Source ownership and integration inventory | — | in-progress | Codex | [Inventory](../../email-builder/figflow-integration-inventory.md); 60 baseline tests pass; live JS/WASM hashes match pinned archive; native save/reopen/PNG export verified on 1 November; source/build ownership audited by Kimi; native bridge integration remains open |
| F02 | Shared contract, capability matrix and fixtures | F01 | in-progress | Codex | Canonical source validation and capability assessment implemented; 58 new cases pass; [matrix](../../email-builder/figflow-capability-matrix.md); Kimi findings addressed; Grok regressions fixed with remaining mapping/media work recorded; native/action contracts remain open |
| F03 | Immutable revisions and legacy migration | F02 | in-progress | Codex | Local PostgreSQL foundation: migration 491, immutable snapshots, CAS, retry receipts; [evidence](../../email-builder/figflow-revision-persistence.md). Existing CRUD integration and remaining F02 contracts open |
| F04 | Secure asset/publish services | F03,F05 | not-started | unassigned | — |
| F05 | Deterministic conversion and renderer coverage | F02 | in-progress | Codex | Canonical-envelope adapter reuses private renderer; six tests pass. Native FigFlow conversion, crop/assets and actual-client spike remain open |
| F06 | FigFlow EDM mode and scoped bridge | F01,F02,F04,F05 | not-started | unassigned | — |
| F07 | Shared module browser, insert and publication | F03–F06 | not-started | unassigned | — |
| F08 | Composer editing and round-trip handoff | F05–F07 | not-started | unassigned | — |
| F09 | Preflight, compatibility UX and test-send gates | F04,F05,F08 | not-started | unassigned | — |
| F10 | End-to-end and real-client acceptance | F06–F09 | not-started | unassigned | — |
| F11 | Documentation, rollout and rollback | F10 | not-started | unassigned | — |
| F12 | Production verification and workspace retirement | F11,R01 | not-started | unassigned | — |
| R01 | Restore Pages release headroom without weakening validation | — | in-progress | Codex / Grok review | ec0dcd39e main has 2,078 raw bytes remaining; measured foundation adds 36,800. Fixed size guard blocks release. Evidence and latest-main caveat below |

## Execution conventions

For each code task: define the failing acceptance fixture/test; run and record the failure; implement the smallest scoped change; run focused tests plus affected existing regression suites; reread every modified file and apply AGENTS.md pre-commit checks; commit only owned files and attach the PR/commit/evidence. Do not write tests that only mirror implementation. No installing dependencies or adding worktrees for this documentation task.

Suggested Vitest invocation for new test files: `pnpm exec vitest run <test-file>`; F01 must confirm the correct repository config and runtime before treating that command as authoritative. Rust/WASM build and test commands must be recorded from the actual owning pipeline, not guessed. Integration/real-client tests have separate explicit prerequisites.

### F01 — Discover owning source and baseline

Existing: source map in PRD; `docs/plans/2026-10-28-figflow-browser-bridge-rnd.md`; existing template/module/rendering files.
Create: `docs/email-builder/figflow-integration-inventory.md`.
Produces: exact source repositories, commits, build pins, integration paths, existing auth/RBAC mapping, baseline fixtures and verification commands.

- [ ] Locate canonical FigFlow source and deployed build pins; temporary source paths are not authoritative.
- [ ] Verify hosted save/export/document APIs and scope/auth behaviour in an authenticated browser.
- [ ] Map module/template CRUD, presets, dynamic modules, sendability and renderer paths; record working-tree versus deployed differences.
- [ ] Record RBAC capabilities, migration runner, test-client access and available disk space.
- [ ] Capture legacy template/module fixtures and current renderer results; fill exact FigFlow file paths into F06 before claiming it.
Acceptance: a new developer can locate and reproduce both editors; missing access is recorded as a blocker rather than assumed.

### F02 — Freeze contract, capabilities and fixtures

Create: `shared/emailRendering/designContract.ts`, `shared/emailRendering/designCapabilities.ts`, `docs/email-builder/figflow-capability-matrix.md`, `test/fixtures/email-design/`, `test/unit/emailDesignContract.test.ts`.
Reference: `app/types/edm.ts`, `app/utils/edmModuleFragment.ts`, existing renderer bounds.
Proposed interfaces: `validateEmailDesign(input: unknown): EmailDesignDocument`; `assessDesignCapabilities(document: EmailDesignDocument): CapabilityReport`. Define/export all referenced types here before consumers implement them.

- [ ] Specify document/module revision envelope, complete pinned dependency closure, stable node/field lineage, instance overrides, edit-policy defaults and draft-owned native-source references. Define durable proposal states/expiry and exact save/publish action targets.
- [x] Define exact action inputs/outputs and error codes for F04/F06/F08, including scope, revision, idempotency and conflict behaviour. Contract-only evidence: `designActions.ts`, 53 tests, [action contract](../../email-builder/figflow-action-contract.md); route/lifecycle enforcement remains open.
- [ ] Classify every supported feature using the PRD matrix; identify composer gaps and lock/raster/unsupported fallbacks.
- [ ] Add positive fixtures and rejection tests: multibyte overflow, cycles, orphan nodes, invalid root refs, unsupported schema and forged policy changes.
- [ ] Set measured visual tolerances and bounded asset/document limits, preserving existing legacy behaviour.
Acceptance: contract tests pass; capability matrix covers all PRD fixtures; no undefined cross-task types or guessed bridge formats remain.

### F03 — Revision persistence and migration

Modify: `server/utils/email-marketing/templates.ts`, `customModules.ts`, existing template/module endpoints.
Create: `server/utils/email-marketing/designRevisions.ts`, an additive migration in `server/database/migrations/` using the next verified available number; `test/unit/emailDesignRevisions.test.ts` and DB integration coverage.
Consumes F02 contract. Produces immutable revision reads/writes, draft compare-and-swap and idempotent publication reservation.

- [ ] Test legacy IDs/content, revision immutability, concurrent writes, duplicate publish retries and client isolation against a disposable database.
- [ ] Add revision/instance provenance and edit-policy persistence without replacing existing mutable library IDs.
- [ ] Backfill legacy initial revisions as immutable byte copies with explicit legacy origin; route old mutation endpoints through version-aware writes. Preserve existing campaign HTML, prevent cascade deletion of referenced revisions/assets, and never regenerate scheduled/sent snapshots.
- [ ] Test module/template update conflicts, archive behaviour, pinned draft/sent snapshots and rollback readability. Test atomic draft-native/canonical/mapping revisions and independently resumable designer working drafts.
- [ ] Follow repository migration procedure on the explicitly identified environment, record applied migration and verify results.
Acceptance: migrations/retries are safe; legacy documents still render; no implicit updates or destructive deletes of referenced revisions.

### F04 — Scoped publishing and durable assets

Create: `server/utils/email-marketing/designPublishing.ts`, `designAssets.ts`, `server/api/email/design/publish.post.ts`, `test/unit/emailDesignPublishing.test.ts`.
Consumes F02/F03/F05 and existing auth/rendering service. Produces atomic publish receipts and asset manifests.

- [ ] Test source-read/destination-write authorisation, agency publishing authority, revoked access, interrupted uploads and same-ID/different-payload conflicts.
- [ ] Stage privately; commit revision/manifest before the delivery gateway permits public access. Use immutable content-addressed keys and a reconciled state machine across database/storage boundaries, not a fictitious distributed transaction. Test post-upload/pre-commit and post-commit/pre-receipt failures.
- [ ] Compile/preflight before publication commit using F05 context-aware module/template validation; test that a hero module publishes without a subject/footer while invalid assembled campaign output cannot pass send validation. Failed publication retains editable draft and clear issues.
- [ ] Test cleanup of abandoned uploads, retention of referenced assets, same-payload transient retries, payload-bound uncertain claims, safe URL handling and SSRF rejection for any fetch path.
Acceptance: publish is recoverable/idempotent; no private design leaks, partial published revisions or unreferenced required assets.

### F05 — Conversion and rendering

Create: `shared/emailRendering/designAdapter.ts`, `test/unit/emailDesignAdapter.test.ts`, `test/utils/emailDesignRenderParity.test.ts`.
Modify only needed renderer blocks under `workers/email-rendering/src/render/`; reuse existing rendering contract.
Produces deterministic canonical email source plus mapped capabilities/issues and context-aware module/template validation for F04; never raw browser-canvas HTML as final email output. F09 later adds campaign-specific gating and UX, so F04 does not depend on F09.

- [ ] Test supported FigFlow nodes → existing email blocks and reverse mapping using stable semantic fields.
- [ ] Preserve text, links, merge tokens, responsive rules, locks and module lineage across a round trip; test first-open native creation from composer content without a FigFlow snapshot.
- [ ] Add explicit reversible handling for legacy HTML, raster artwork and unsupported dynamic/freeform features.
- [ ] Verify deterministic crop assets, font fallbacks, CTA functionality, plaintext and client-specific output fixtures. Add sanitised legacy conditional-markup fixtures, text/URL token escaping, platform unsubscribe-link validation and cross-client dynamic-binding rejection.
- [ ] Run an early real-client compiler spike for columns, buttons, legacy Outlook fallbacks and dark mode across the required client families before F06; record exact versions and source/output hashes. Treat reviewer client-behaviour claims as hypotheses until reproduced.
Acceptance: fixture invariants pass; unsupported cases fail visibly; the same source uses the same renderer regardless of editor.

### F06 — FigFlow mode and browser bridge

Files: canonical Rust/WASM source paths and pinned build manifests recorded by F01; proposed dashboard service `server/utils/email-marketing/designSessions.ts` and routes under `server/api/email/design/sessions/`; integration tests `test/integration/emailDesignSessions.test.ts`.
Consumes F02 bridge envelope, F04 assets/publish and F05 adapter.

- [ ] Add Email / EDM document mode, desktop/mobile preview, approved components and editing metadata.
- [ ] Expose only bounded EDM operations against the actual document instance; no general engine execution or filesystem access.
- [ ] Test exact production/staging origin allowlists, separate-tab server-mediated sessions, actor/scope/document/revision binding, revocation at upload completion/publish, tab switches, reconnects and duplicate operations. Optional postMessage carries no write authority.
- [ ] Use durable save receipts; distinguish unsaved local work, saved draft and published revision. Test cancelled/offline save and reopen retain unsaved content and its indicator.
- [ ] Build pinned WASM and verify against actual hosted editor, including native snapshot reopen.
Acceptance: real browser edits round-trip through the authenticated bridge; a shell-only change or mocked bridge is insufficient.

### F07 — One module library in both editors

Modify: `app/composables/useEdmCustomModules.ts`, `app/utils/edmModuleFragment.ts`, `app/components/email/builder/EdmAddModuleMenu.vue`, module endpoints; FigFlow library panel at F01-owned paths.
Tests: `test/integration/emailSharedModules.test.ts`.

- [ ] List authorised built-in/custom modules with capability status and immutable revision identifiers.
- [ ] Insert repeatedly with collision-free instance IDs; preserve author-defined field lineage and editing restrictions.
- [ ] Publish selected FigFlow sections and composer sections through F04 into the same library.
- [ ] Add explicit update preview/conflict resolution; preserve local overrides and old versions on cancel. Require base revision and selection of included overrides when publishing a campaign instance back to the library.
Acceptance: both directions work for structured modules; legacy modules have honest editing limits; client/library boundaries hold.

### F08 — Staff editing and return to FigFlow

Modify: `app/components/email/builder/EdmFlyhubBuilder.client.vue`, `app/composables/useEdmBuilder.ts`, relevant existing property panels and `app/components/email/TemplatesPanel.vue`.
Create focused controls only where F02 identifies gaps; proposed `app/components/email/builder/EdmDesignHandoff.vue`; tests `test/components/emailDesignEditing.test.ts`, `test/integration/emailDesignRoundTrip.test.ts`.

- [ ] Implement approved text, image/crop, spacing, button, column/mobile and section controls from F02.
- [ ] Enforce locks in controls and server mutation validation; label design-only sections and provide Edit in FigFlow.
- [ ] Save exact draft revision before handoff; patch current staff content into native design on open.
- [ ] Preview return proposal; reject stale drafts, retain both versions on conflicts, and make application one undoable change.
- [ ] Use the PRD action labels for draft save, library publication and explicitly typed save-as-new operations; test two drafts remain independent and explicit template updates preserve compatible overrides.
- [ ] Test two successive FigFlow round trips, durable proposal resume after tab close, keep-current/save-as-new/restart conflict choices and a staff-only ordinary campaign-editing journey using default policies.
Acceptance: staff can complete ordinary content changes without the designer; switching editors never silently loses edits.

### F09 — Preflight and send workflow

Modify: `server/utils/email-marketing/sendability.ts`, template test-send endpoint and existing preview UI. Add `test/unit/emailDesignPreflight.test.ts`.

- [ ] Surface actionable blockers/warnings with section/field references and clear validation tier labels.
- [ ] Check frozen campaign HTML after personalisation and tracking, assets, plaintext, URLs, required footer, required resolved tokens and HTML size. Never recompile previously scheduled campaign snapshots. Test text/URL escaping and reject decoy/hidden unsubscribe-only content.
- [ ] Preserve existing consent/suppression/sender checks; do not add a second sending path.
- [ ] Test invalid drafts remain saveable but cannot be published/sent as ready; fixes invalidate stale reports.
Acceptance: preview is never labelled real-client validation; content mutations invalidate prior approval/report hashes.

### F10 — Cross-editor and real-client acceptance

Create: `docs/email-builder/figflow-acceptance.md`; fixtures and automated E2E tests under the verified repository test convention.

- [ ] Run every PRD fixture through both editor directions, version updates, permissions, undo, migration and failure recovery.
- [ ] Test Apple Mail macOS/iOS, Gmail web/mobile, classic/new Outlook Windows and Outlook web; record exact client/version/date/output hash.
- [ ] Cover dark mode, blocked images, long text, Unicode, replacement images, tracking and synthetic merge fields.
- [ ] Attach screenshots/output artifacts, issues and explicit accepted tolerances. Missing client coverage is a blocker, not a pass.
Acceptance: all mandatory invariants and client gates passed; designated test recipients only.

### F11 — Release, documentation and rollback

Create: `docs/runbooks/figflow-edm.md`. Update public feature pages and relevant creative/email documentation when capability ships.

- [ ] Record feature flags, permissions, supported limitations, restore procedures and migration/asset retention operations.
- [ ] Rehearse rollback: disable authoring/publish and new campaign-selection eligibility, restore previous FigFlow artifact pin, reject unknown schema writes, and prove existing drafts/scheduled sends continue using their frozen snapshots.
- [ ] Verify current main, intended targets, source pins, build checks, Nuxt UI behaviour and existing navigation including QR Codes.
- [ ] Run repository deployment guards; release staged cohort first with separate dashboard/renderer/FigFlow artifact receipts.
Acceptance: staged sign-off and rollback evidence attached; no misleading public compatibility claims.

### F12 — Live verification and retirement

- [ ] Verify deployed versions match release receipts and complete synthetic live author/create/save/insert/edit/return flows.
- [ ] Confirm no unexpected changes to existing campaigns, shared modules or client scope.
- [ ] Record product-owner acceptance, outstanding issues, operating owner and monitoring links.
- [ ] Retire owned completed workspaces only after preserving unique files/branches and checking shared dependencies and live processes.
Acceptance: source, configuration, deployment, rendering and actual send acceptance are recorded separately; task ledger is complete.

## Progress and decision record

Each task handoff must include owner, status, branch/base/head, changed files, tests and results, PR/deployment links, blockers, next exact action and shared environment/dependency ownership. Record decisions here with date, rationale and affected task IDs. Never leave the only progress record in a chat transcript.

| Date | Decision / progress | Evidence |
|---|---|---|
| 2026-10-30 | PRD and task ledger drafted; no feature implementation started | User discussion; source map in PRD |
| 2026-10-30 | Composer capability review added as a prerequisite, with explicit native/locked/raster/unsupported outcomes | User requested composer improvements and design recommendations |

## Review record

Kimi: completed 2026-10-30. Incorporated six findings: draft-owned native artifacts, object/action lifecycle, typed preflight, pinned dependency closure and explicit override publication, resumable proposals, and default editing policies/staff acceptance.
Grok: completed 2026-10-30. Incorporated early real-client compiler testing; conditional-markup sanitisation; immutable revisions/media and frozen campaign HTML; staged publication recovery; exact origins/revision fences; contextual escaping/dynamic-binding isolation; campaign-eligibility rollout gates. Adapted recommendations: database/storage are not atomically committed together; use a reconciled state machine. Retain uncertain idempotency claims. Use CAS and recoverable conflicts rather than mandating exclusive leases. Client-specific rendering assertions require reproduction, not acceptance as facts.
Builder check: completed; fixed context-specific preflight, native-source optionality/first-open conversion, unsaved indicators, and publication dependency ordering.

Final independent builder recheck: no remaining critical contradictions. Document validation passed for local links, whitespace and all 12 task/ledger entries. These checks validate the handoff documents only; no product implementation or email-client acceptance is claimed.

2026-10-30 F01 progress: fresh main is 4c4b3d06b; current source is 9 commits behind with existing dirty work. Located FigFlow build integration on separate creative branches, inactive/unpinned bridge patch, and Linux-only CI recipe. Four baseline files / 60 tests passed. Hosted verification reached sign-in only; user sign-in requested. See inventory for exact remaining gates. No product code, database, deployment or new worktree changes.

2026-10-30 authenticated follow-up: FigFlow loaded and saved two synthetic native ZIP/JSON files; live composer module picker verified. Public wasmBindings exports expose startup only. Full reopen/non-empty export, lesser-role scope tests and source reconciliation remain open; F01 is not marked complete.

2026-10-30 implementation start: preserved tracked email-builder changes in named Git stash, fast-forwarded this existing worktree to origin/main 4c4b3d06b, and restored edits without conflicts. Untracked link-navigation test matched main byte-for-byte and its backup remains under /private/tmp. No new checkout/dependencies. F02 canonical validation can proceed independently; F01 hosted/native integration gates remain open. Available disk: 3.3 GiB.

2026-10-30 F01/F02 checkpoint: live JS and WASM decoded bytes match the pinned
archive; inventory records exact hashes. Native upload tool rejects this
checkout against its configured workspace roots, so reopen/export remains
unverified. F02 added independent canonical validation/capability modules,
synthetic fixtures and 29 acceptance cases. Focused contract/module/scope/render
regressions passed before widening to canvas navigation; wider run: 93 passed,
1 existing modified-HTML-click test failed. Isolated navigation rerun: 5 passed.
Treat that as intermittent, not a clean wider-suite result. Standalone tsc for
both new production modules passed. No routes, DB, publication or deployment
were changed. Kimi and Grok are reviewing this partial slice; F02 is not done.
Disposable test DB/tenant and designated client inboxes requested for F03/F10.

2026-10-30 review correction: Kimi identified column-slot amplification, ambiguous
instance ownership, non-container columns handling and renderer-depth mismatch.
Added failing regressions and corrected each, including duplicate/overlapping
instance roots and non-layout ownership. Final focused run: 6 files / 97 tests
passed (37 new cases plus 60 existing). Standalone TypeScript check passed.
The earlier intermittent canvas-navigation failure remains recorded; no claim
of a clean full-repository suite. Kimi report is at
`/private/tmp/figflow-f02-kimi-review.md`; Grok is rereading the frozen corrected
source. All changes remain local and uncommitted; no feature is activated.


2026-10-31 resumed: fresh origin/main still equals this branch base 4c4b3d06b.
Read Grok final review and reproduced current defects before fixes. Added strict
column count/slot parity, policy-aware editability, scalar non-structural field
grants, UUID client declarations, client-required campaign drafts, typed
instance overrides, PNG/JPEG/GIF manifest restriction and stable public errors.
Added `assertStaffDesignEdit` for content-only diffs with scope/layout/provenance
unchanged; this remains unwired and requires fresh persisted revision plus
server auth/CAS. Final focused regression: 8 files / 118 tests pass. Mapping,
media, native/session/action contracts and integration acceptance remain open.
See capability matrix follow-up for review dispositions. No migrations,
customer sends, deployment, or unrelated edits performed.

2026-10-31 environment: local PostgreSQL 14.19 cluster startup/identity check
succeeded with a private socket and no TCP, then cluster stopped cleanly.
Inventory records restart instructions. This removes the isolated-DB availability
blocker for F03; contract finalisation and actual persistence implementation
remain prerequisites. The current browser runtime has no connected browser,
so F01 native reopen remains blocked. Hosted role identities and real-client
inboxes still require separate acceptance access.


2026-10-31 F03 independent foundation: added migration 491 and revision store.
Applied migration twice per isolated PostgreSQL schema, with real transaction,
concurrency, retry, rollback, ownership drift, frozen campaign and legacy
snapshot coverage. Legacy JSON snapshots are copied inside PostgreSQL to avoid
JavaScript numeric precision loss; no existing source row is rewritten.
Final focused suite before final boundary review: 9 files / 131 tests pass,
including 13 real-PostgreSQL cases. F03 is not complete: legacy CRUD routing,
module dependency closure, archive/update policy, resumable designer drafts and
hosted migration acceptance remain open. F02 is not waived. No production DB,
existing campaign, deployment or live send was touched.

2026-10-31 F02/F05 independent progress: `designDependencies.ts` verifies exact
transitive immutable pins, rejects missing/extra pins and cycles, checks every
scope edge (including shared modules nested in client documents), and bounds
total revision bytes. Ten tests pass. Its resolver must still be wired to the
authorised database revision reader. Capability reports now flag stored grants
that a locked mapping cannot honour. `designAdapter.ts` converts only the
canonical envelope to existing renderer input; six tests use the real private
renderer client for token/CTA/legacy-HTML/module behaviour. This is not native
FigFlow file decoding or client compatibility acceptance. Kimi owns only new
action-contract files; Grok is reviewing the frozen F03 foundation.


2026-10-31 review remediation and stored dependencies: Kimi completed the nine
strict action envelopes and durable-proposal lifecycle contract (53 tests).
Grok's F03 review identified head rewinds/forks, owner-scope drift, missing legacy
baselines, ambiguous retry documentation and JSONB byte-budget expansion. Local
fixes add direct-successor/commit guards, frozen versioned-owner scope, mandatory
legacy baselines and compact source storage with generated JSONB. Retries remain
bound to the complete original request, including the original expected head;
this deliberate behavior is now documented and tested. No final reviewer signoff
on the corrected bytes is claimed.

The isolated test database is now `figflow_design_test`, explicitly UTF8 from
template0. Tests assert encoding and round-trip an exact 2 MiB source containing
emoji. `resolveStoredDesignDependencies` resolves exact historical module IDs and
revisions from PostgreSQL, rechecks module-read access, verifies actual owner
scope and rejects legacy/wrong-owner revisions. Root-write authorisation and
append/publication integration still belong to the callers and remain open.

Focused verification: 8 files / 152 tests pass, including 24 real PostgreSQL
cases and 53 action-contract cases. Shared design modules plus dependency code
pass standalone strict TypeScript; owned source/tests pass ESLint. This is not a
full Nuxt typecheck, hosted database acceptance or email-client compatibility
proof. The local database uses synthetic owners and applies migration 491 twice
per schema. No production migration, customer send or deployment occurred.

Next: integrate revision-aware existing CRUD and durable working drafts/proposals,
then asset/publication guards and native bridge. F01 native reopen remains blocked
by the disconnected browser runtime; hosted lesser-role and Apple Mail/Gmail/
Outlook acceptance still require test access. F01/F02/F03/F05 remain in progress.


2026-10-31 transactional staff-save boundary: fresh origin/main equals HEAD
(0 ahead/0 behind). Added `appendStaffDesignRevision`, comparing permitted edits
against the locked stored head; staff cannot promote a legacy snapshot, forge
policy, or alter protected structure. Structural saves still require a
server-supplied designer authoriser. Both append paths now resolve complete
stored module dependencies inside the transaction and require explicit fresh
module-read authority, including receipt recovery. Rejections leave the current
head unchanged; historical retries do not overwrite newer content.

Ruling: do not connect the legacy template PATCH to source-only revision appends
yet. The existing route rewrites source and rendered HTML without a revision
token, while publication/preflight and atomic legacy projection are unfinished.
Connecting them now could create a saved canonical revision that disagrees with
the library HTML. Implement and verify that atomic projection plus version-aware
request contract before activating the route; this delays HTTP integration but
preserves existing behaviour. No existing route or public feature claim changed.

Verification: 8 focused files / 157 tests pass, including 29 real PostgreSQL cases.
Three new tests failed before implementation (missing staff boundary and an
unauthorised dependency-bearing append succeeding); all pass after the change.
Additional regressions cover removed field grants, stale revision conflicts,
revoked receipt access and reconciliation after later edits. This is local
service evidence only. F03 remains in progress; route integration, drafts and
proposal persistence, publication and native/browser acceptance remain open.


2026-10-31 atomic template-draft projection: origin/main still equals HEAD.
Added designer/staff draft save functions to `designRevisions.ts`. Existing draft
source, private-renderer HTML, canonical head and retry receipt now commit or
roll back together. Scope, kind, CAS and staff policy apply before render;
write/module-read authority is checked again afterward. The save target is part
of the operation digest, preventing source-only receipts being treated as HTML
projection receipts. Library templates, campaigns and modules cannot be written
through this draft-only operation.

Verification: 8 files / 163 tests pass, including 35 PostgreSQL cases with the
actual private-renderer fixture. New cases cover source/HTML consistency, old
retry after later staff edits, renderer failure, projection failure, receipt
failure after HTML update, revocation during rendering, draft-only targeting and
cross-target idempotency conflicts. The first three tests failed before the new
save functions existed. All changes remain local and uncommitted.

Ruling: retain the existing owner/head lock during rendering for this initial
atomic implementation. This prevents concurrent subject/preheader or source drift;
the cost is longer lock duration. Inspection found no timeout in the renderer
client; a 15-second save-specific deadline now rolls back a stalled render
without retry or later continuation. The stalled-render regression exercises
that actual deadline and proves the same request can save after rollback. A later
optimisation needs metadata CAS as well as the current revision fence.

HTTP activation remains open: legacy PATCH has no revision token and can bypass
a new canonical head; fresh staff/designer/publisher authority must be mapped to
existing RBAC without request-context or five-minute assignment-cache reuse.
Draft projection is implemented, but this is not complete CRUD integration,
publishing, hosted migration or real email-client acceptance. F03 stays in progress.


2026-10-31 gated save integration: current main still matches HEAD. Added a
bounded-stream `save-draft` HTTP boundary, disabled unless the explicit Cloudflare
flag is set. Actor comes from fresh session validation. A new uncached access
adapter reuses existing configured role groups/client assignments and derives
staff versus CREATIVE designer mode; it fails closed on missing custom roles,
revocation, read-only accounts and unavailable authority. The server callbacks
recheck session/scope/role after locks and rendering. Receipts use persisted time.

Migration 491 now guards template source/HTML with a projection revision marker.
A regression first demonstrated that legacy SQL could overwrite a versioned
HTML body; it now rejects that write, subject changes and implicit publication.
Existing PATCH/DELETE map only owned constraints to content-free 409 conflicts;
unversioned editing/deletion continues to work. Migration was applied twice per
isolated schema, not to production. No feature flag was enabled.

Ruling: this gated HTTP slice targets only existing template-draft document IDs.
Do not create a second working-draft identity or imply that template/module/campaign
lifecycle endpoints are complete. Read/open/initialisation and UI integration are
next. Versioned subject/preheader editing is deliberately blocked until metadata
can join the same atomic revision contract; the cost is a clear conflict for an
old editor rather than an unrecorded overwrite.

Verification: 12 focused files / 185 tests pass (36 real PostgreSQL cases; HTTP
and fresh-authority tests are mocked boundary tests). New route, access helper,
SQL guard and legacy conflict mapping are local and uncommitted. F03 remains
in progress; no hosted roles, migration rollout, UI, native bridge or client-render
acceptance is claimed. The browser runtime connection remains a separate F01 gate.


2026-10-31 Kimi/Grok continuation: launched Kimi for isolated read-service/test
implementation and Grok for read-only save/access/SQL review. Parent owns GET
boundary/integration and review remediation. Runtime handles are recorded in
`/private/tmp/figflow-read-kimi-result.md` and
`/private/tmp/figflow-save-grok-review-20261031.md` when completed; a launch alone
is not completion evidence.

Fresh origin/main advanced 11 commits to `4794ae06d`. Fast-forwarded this branch
and restored the three overlapping local patches (feature index/detail and
nuxt.config). Their added/deleted lines match the preserved patches exactly;
no conflicts remain and branch divergence is 0/0. Recovery stash
`f0fb09477de2efac240f6796b41dc8d335112598` is retained. Incoming changes were Banner
Studio/Creative Suite work, not the owned FigFlow save/read files. Unrelated
local email-builder edits remain unstaged and untouched.


2026-10-31 Kimi read integration checkpoint: Kimi delivered `designReads.ts` and
12 focused tests, with its completion record at
`/private/tmp/figflow-read-kimi-result.md`. Parent reviewed the source, added the
gated GET boundary (nine HTTP tests), and exercised real PostgreSQL read
transitions and read-without-mutation (two additional DB cases). Structured
projection status is current/stale/unprojected; legacy source remains raw JSON
text with unverified projection, preserving numeric precision. No HTML or native
artifact bytes are returned, and responses use no-store caching.

Verification on base `4794ae06d`: 14 focused files / 208 passing tests, including
38 PostgreSQL cases; owned source/tests pass ESLint and the read service passes
standalone strict TypeScript. Previous temporary PostgreSQL data was absent;
recreated PostgreSQL 14.19 UTF8 with installed binaries, Unix socket only at
`/private/tmp/figflow-postgres-rZeu9V3y`. No production data or `.env` was used.
Grok review remains pending at this checkpoint; no approval is inferred from
successful local tests. F03 remains in progress: explicit initialization,
version-aware composer UI, metadata edits, archive/proposals and publication are
still open. Source is local/uncommitted and the feature flag stays disabled.


2026-10-31 Grok review disposition: archived the independent report at
`docs/email-builder/reviews/2026-10-31-grok-save-review.md` (reviewed save path,
not Kimi/GET files; 46 mocked review tests passed). Reproduced its schema-0 lost
update finding: a legacy edit after snapshot was overwritten by conversion.
Fixed with a locked SQL equality check against the exact legacy snapshot before
any first structured append; changed legacy source now conflicts and neither
live HTML nor the head moves. Source-only appends cannot bypass it. SQL-only
comparison preserves large numeric values, verified by extending the precision
case. Added legacy drift to the read result and verified its regression red/green.

Ruling: preserve the full live-owner equality check at conversion, including
metadata/timestamps, rather than guessing which old-editor changes are safe to
ignore. Cost: a harmless legacy metadata edit may require explicit refresh/copy
recovery. That recovery and UI initialization remain activation gates.

Ruling on Grok finding 5: not reproduced; Promise.race installs rejection handlers
on its inputs even when the timeout wins. Extended the real 15-second timeout
case to reject the renderer afterward, observe no unhandledRejection, confirm
rollback and retry successfully. No production code change was needed for this
finding. Cost if this judgment is wrong: a future non-Promise renderer transport
would need its own cancellation/late-failure semantics; the current client returns
ordinary Promises and the regression covers that behavior.

Deferred minor findings before activation: (3) map versioned client-move scope
trigger errors to stable 409 responses; (4) mask missing versus out-of-scope save
IDs consistently. Existing checks prevent the moves and return no foreign source,
but status/error behavior still needs tightening. Grok's open-flow activation
requirements are partly covered by Kimi/GET and real-DB checks; initialization,
metadata operations, stale-state UI and hosted role tests remain open. No flag
was enabled, no production migration was run and F03 is not marked complete.

Final checkpoint for this Kimi/Grok batch: 14 files / 210 tests pass, including
39 PostgreSQL cases. Owned design source/tests and GET/PATCH routes pass ESLint;
read-service standalone strict TypeScript passes. Migration 491 was applied
twice per synthetic schema. No hosted/browser/email-client acceptance is implied.
Kimi completed its bounded implementation; Grok completed the independent report;
parent integrated and remediated as recorded above. Agent sessions are retained
for the user's ongoing collaboration, with no further work dispatched this batch.

### 31 October continuation — explicit draft initialization

Reconciled worktree by fast-forwarding to current origin/main
`646f18905591467d5f581a210fdc4631e95baf3b`; incoming changes did not touch email
design paths. Dirty feature pages were stashed and reapplied without conflicts;
recovery stash `5b7bd44bb3c7db5fb3c043adf3466ffb926b7afc` remains retained. Unrelated
email-builder work is preserved. No commit or deployment was performed.

- [x] Resolve Grok minor findings 3/4: named scope-copy conflict and missing/
  out-of-scope identity masking; authorize reads before state disclosure.
- [x] Kimi implementation: initialize an existing template draft under one owner
  lock/transaction, preserving current identities and heads on repeats.
- [x] Parent integration: explicit designer-only initialization HTTP endpoint,
  strict bounded JSON, origin check, server actor, fresh authority under lock.
- [x] Parent actual PostgreSQL verification: concurrent calls, unchanged source,
  existing-head preservation and transaction rollback.
- [x] Combined local verification: 16 files / 232 tests, including 42 PostgreSQL
  cases; ESLint passes for changed design services/routes/tests.
- [ ] Explicit stale legacy refresh/copy recovery and atomic metadata operations.
- [ ] Version-aware composer controls and native FigFlow open/save bridge.
- [ ] Hosted role/session testing and Apple Mail/Outlook/Gmail rendering acceptance.

F03 remains in progress. The initialization endpoint provides a source-history
boundary only. It does not certify delivery or make the native editor integration
complete. The read and save flag remains disabled by default. Kimi's report is
`/private/tmp/figflow-init-kimi-result.md`; Grok's archived independent findings
and dispositions remain linked above. GET never initializes records.

### 31 October continuation — consistent draft request boundaries

Base reconciled to freshly fetched origin/main
`2db9cc6f33caa4c71490b3416963799a2cd37912` (11 incoming commits, no email-design
changes). The two dirty feature pages were stashed and reapplied cleanly; their
added/deleted lines compare identically before/after. Recovery stash
`c9ee754f2dd3685aec5a265b5f824bb259f32130` is retained.

Request hardening is a dependency before composer integration: initialization
already checked Origin/JSON while PATCH did not. Parent reproduced three failures
(cross-origin/form requests, cross-site fetch metadata, configured-origin handling)
in the save route before integration. Kimi owns the shared request guard and
streaming-reader tests; parent owns route wiring and route regressions. Grok is
reviewing initialization and recommending the next atomic metadata contract.
No flag activation, publish, migration change or production write is authorized
by these local results. Final evidence for this batch follows below.

Request-boundary implementation verification: **17 files / 271 tests pass**,
including **42 real PostgreSQL cases**. ESLint passes for the shared request
helper, its tests and both changed routes/route tests. Kimi completed 32 focused
cases; parent added two more normalization regressions (dot-segment paths) and
fixed the raw configuration shape check after observing both fail. The parser
itself is unchanged. Parent's three original failing save-route cases now pass.
The first combined run overlapped Kimi's final RED cases and failed those three;
the final run above uses the completed implementation and includes every case.

Kimi report archived at
[request implementation](../../email-builder/reviews/2026-10-31-kimi-request-implementation.md).
Both agent sessions are retained for ongoing collaboration. No commit, release,
production schema update or feature-flag activation was performed. F03 remains
in progress; metadata edits, stale legacy recovery, composer controls and native
bridge integration remain open. Grok's initialization review is tracked separately
and is not implied by these passing tests.

Grok review completed and archived at
[initialization review](../../email-builder/reviews/2026-10-31-grok-initialization-review.md).
Parent accepted the medium repeated-initialization drift finding: a new unit
regression and actual PostgreSQL regression both reproduced a successful stale
locator before the fix. The initializer now compares the immutable schema-0 head
with the locked live row in SQL and returns LEGACY_CONTENT_CHANGED without
replacing a snapshot or changing live content. Existing structured heads still
return their current locator. Final combined verification: **17 files / 273 tests
pass, including 43 PostgreSQL cases**, and owned-file ESLint passes.

Final: fixed repeated-initialize legacy drift — unit and PostgreSQL tests
RED→GREEN; full suite 273/273. Grok made no source changes or DB claims.
Final: minor (deferred): include schemaVersion/origin in the initialization
locator; clients currently must GET the draft and inspect its state before editing.
Final: minor (deferred): move the initialization kind check after its in-transaction
authorization check; admission already requires designer authority on the declared
matching client, but revocation in that window can disclose template kind.
Both remain explicit before-activation items; the feature flag remains disabled.

Next implementation slice, based on Grok's source review (not implemented yet):
- [ ] Add immutable subject/preheader revision metadata in an additive migration;
  keep it separate from canonical block-edit policy and preserve null vs empty.
- [ ] Add a strict template-metadata operation for structured draft heads only,
  with full requested values, expected revision and a distinct idempotency target.
- [ ] Copy canonical payload_text verbatim into the child revision; render and
  update metadata/HTML/projection marker atomically under owner/head locks.
- [ ] Record locked metadata on ordinary design saves and update the projection
  trigger in the same change; old PATCH must still be unable to bypass revisions.
- [ ] Recheck write/module authority after render and cover conflict, replay,
  rollback, legacy rejection and 300-character boundary cases in PostgreSQL.
- [ ] Wire staff metadata controls only after the service and route are verified.

Ruling: the current initialization response remains a locator, not proof that its
revision is suitable for editing; GET supplies the source state. Cost: an extra
read until the deferred response fields are implemented. Do not reuse the old
schema-0-overwrite warning as current evidence: both save and initialize now
reject drift. Stale legacy copy/recovery remains a separate unfinished operation.

### 1 November — user authorized completion, merge and deployment

Authorization now includes integration and release; no further general approval
is needed. User explicitly reiterated Kimi assistance. Scope remains the full
FigFlow EDM work, not a claim that disabled foundation code is the completed UI.
Reconciled current branch to origin/main ec0dcd39ebea98b45b9976bf297de96575841dd2;
feature-page dirty additions/deletions compare identically before and after.

- [x] Kimi closed both deferred initialization findings; 22 focused service/route
  tests and lint passed. Parent verified both result shapes in actual PostgreSQL.
- [x] Implemented revision metadata migration 492, atomic metadata saver and
  gated staff metadata route; no client design payload is accepted.
- [x] Verify payload-text preservation, CAS against block edits, replay after a
  later head, renderer/auth rollback, module revocation, legacy rejection and
  projection-trigger protection. 6 new actual PostgreSQL cases + 6 route cases.
- [x] Combined source verification: 18 files / 287 tests including 49 PostgreSQL
  cases pass on pinned Node 24.18.0; owned files linted.
- [x] Native hosted synthetic document save, reopen and 240×160 PNG export verified;
  see updated integration inventory. Old browser-unavailable/reopen blockers are
  superseded by this evidence.
- [x] pnpm deploy:check passes on pinned Node: agency-dashboard/main, CRM search
  dormant, source and fetched main both ec0dcd39e. This is a guard check, not a build
  or deployment. The default shell Node 24.22.1 correctly failed the version guard.
- [x] Grok independent metadata review: no blocker; fixed the low error-mapping
  finding. Four route regressions reproduced 503 before the fix and pass with
  400/403/413 afterward; all 10 metadata route cases and focused lint pass.
  Migration 492 and both revision writers must ship together while disabled.
- [x] Kimi source/build integration inventory completed; archived in
  `docs/email-builder/reviews/2026-11-01-kimi-source-release.md`. Native bridge
  patch is tracked R&D only, absent from hosted pins; clean reference source is
  90f8fab1, 99 commits behind main. Reconcile paths, never merge that stale branch.
- [ ] Kimi owns FigFlow-only pinned source-build preparation in the isolated
  release worktree, including the bridge test filter. No hosting/deploy authority
  delegated; snapshot/export/EDM actions remain unsupported in that prerequisite.
- [ ] Staff UI, native EDM bridge, module workflow and client acceptance remain
  open before enabling the feature. Test inbox/service details requested while
  independent implementation continues.
- [ ] Commit/review/merge candidate; apply approved schema to the actual target;
  run clean-source guarded deployment and verify live behavior plus QR navigation.

### 1 November — packaged Pages size blocker

Isolated candidate on ec0dcd39e completed Nuxt compilation and worker packaging,
but the build command failed its immutable size guard: raw 25,503,650 bytes
against 25,468,928 (34,722 over); gzip 7,349,357 against 9,750,000.
Log: `/private/tmp/figflow-release-build.log`. No deployment attempted.
The guard remains unchanged. An unmodified ec0dcd39e baseline is building in
`figflow-size-baseline-20261101`, sharing existing dependencies without install,
to isolate the source of the excess. Grok is reviewing only the emitted owned
FigFlow dependency footprint. This failure supersedes any implication that
`deploy:check` alone established build/release readiness.

Post-review isolated candidate verification: 18 files / 291 tests pass, including
49 PostgreSQL cases. The disposable PostgreSQL fixture was stopped afterward;
its files remain available for reproducible checks. No production DB was used.

Unmodified main baseline build completed successfully: raw 25,466,850 bytes,
only 2,078 bytes below the fixed budget; gzip 7,338,033 bytes. The candidate
adds 36,800 raw bytes and exceeds the guard by 34,722. Baseline log:
`/private/tmp/figflow-baseline-build.log`. Both builds used Node 24.18.0 and
the same dependency installation. Grok is assessing a scoped architecture
correction; weakening validation or increasing the budget is not an accepted fix.

Fresh fetch advanced origin/main to 2cfbdab98 (Banner video controls). The isolated
release branch fast-forwarded to that main without overlapping owned FigFlow
paths. The two measured build artifacts remain explicitly ec0dcd39e evidence;
a new final candidate build is required after the size correction. The original
dirty email-builder worktree was left intact, including its feature-page changes.

The measured candidate build preceded the small metadata error-mapping correction
and the native CI files. It is an earlier candidate snapshot, not a claim that
the current dirty release tree has been built. The later 291-test run includes
the error-mapping correction. Final release validation must use a clean commit.

### R01 standalone split — implementation checkpoint

Ruling: keep the draft URLs and existing Pages middleware, but move their full
implementation into a private Worker. A small sibling transport handler forwards
only the four supported route/method combinations through EMAIL_DESIGN. Nitro
ignores `**/api/email/design/drafts/**` in Pages; the standalone build explicitly
includes those original handlers. This reuses existing auth, fresh scoped access,
DB transactions and renderer services, rather than introducing a second owner.
Cost/remaining evidence: an additional private deployment and bindings, verified
runtime secret initialization, fresh Hyperdrive context and cleanup, environment
isolation, and a new measured Pages build are required before activation.

Parent implemented the H3 transport; 14 real-H3 cases pass, including exact
method/URL/body/session/Origin preservation, disabled/missing binding rejection,
unsupported-route refusal, transport-error redaction and no automatic retry.
A privacy regression reproduced upstream cache headers overriding no-store;
response streaming now enforces no-store and the four regression cases pass.
The transport runs after the existing Pages auth/RBAC/godMode middleware.

Kimi owns only workers/email-design-spike/ for an isolated Nitro build proof.
This is not adopted production infrastructure and must not be deployed as-is.
Grok is reviewing all ten native build inputs before their separate CI launch.

### Native CI started

The eleven-file native source-build prerequisite (ten reviewed inputs plus README)
is committed as e44b7ff9b on current main 75098e165 in the isolated
figflow-native-ci-20261101 worktree. Draft PR:
https://github.com/adme-dev/dashboard/pull/798 . Input validation passed remotely;
native tests are running in Actions run 41253566017. Rust/WASM success is not yet
claimed. Grok's complete read-only review found no blockers and is archived in
reviews/2026-11-01-grok-native-review.md. Pinned patch files retain intentional
blank diff-context spaces; non-patch whitespace checks and all patch hashes pass.

The first split Pages build on 2cfbdab98 reduced the raw overrun to 49 bytes
(25,468,977 /25,468,928). It includes the no-store correction but predates the
trusted environment header. Duplicate route regex, response-header copying and
error strings were refactored without removing checks; 22 focused transport and
legacy-conflict tests pass. A new frozen-source build is running. Native CI does
not include these uncommitted backend/Pages changes.


### Current-base verification and private runtime admission

The frozen transport candidate on 2cfbdab98 passed `pnpm build`: raw
25,468,856 / 25,468,928 bytes (72 remaining); gzip 7,339,133 / 9,750,000.
Log: `/private/tmp/figflow-proxy-final-build.log`. This is extremely narrow
headroom, not a general capacity solution. The release worktree then
fast-forwarded to fetched main 75098e165 with all owned changes preserved.
A new build against that base is running; the earlier artifact cannot be released
as current-main evidence.

The standalone Nitro spike bundles only the four draft handlers (458,839 raw /
133,454 gzip bytes). Kimi's report is archived as
`reviews/2026-11-01-kimi-worker-spike.md`. A bounded local Miniflare probe of the
actual artifact, compatibility date 2026-07-08 with nodejs_compat and synthetic
bindings, started successfully and returned 401 for an unauthenticated draft
GET. The runtime was disposed. This proves startup and the no-token boundary
only; it does not prove database, renderer or configured-secret behavior.
Nitro internal/app.mjs already promotes platform bindings into event context.

Kimi now owns an outer fetch admission experiment inside the spike directory:
environment matching, secret configuration, and bounded bodies before Nitro's
adapter buffers requests. Runtime tests must use synthetic bindings and verify
configured-key versus wrong-key tokens. Grok independently reviews the Pages
transport. No production configuration, migration, deployment or feature-flag
activation has occurred. PR #798 remains a separate native build prerequisite.


Current-base focused checks pass: 256 unit tests in 18 files plus 49 disposable
PostgreSQL tests (305 total). Logs: `/private/tmp/figflow-current-unit-tests.log`
and `/private/tmp/figflow-current-pg-tests.log`.

Three additional actual-Worker/PostgreSQL tests now pass in
`test/integration/emailDesignWorker.database.test.ts`: legacy initialization
commits once, replay returns the same immutable head and GET reopens it;
configured-key authentication succeeds while wrong-key, deactivated and
revoked sessions fail; all request/transaction connections close after replies.
This uses only synthetic rows and local Hyperdrive emulation, with outbound HTTP
blocked. The frozen pre-admission artifact SHA-256 is
`e18f68a3ae628ac051de3656877210b8518839d5fa3eeb03fa7ca6f9bf2ca508`.
The generated admission wrapper still requires its own run of these tests.
This does not establish hosted Hyperdrive behavior or renderer RPC acceptance.
Log: `/private/tmp/figflow-worker-pg-tests.log`.


The actual runtime suite now has four passing tests, including a second real
Worker running the canonical email renderer through its named RPC entrypoint.
All four draft routes are exercised: initialize, read, canonical save and
metadata save. Canonical save commits matching HTML/provenance, exact replay
returns the same receipt, stale save fails 409, and metadata edits preserve
source bytes while advancing subject/preview/projection atomically. The fixture
blocks outbound HTTP; no provider or production resource was used. Focused lint
passes. This strengthens local transport evidence without claiming email-client
visual compatibility or hosted production acceptance.


Fresh-base build result: main 75098e165 with the same Pages transport fails the
immutable raw-size guard at 25,469,298 / 25,468,928 bytes (370 over); gzip is
7,339,434 bytes. New main added 442 raw bytes relative to the prior measured
candidate. Log: `/private/tmp/figflow-current-main-build.log`. No deployment was
attempted and no limit was changed. A durable, scoped additional reduction is
under review; transport authorization and environment checks must stay intact.

Native test job in run 41253566017 passed in 10m38s. Downloaded receipt identifies
GitHub PR merge-test commit 07dd10ad7b6bda4f4afc2e2b9de96e984fa21187, exit 0,
and unchanged Cargo.lock SHA-256
539397203fa01e0f460ab2fad69b32003b838828751a7373e833d23b56e35b94.
All seven named browser_bridge tests pass. The browser-package job and general
CI are still running; neither WASM package success nor merge is claimed.
Evidence is retained under the native CI worktree at
`.verification/figflow-native-tests-41253566017/`.


### Admission, native package and six-route size correction

Kimi's outer admission experiment passes all nine bounded Miniflare scenarios;
report: `reviews/2026-11-01-kimi-worker-admission.md`. Parent reran all four real
Worker/renderer/PostgreSQL cases against that outer artifact, SHA-256
497c3d8d0053285aedd98ead1634335564399a33ae54418e2d10a2a896c36ec8:
all pass. The runtime tests now also compare persisted design to the submitted
object, assert zero outbound HTTP, and cover actual NOW() session revocation
with rejection of an older token and acceptance of a freshly issued token.
These changes respond to the limits recorded in Grok's runtime review.

Native browser packaging passed run 41253566017 in 7m16s. Archive
figcraft-web-0.11.2.zip is 9,078,173 bytes, independently verified SHA-256
928f96826efa147d73accd65b128cb8e9f68c1b4637b33bce8639ced5fe1c792;
all 32 entries pass ZIP CRC checks. It contains a 23,317,174-byte WASM and the
matching JS/HTML. Source and unchanged lock receipt match the native test job.
Native tests total 39, including the seven bridge tests. PR #798 is now ready
for review; general CI remains pending. The archive is not deployed and has
not been accepted in a browser.

Grok's transport review found no blocker. His size review recommends moving
only the existing template PATCH/DELETE handlers to the private email service,
keeping existing Pages middleware and all canonical auth/scope/conflict checks.
Parent moved those implementations unchanged into templateUpdateHandler.ts and
templateDeleteHandler.ts; their existing URL files and the draft catch-all use
a shared designTransport.ts. Existing template CRUD is not gated by the new
draft flag; missing binding still fails closed. Four new proxy cases failed
with 404 before implementation and now pass. Combined proxy/legacy/client-scope
checks pass 51 tests; the delegation suite passes 71, including explicit denial
of template PATCH/DELETE in the current exact delegation allowlist. No actor
header or parallel delegation mechanism was introduced.

Kimi owns the explicit six-route Worker configuration/admission follow-up.
Parent is building Pages and extending actual-runtime coverage to flag-off
legacy edits/deletes, read-only denial and all three version-history conflicts.
This rollout now requires the private service and binding for existing template
writes, so they must be validated and deployed before the Pages switch. The
new draft-save flag remains disabled. No build-size pass or rollout success is
claimed until measured.


### Final local release checkpoint — 1 November 2026

The six-route service is adopted under `workers/email-design/`. Its closed
staging/production configurations and exact-target deployment guard are reviewed
in `reviews/2026-11-01-grok-deployment-review.md`. Sixteen guard tests pass;
production Worker dry-run succeeds without deployment. The draft flag remains
false. Existing template writes require the service after Pages cutover.

On incorporated main `ee3608c007678d2a3f48a7702682b7ba207f2385`, the final
focused run passes **430 tests across 24 files**, including five actual
Worker/renderer/PostgreSQL cases and 49 revision database cases. Twelve separate
admission scenarios also pass. The disposable PostgreSQL cluster is stopped.
Logs: `/private/tmp/figflow-final-focused-tests.log` and
`/private/tmp/figflow-worker-deploy-dry-run.log`.

Pages builds at **25,467,672 raw bytes**, leaving **1,256 bytes** under the
unchanged 25,468,928-byte budget; gzip is 7,338,569 bytes. Final deployment check
passes for agency-dashboard/main at the above source/main revision. Logs:
`/private/tmp/figflow-final-current-pages-build.log` and
`/private/tmp/figflow-final-deploy-check.log`. These are candidate local results;
a clean integrated release must be rebuilt and checked against fresh main.

Native PR #798 was updated to current main at head
`146ac9b54976bb026043c4e42670b3c8129dc290`. Run 41256272649 has passed source
validation and native tests; browser packaging remains pending at this
checkpoint. General CI run 41256272781 remains pending. Earlier general CI was
cancelled after the update, not passed. Previous successful native package
receipt above remains historical evidence, not deployment acceptance.

Production cutover is blocked on provisioning the existing matching Pages
JWT_SECRET from an approved source. Cloudflare metadata confirms the secret
name only; inspected local environment files do not contain it. A source
location/configuration question is pending with the owner. No signing key was
rotated, no production schema migration was applied, and no service or Pages
release was deployed. Migrations 491 and 492 must be applied together, then the
private service and authentication/template CRUD verified before Pages cutover.
Staff editing UI, native EDM bridge, reusable-module publishing and actual
Apple Mail/Outlook/Gmail acceptance remain open; this checkpoint completes only
local foundation verification, not the FigFlow EDM product milestone.


Kimi completed an end-to-end 86-file pre-commit source audit with a SHA-256
manifest: `reviews/2026-11-01-kimi-final-review.md`. No code blocker was found.
Its build-pending statement records the earlier review snapshot; the completed
current-main build result above supersedes that one operational item. The
matching key, paired migrations and hosted verification remain outstanding.
After that source snapshot, only this ledger and the service README changed:
the README now distinguishes draft receipt reconciliation from legacy CRUD
state rereads after an uncertain response. Review archives are preserved as
written, rather than rewritten to imply later evidence was reviewer-observed.
