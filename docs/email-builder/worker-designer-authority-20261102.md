# Designer authoring authority worker report — 2 November 2026

Task `task_51a53ece7067`, dispatch `ctx_fdfba957f1a6`.
Base source: `c4798624548704fec493418b53952ad52ddfc3eb`.
Worktree: `figflow-designer-authority-20261102`.

## Delivered boundary

`POST /api/email/design/designer` is separate from the unchanged staff
content-return validator. It requires both `FIGFLOW_EDM_DRAFT_SAVES_ENABLED=true`
and independent `FIGFLOW_EDM_DESIGNER_ENABLED=true`, the existing validated
session, JSON/origin checks and fresh server-side scope/role authority.

It reuses existing `email_design_handoffs`, immutable revisions, receipt tables,
canonical writer, scope resolver and private renderer. No second design store,
module library, campaign pipeline, publishing service or sending path exists.
No migration was necessary. Designer mode is recorded in the immutable original
open request receipt (`authoringMode: 'designer'`); subsequent reads/transitions
verify that persisted mode. A client cannot switch an old content handoff to
designer mode or submit role, policy, artifact or canonical-design authority.
Old content receipts without a designer marker remain content-only.

Existing generic draft PATCH now always uses `saveStaffTemplateDesignDraft` for
structured revisions, including creative actors. The coordinator explicitly
approved closing its previous unrestricted structural/policy write bypass.
Designer-only first legacy conversion accepts only the exact server-derived
`composerToDesignDraft` snapshot, including policy/lineage. The existing staff
comparison function and content-only native return guard were not modified.

## Shared interface

`shared/emailRendering/designDesigner.ts` exports `DesignerOperation`,
`DesignerProposalAction`, `DesignerRoundtripRequest`, `DesignerCapabilities`,
`DesignerHandoffResponse`, `DesignerAuthoringDiscovery`,
`parseDesignerRoundtripRequest`, `applyDesignerOperations`, `designerBlockId`
and the writer's independent operation-result assertion.

The endpoint uses existing `start`, `open`, `resume`, `lookup`, `apply` and
`cancel` command shapes. `propose` is deliberately different:

```ts
{
  command: 'propose',
  handoffId,
  action: {
    version: 1,
    action: 'propose-designer-return',
    operationId,
    scope: { clientId },
    draftId,
    baseRevisionId,
    operations: DesignerOperation[]
  }
}
```

Operations, discriminated by `op`:

- `set-style`: `blockId`, typed `style`, optional `mobile`.
- `set-props`: `blockId`, block-type-specific `props`; mobile props are rejected.
- `add-section`: `sectionType`, `parentId`, optional `columnIndex`, `index`.
- `move-section`: `blockId`, `parentId`, optional `columnIndex`, `index`.
- `duplicate-section`: `blockId`, `parentId`, optional `columnIndex`, `index`.
- `remove-section`: `blockId`.

`sectionType` is Heading, Text, Button, Image, Spacer, Divider, Container or
ColumnsContainer. Columns parents require an explicit `columnIndex` (0–2).
Index is measured after detaching the source for a move within the same list.
A duplicate remaps the complete depth-first subtree. IDs and lineage are minted
by the server deterministically from proposal identity: `designerBlockId` yields
`designer-${operationId}-${operationIndex}-${childIndex}`. Clients cannot supply
add IDs or duplicate ID maps; later operations may refer to the deterministic
identity. Each intermediate graph is validated, not merely the final result.

Root props include `contentWidth` (320–960), `fontFamily`, `backdropColor`,
`canvasColor`, `textColor`, `borderColor`, `borderRadius`. Root styles must use
those semantic props. Button props include `text`, `url`,
`buttonBackgroundColor`, `buttonTextColor`, `buttonStyle`, `size`, `fullWidth`.
Column props include `columnsCount` (1–3), `columnsGap`, `contentAlignment`;
shrinking occupied columns is rejected. Image props include `url`, `alt`,
`linkHref`, `width`, `contentAlignment`. Divider uses canonical `lineThickness`.
Styles allow bounded colours, font keys/sizes/weights, alignment, padding,
line-height, letter spacing and borders; arbitrary CSS/URLs/effects are refused.

Designer handoff responses include `{ handoff, capabilities, preview }`.
`preview.html` comes from the existing canonical renderer and
`preview.source` is `canonical-renderer`. Proposals remain unapplied until the
existing explicit Apply action. Apply rechecks creative authority and the exact
CAS head, then independently replays the stored operations against the locked
persisted source inside `saveDesignerTemplateDesignDraft`. Source, renderer
projection, head, operation receipt and handoff transition share the existing
transaction. An unknown response reconciles with the same request/operation ID.

Existing trusted `/roundtrip` lookup now adds:

