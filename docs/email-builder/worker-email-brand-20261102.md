# Email brand defaults and design locks — 2 November 2026

Task `task_29112103ee2a`, dispatch `ctx_f7d84d97caa6`.
Preserved worktree `figflow-designer-authority-20261102` on
`adme-dev/figflow-designer-authority-20261102`, starting at module/asset commit
`ca0932a2e`. No other contributor's files or parent-owned runtime/native/renderer
configuration were edited. Coordinator approved the shared root allowlist and
safe snapshot behavior in the orchestration question reply.

## Delivered behavior

The existing builder has an explicit **Brand and locks** panel for structured
template drafts. Opening it is read-only and refuses unsaved local content;
it never selects/appends a brand revision on open. It lists only the draft
client's kits and shared kits after fresh creative/scope checks. The existing
`is_default` rule determines the suggested client kit before the shared default;
the user must press **Apply brand to new blocks** to change anything.

The implementation reuses actual `brand_kits` and `brand_kit_versions` from
the banner brand owner, not a new brand store. Existing kit versions are taken
before content edits, so they are not a pointer to the current row. The choices
response contains a digest of the actual current kit content; explicit apply
locks the current kit row, verifies that digest, and reuses or appends that exact
snapshot in `brand_kit_versions`. A concurrent content change requires refreshed
selection. No kit content/default status is updated by the email action.

The canonical immutable email revision records:

```ts
source.brand?: {
  kitId: string
  versionId: string
  version: number
  name: string
  defaults: {
    primaryColor: string // six-digit hex
    fontFamily: string   // existing FONT_FAMILY_MAP key
    contentWidth: number
    fontFallback: boolean
    requestedFont: string | null
  }
}
```

The full chosen content is in the existing kit snapshot; email defaults and the
exact version identity are copied into the immutable email revision. Later kit
updates do not change existing drafts, linked module instances, templates or
scheduled/sent campaigns. Historical email metadata survives independently of
the mutable kit owner's lifecycle. This change adds no SQL immutability trigger
to the pre-existing brand-version table; canonical email revisions/receipts keep
their existing database-enforced immutability.

`shared/emailRendering/designBrandDefaults.ts` is the single email mapping and
new-block defaults helper. Audited brand font fields are `role`, `family`,
`weights`, `defaultWeight`, and optional uploaded `assets`. The existing email
renderer supports font-stack keys, not those uploaded assets. Recognized font
names map to a supported stack; unsupported fonts explicitly use `MODERN_SANS`.
No font URL, private object key, font binary, fetch or embedding enters the email
source/defaults. The UI explains the fallback and that recipient rendering varies.
Brand kits have no email-width field: **600px is the platform default**, not a
claimed kit setting.

Existing authored roots retain rendered font, width and colours. Applying a kit
adds only authoring-only `root.data.props.primaryColor` and `source.brand`.
An empty root can receive supported font/width defaults through the same shared
action; no per-editor automatic client-brand initialization was introduced.
The root `primaryColor` designer allowlist accepts six-digit hex and has no
direct renderer output. Designer `add-section` and composer fresh block creation
materialize the common helper's defaults: Heading colour, Button background,
Divider colour, and supported font on new Heading/Text/Button blocks. Existing
blocks, copies, presets, imported sections and linked instances retain authored
styles. Pinned brand font defaults apply to new blocks while existing rendered
root font is preserved; authoring primaryColor can subsequently be changed by
the existing typed designer operation where permitted by locks.

## Authority, locks and atomic persistence

Routes:

- `GET /api/email/design/drafts/:id/brand` — read-only options and policy-manager discovery.
- `POST /api/email/design/drafts/:id/brand` — strict `apply-brand` action.
- `POST /api/email/design/drafts/:id/locks` — strict `set-design-lock` action.

All use independent `FIGFLOW_EDM_BRAND_ENABLED=true`, in addition to explicit
draft-save and designer gates. Library or designer-return flags alone cannot
enable the new routes. Sessions, JSON/origin checks and fresh role/scope checks
are server-owned. Client JSON cannot choose actor, scope authority, canonical
design, assets, native artifacts or role/editable-field policy.

Common action identity is `{version:1, operationId, draftId,
expectedRevisionId}`. `apply-brand` adds `{command:'apply-brand', kitId,
kitDigest}`. The lock action adds `{command:'set-design-lock', lock}` with
either `{blockId,target:'block',locked}` or
`{blockId,target:'style',field,locked}`. Style `field` is a server-listed relative
path such as `data.style.color` or `data.props.fontFamily`, never a canonical
policy supplied by the browser.

Lock mutations independently require fresh agency **ADMIN or MANAGEMENT plus
CREATIVE**, through existing `assertFreshDesignPublisher`. Ordinary scoped
CREATIVE and ordinary staff cannot assign or relax policy. Choices expose lock
controls only to the agency policy manager. Target IDs and permitted style
fields are derived from the exact persisted expected revision; content/unknown
policy paths are refused. Locks reuse existing
`policy.designerLocks={blockIds,styleFields}`. Existing `editableFields` grants
are preserved exactly, so staff text/link editing keeps its existing authority.
Staff canonical PATCH remains content-only; designer return is still separate.

