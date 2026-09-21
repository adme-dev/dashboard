# Generated collection administration — implementation handoff

Date: 2026-09-21
Worktree: `/private/tmp/dashboard-cms-authority-20260920`
Status: locally implemented, reviewed and browser-verified. Whole-candidate
results are recorded in `2026-09-21-builder-completion.md`. No production
migrations, remote setup, deployments or dependency installations.

## User-visible behavior

The existing agency and portal Business Content workspace now includes a separate
Custom collections section. Existing business-content state, draft editing and
page selection are retained. This remains administration rather than a second
visual website editor.

On eligible, explicitly upgraded sites, the section lists versioned collection
definitions and generates labeled Nuxt UI forms for text, safe integers, boolean,
date, UTC instant, canonical decimal and choice values. It supports:

- collection/schema authoring by current schema managers;
- paginated definitions and records, optional archived-record listing;
- optimistic entry saves with visible saved revision and field validation;
- archive as a new record revision;
- reading an exact historical revision and restoring its values into a draft,
  with the subsequent save appending a new revision;
- read-only staff/portal viewers;
- retained drafts per site/collection/record, conflict recovery and navigation
  confirmation, including browser-close protection;
- keeping edits made while a save is pending;
- adopting compatible newer schemas without replacing unsaved field values.

The new section is keyed by audience/site within BusinessContentWorkspace.
Draft keys also include the site endpoint. Record and history responses are fenced
against changed selection/site, and schema-save completion is fenced by request
epoch. Initial record loading is explicit onMounted as well as selection changes.

Unupgraded or unconfigured sites show setup pending; existing content remains
available. Eligible managers can explicitly request setup. The UI reuses the
retained request ID returned by status, falling back to a per-audience/site local
request ID so an interrupted request is retried with the same identity. Missing
reviewed runtime policy remains pending, never an implicit rollout.

## HTTP and native authority

Both audiences expose:

- `GET /api/{agency|portal}/page-studio/sites/:siteId/collections`
- `GET|PUT .../collections/:collectionId`
- `GET .../collections/:collectionId/records`
- `GET|PUT .../collections/:collectionId/records/:recordId`
- `GET|POST .../collections/setup`

History reads use `?version=` for definitions or `?revision=` for records. Lists
use bounded `limit`/`after`; records may request `includeArchived=true`.

Bodies never supply actor, scope or digest. Schema writes accept a scope-free
`definition` plus `expectedVersion`. Record writes accept `values`, `archived`,
`schemaVersion` and `expectedRevision`. Server derives complete scope and actor
from original native login and current database state, computes schema SHA-256,
and validates record values using the approved exact schema. The existing
observed-stream-byte JSON reader bounds all writes at 512,000 bytes, including
chunked bodies. Responses are private/no-store.

Authorization reuses current native CMS admission and adds explicit
`plan_metadata.builder.collectionSchemas === true`, allowed business-content
module policy, current site capacity and portal creation policy. Collection-only
policy columns and capacity queries are selected only when `collectionAccess`
is requested internally; normal existing CMS operations retain their query path.

Portal schema writes/setup require current admin/manager role plus editor site
membership. Agency schema writes require current PAGE_STUDIO_EDIT authority.
Portal editor membership permits record writes, and viewer membership permits
reads. Original login expiry/revocation, owner session invalidation, client/site
state, tenant/client identity and package admission remain enforced. Admission is
rechecked after schema lookup/hashing and immediately before RPC, then again
before exposing a completed result.

All returned schemas and records are parsed, digest verified and scope/identity
checked. List order/cursors, archive filters and write revision/result identity
are checked. Conflict messages preserve local drafts; missing upgrade/schema,
inactive route and absent tables map to explicit 503 setup pending. Provider
errors are hidden behind bounded generic errors.

## Explicit setup

GET reads retained native audit intent and coordinator status; it never prepares
an intent or executes DDL. A retained operation belonging to a different original
login returns reconciliation with configuration disabled.

POST calls `preparePageStudioCollectionUpgrade` with authenticated actor/event,
server environment, site and strict `{requestId}` body, then calls
`executeCollectionUpgrade(prepared.intent)` on the private provisioner binding.
Installed receipts must exactly match the prepared database/scope/catalogue
identity. Current retained native authority is rechecked before returning success.
Execution remains subject to the parent's private runtime policy and physical
schema verification. No cron/email behavior was enabled.

## Wire compatibility

Shared Dashboard mirrors:

- `shared/pageStudio/collectionDefinition.ts`
- `shared/pageStudio/collectionApi.ts`
- `shared/pageStudio/collectionScope.ts`