```ts
designerAuthoring: {
  available: boolean,
  endpoint: '/api/email/design/designer',
  capabilities: DesignerCapabilities | null
}
```

Availability requires the independent flag, an existing structured draft with no
native artifact reference, and fresh creative write access. Missing/false flag,
legacy/null draft, ordinary staff or denied write access return unavailable.
UI must not offer authoring when `available` is false. Legacy documents first
need the existing explicit initialization/conversion flow.

## Protected state and scope

Optional persisted `policy.designerLocks = { blockIds, styleFields }` only
restricts authority. Client proposals cannot assign or relax it. New section
content grants and duplicate lineage are generated by the server. Existing
policy, block/node/field identity, unknown fields, scope, source provenance,
assets and dependency pins are retained. Removing/replacing a parent cannot
circumvent descendant brand locks; desktop locks also cover mobile overrides,
and nested padding replacement cannot bypass a locked edge.

Unsupported/HTML/footer blocks, explicit locks, required legal markers, existing
content fields without grants and linked immutable module subtrees remain
protected against destructive structure/style edits. Rich HTML/entity text is
preserved and requires a later explicit conversion. Literal ampersands in
permitted plain text are accepted and escaped by canonical rendering; this is
not rich-text editing and does not override an absent persisted content grant.

New image URLs/asset manifests are not accepted: only a safe image URL already
in the same persisted canonical source can be reused. New scoped media
ownership resolution/upload is a subsequent F04 task. Native source input is
rejected; no private artifact staging/verification contract exists here.
`capabilities.nativeSource` reports `state: 'canonical-only'`, `artifact: null`,
`reason: 'PRIVATE_NATIVE_STAGING_UNAVAILABLE'`. Accepted operations are entirely
canonical and reconstructible; this does not constitute native artifact
publication, full image-library authoring or reusable module publication.

Actual role mapping remains `assertFreshDesignAccess`: an active session/member,
non-read-only role, authorised agency ADMIN/MANAGEMENT scope or assigned client /
active-client MARKETING_MANAGEMENT access, plus CREATIVE for designer authority.
Broad email write does not grant library publication. Module revision scope and
fresh read access are rechecked by the existing canonical dependency resolver.

## Verification and remaining work

Focused Node 24 tests: **104 passed across 8 files**. Scoped ESLint and
whitespace checks pass. Logs are `/private/tmp/figflow-designer-tests.log`,
`/private/tmp/figflow-designer-lint.log` and
`/private/tmp/figflow-designer-types.log`. Tests
cover typed operations, graph/lineage preservation, no-op compatibility, policy
escalation, legal/footer deletion, brand locks, locked dependency subtrees,
foreign images, unknown native references, actor/client/mode binding, stale
CAS, role revocation, explicit first conversion, independent flag/discovery,
real renderer preview and lost post-commit response reconciliation.

Persistence tests exercise the actual handoff engine, revision writer and
private renderer with a deterministic local transactional database adapter.
They are not proof of PostgreSQL query execution, lock ordering or concurrency.
Parent must run the real disposable PostgreSQL/runtime suite and independent
source review after integration. No remote database query or migration ran.

The worktree initially lacked `.nuxt` configuration; the first Vitest attempt
ran no tests. Only small ignored generated config files were copied from the
parent checkout, and its shared node_modules was linked without modifying
dependency files (no installs; Vitest cache disabled). An ad hoc scoped tsc
traverses imported legacy server code and reports 26 diagnostics outside this
worker's changed files (missing Nuxt auto-import globals, existing db.ts types,
and designActions schema typing); no changed-file diagnostics remain. This is
not a globally clean project typecheck. No broad Nuxt/Rust build ran.

Parent owns private Worker route registration, Pages transport admission,
independent disabled variables/deployment guard and renderer contentWidth
alignment; parent confirmed those integration edits during this task. Parent
also owns all UI/native integration, compiled responsive preview/review/Apply
and one-action Undo, new package/source pins, production/CI/browser acceptance,
public feature copy, real-email-client compatibility, ledgers and deployment.
The existing content-only editor URL is not proof the native package supports
this new operation interface. No hosted/native acceptance, library publication
or customer send is claimed. Preserve this checkout for the coordinator's next
scoped library/asset dispatch; no cleanup was performed.

Focused test command:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
node node_modules/vitest/vitest.mjs run --cache=false --maxWorkers=1 \
  test/unit/emailDesignDesigner.test.ts \
  test/unit/emailDesignDesignerPersistence.test.ts \
  test/unit/emailDesignDesignerRoute.test.ts \
  test/unit/emailDesignDraftRoute.test.ts \
  test/unit/emailDesignRoundtripRoute.test.ts \
  test/unit/emailDesignStaffEdit.test.ts \
  test/unit/emailDesignComposer.test.ts \
  test/unit/emailDesignContract.test.ts
```