Block locks protect descendants. Style locks cover desktop/mobile and inherited
semantic font/colour properties, including ancestor edits that could indirectly
change a locked descendant field. Structural escape, destructive replacement,
module/image insertion into locked ancestry, and updating a locked module
instance are refused. Insertion is conservatively unavailable under any
explicit ancestor style lock. Explicit existing module detach still preserves
the exact block content, lineage, grants and locks. Removing an explicit lock
does not grant legal/unknown/linked-content authority or edit role policy.

The service locks the existing template owner/document and kit, reads the
**named immutable expected revision**, and reuses the canonical revision writer,
renderer projection, fresh authorization/dependency checks and immutable receipt
table in one no-retry transaction. No new schema/migration was needed; reserve
497 remains unused. The writer's optional trusted action digest is passed only
by server code and cannot appear in strict HTTP action JSON. It domain-separates
the action/target/payload from generic staff/draft receipts. No receipt is updated.
Replay checks current authorization and selected kit scope, then returns its
original receipt even after newer document heads or kit contents exist. New
unsettled writes must still pass expected-head and selected-kit-digest checks.

The UI retains original request identity/payload through unknown response or
readback outcomes, including a later permission-denied reconciliation. It
refuses another brand/lock action and blocks generic save while pending. Exact
revision readback and a local-block comparison prevent adopting a newer head or
overwriting intervening local edits. The existing FigFlow workspace leave guard
includes brand busy/pending state. Request retention is in the current editor
session, matching existing composer flow ownership; reload is not a durable
client-side receipt queue.

## Legacy publication authority follow-up

At coordinator request, existing `/api/agency/email/modules` create and its
metadata PATCH/DELETE routes now call fresh agency publisher authority using
the authenticated token/actor and resolved/stored scope. The old broad
`requireWriteAccess` check remains as an additional guard and no longer grants
publication by itself. Legacy IDs, reads, fragment compatibility and agency
publisher rename/delete behavior are preserved; canonical versioned rows still
require immutable revision actions. No legacy data migration ran or is required.
Parent's new UI should continue to publish canonical modules through the
canonical module service, not the mutable compatibility format.

## Verification and parent acceptance

Node executable: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node`.
Focused suite: **423 tests across 37 files pass**. Changed-source ESLint,
whitespace checks, and both changed Vue SFC script/template compilations pass.
Logs: `/private/tmp/email-brand-tests-20261102.log`,
`/private/tmp/email-brand-lint-20261102.log`,
`/private/tmp/email-brand-types-20261102.log`.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
node node_modules/vitest/vitest.mjs run --cache=false --maxWorkers=1 \
  test/unit/emailDesign*.test.ts \
  test/app/edmDesignBrand.test.ts test/app/edmBuilderStore.test.ts \
  test/app/edmDesignRoundtrip.test.ts test/utils/useEdmBuilderPresets.test.ts \
  test/server/edmCustomModules.test.ts
```

Coverage includes exact chosen snapshots, safe font fallback, unchanged authored
design, shared new-block defaults, staff metadata/policy protection, inherited
desktop/mobile/semantic locks, structural/module escape, stale head/kit/scope,
role revocation after render with rollback, lost commit/readback reconciliation,
cross-endpoint receipt identity collisions, independently disabled flags,
read-only options, and legacy publisher denials. Persistence fixtures exercise
the real canonical writer/private test renderer against a deterministic local
transaction adapter. They do not prove PostgreSQL SQL/lock/concurrency behavior.
The ad hoc scoped tsc follows imported legacy code and reports pre-existing
auth auto-import, db, storage and designActions diagnostics; there are no
changed-file diagnostics. This is not a clean full Nuxt typecheck.

Parent still owns:

- Private runtime route admission/config, independent disabled brand flag and transport tests.
- Native/Rust defaults and policy UI consuming the shared snapshot/default contract, package pins and real native acceptance.
- M02 condition merge: preserve `source.brand` and combine `brandFlow` busy/pending/save/leave/reconciliation guards with condition guards. Condition worker confirmed policy.designerLocks ancestry/subtree handling in its separate preserved checkout.
- Disposable PostgreSQL tests, independent source review, browser visual/permission/concurrency acceptance and recipient-client compatibility.
- Current-main reconciliation, CI/deployment, real database operations and final public marketing/page sync.

Before this worker commit the preserved branch was 2 ahead/1 behind local
`origin/main` (`c1dd2d27f`, MotorStack offer artwork). It is deliberately not a
release-ready current-main claim. Fetch/reconcile onto fresh main before merging
or release. No install/cache mutation, full Nuxt/Rust build, remote database
read/write, migration, deployment, provider action or email send was performed.