The golden fixture `test/fixtures/collection-contract-golden.json` was generated
from the built `@xeroflow/protocol` exports in the sibling Studio worktree,
covering all seven field kinds, exact schema/record digests, invalid dates,
noncanonical decimals, missing instant precision, unknown enum options,
non-integer numbers and unapproved fields. Dashboard tests consume that fixed
fixture rather than importing the sibling repository at runtime.

## Verification performed

Using Node 24.18.0 and existing local dependencies:

```
node node_modules/vitest/vitest.mjs run \
  test/server/utils/pageStudioCollections.test.ts \
  test/composables/usePageStudioCollectionDraft.test.ts \
  test/shared/pageStudioCollectionContract.test.ts \
  test/server/api/pageStudioCollectionEndpoints.test.ts \
  test/server/api/pageStudioCollectionSetup.test.ts \
  test/server/utils/pageStudioBusinessContent.test.ts \
  test/server/api/pageStudioBusinessContentEndpoints.test.ts \
  test/server/utils/pageStudioCollectionUpgrade.test.ts
```

**8 files, 91 tests passed.** Includes changed/native-role/package denial before
RPC, revocation during remote work, strict body authority rejection, original
login HTTP binding, observed body limits, explicit setup-only mutation, retry
identity, retained-login reconciliation, response tampering, archive revision
checks and client draft recovery.

Targeted ESLint passes for new runtime, shared and Vue code plus touched native
CMS utility files. `git diff --check` passes.

The isolated Vue typecheck passes using actual installed Nuxt UI component types
and the actual Vue/Nuxt auto-import definitions. Scratch config:
`/private/tmp/dashboard-generated-typecheck.json`; result log:
`/private/tmp/dashboard-generated-typecheck.log`.

A server-scoped typecheck traverses existing generated Nitro imports and reports
existing errors in unrelated application files. There are no errors for the
collection files or touched businessContent utilities in the final server log:
`/private/tmp/dashboard-generated-server-typecheck.log`. This is not a claim that
repository-wide typechecking passes. Parent owns the full candidate checks.

Initial pnpm invocations attempted package-manager metadata downloads in this
worktree; tests instead used the already installed local Vitest executable. No
new dependencies were fetched.

## Design and marketing

Applied the required frontend-design skill from the installed alternate path
`/Users/paulgiurin/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`.
The subject is internal website content administration: existing dashboard
semantic colors/type, left-aligned collection navigation, explicit revisions and
container-responsive field grids. All form controls use Nuxt UI, every field has
UFormField labeling, and date selection uses UPopover/UCalendar. No arbitrary
JavaScript or schema-provided HTML is executed/rendered.

Page Studio feature index and detailed marketing entry now describe generated
forms, archive and restore only where custom collection setup is enabled. Page
Studio already exists in the relevant navigation category; no new mega-menu
category or feature count was introduced.

## Integration verification

The repeatable `node scripts/verify-generated-collections-browser.mjs` runner
uses actual production Vue/Nuxt UI components with an explicit synthetic
transport. All three browser scenarios pass: save/reopen, append-only history
restore, two-collection isolation, retained edits/conflicts, archive, keyboard,
390-pixel layout, recovery of multiple unsaved entries, and actual schema
authoring with optional fields and compatible version updates. It creates and
removes its own temporary fixture and reuses installed dependencies. This is
component/browser evidence, not a claim of live authenticated end-to-end release.

Browser review corrected inaccessible inactive drafts and duplicate label/input
IDs on optional fields. Server review corrected strict installed-receipt
projection; valid setup succeeds and substituted receipts fail in both GET/POST
regressions. Real native PostgreSQL tests cover current role/package/login
authority and revocation during RPC; private workerd tests cover the other side
of the interface. Golden fixtures bind the cross-repository protocol.

Deliberate runtime/schema configuration and production activation remain release
steps. The exact runtime policy is not approved by local source implementation.

## Files changed

New UI/composable: CollectionSchemaEditor.vue, GeneratedCollectionFields.vue,
GeneratedCollectionsWorkspace.client.vue, usePageStudioCollectionDraft.ts.

New server boundary: collections.ts, collectionsHttp.ts, collectionSetupHttp.ts,
and 16 agency/portal collection and setup route files. Existing businessContent
exports its native request/dependency/row types and optional policy projection;
businessContentHttp exports the existing bounded JSON body reader.

New tests: collection native adapter, collection HTTP routes, explicit setup,
record draft recovery and golden protocol fixtures. Existing tests retained.

Modified UI integration: BusinessContentWorkspace.client.vue (one child insertion)
and the two Page Studio marketing descriptions.
