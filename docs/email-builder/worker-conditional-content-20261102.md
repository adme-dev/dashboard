# M02 typed conditional content — 2 November 2026

## Scope and source

Implemented in the preserved `adme-dev/figflow-email-preflight-20261102` checkout after merge-authoring commit `502d64166`. This worker owns shared condition contracts, canonical admission, narrow private renderer hooks, scoped catalog APIs, designer-only condition mutation, Nuxt UI editor/badges and focused tests. No provider sends, remote database access, package installation, full Nuxt/Rust builds, runtime routing, source pins, CI, deployment or public marketing edits occurred. The coordinator owns those integration/release steps and migration execution.

The renderer remains the existing private Worker; no server HTML renderer was added. Ordinary staff source-save and the frozen six-operation native designer vocabulary were not broadened. The parent has a newer generic draft PATCH staff-only correction; preserve it when merging this worker's older base. No `designDesigner.ts`, native bridge or `campaignSend.ts` changes are included.

## Canonical condition and catalog

An eligible block stores `data.props.visibilityCondition` as a complete independent snapshot:

```json
{
  "version": 1,
  "name": "Named recipient offer",
  "predicate": {
    "op": "all",
    "terms": [
      { "field": "first_name", "op": "exists" },
      { "field": "email", "op": "contains", "value": "@example.invalid" }
    ]
  }
}
```

Only actual `email`, `name` and `first_name` fields exist in this language. Operators are `exists`, `equals`, `not-equals`, `contains`, `all` and `any`. Comparisons are literal, case-sensitive and untrimmed. Missing, empty, inherited, accessor or oversized recipient values never satisfy leaf predicates, including `not-equals`. There is no code, eval, regex predicate, field traversal, remote fetch, dynamic lookup or `custom_` recipient field. Plain comparison operands are 1–200 characters and exclude control bytes, angle brackets and braces. The tree admits at most four levels, 24 total nodes (groups included), and 8 KiB of JSON.

`shared/emailRendering/conditions.ts` contains the sole evaluator and strict codecs. `conditionProtection.ts` rejects conditions on required/legal/locked/unknown/imported sections, linked module roots and descendants, protected ancestors, and enclosing containers containing protected descendants. Existing structured designer locks are consumed via `conditionPolicyLockIds(policy)`: both `designerLocks.blockIds` and block owners of `designerLocks.styleFields` conservatively protect visibility, including root inheritance. Legacy legal/unsubscribe/privacy/terms/address content is conservatively recognized in desktop and mobile data because legacy source has no universal typed legal flag. Source brand metadata is descriptive and preserved independently; parent brand schema integration is still required to exercise its new optional shape in this older checkout.

Canonical validation applies these protections, including module pins and designer locks. A condition can never be included in ordinary staff `editableFields`, even at a nested scalar predicate path. Generic desktop/mobile prop setters keep the condition read-only, and mobile-only conditions are rejected. Server render admission and private Worker admission independently validate conditions; authored HTML/text cannot forge the reserved generated marker namespace.

Named definitions live in `email_content_conditions` with scoped CRUD at `/api/agency/email/conditions`. Reads require authenticated explicit client access; writes require existing write access and client authorization; SQL reads/updates/deletes include client predicates. Duplicate names return 409. Definitions are authoring aids only: applying a definition copies its name and typed predicate, never a mutable definition ID. Renaming/editing/deleting a definition does not rewrite blocks or frozen campaign HTML. Migration `496_email_content_conditions.sql` is reserved and **not applied**; the coordinator applies it.

## Dedicated designer mutation and UI

`GET /api/email/design/conditions?documentId=...` discovers current designer access from the session and real stored owner, and does not trust browser role/client declarations. Staff sees loaded conditions read-only. `POST /api/email/design/conditions` accepts exactly `documentId`, `expectedRevisionId`, `operationId`, `blockId` and `condition` (typed snapshot or null). It accepts no client design, policy, actor, scope, brand, layout or module pins.

The service reads the immutable requested revision, checks fresh designer authorization and current template/client ownership, derives only the one condition prop, then calls the existing canonical draft writer with its CAS, locks, dependency authority and receipt path. Designer access is rechecked by the writer after locks and before commit. Retry derivation uses the same immutable expected revision, preserving the same operation ID and payload after unknown acknowledgement. The client retains that pending payload through reply/readback failure and exposes reconciliation; ordinary Save and FigFlow open are blocked while pending. Successful readback refreshes source only if local content has not changed meanwhile; newer local edits remain and surface a reload conflict.

The selected block inspector offers a Nuxt UI picker/editor for named definitions, recursive all/any rules and literal comparisons, plus explicit Apply, Show to everyone, catalog Save/Update and modal-confirmed deletion. Canvas badges identify conditional leaves and rows. Shared/client changes clear catalog and discovery authority synchronously and fence late replies. Sample preview uses the existing Preview as values; authored/source compilation retains conditions without recipient values.

Design follows the existing XeroFlow semantic palette and inspector typography: left-aligned fields, visible rule indentation, full-width Nuxt UI controls, UFormField labels, container-aware columns and bounded modal scrolling. The frontend-design skill was read from its installed fallback location after the AGENTS path proved absent. No new raw form controls or browser dialogs were added.

## Generated frozen HTML contract and parent integration

The compiler emits only this reserved namespace, never provider execution syntax:

```text
<!--xf-condition:v1:open:c1:HEX_UTF8_JSON-->conditional HTML<!--xf-condition:v1:close:c1-->
```

The hex payload is the complete validated `ContentCondition` snapshot. IDs are compiler-generated, unique within the output, and matched with a stack. Frozen resolution admits at most 600 marker tokens (300 regions), 32 nested regions and 16 MiB HTML. Unknown versions, malformed/invalid payloads, repeated IDs, mismatched closes, unclosed regions and excessive bounds throw `INVALID_CONDITION_MARKER`, including inside hidden regions. The helper returns no partial result on failure. All nonreserved bytes are untouched slices, preserving Outlook conditionals and imported HTML; arbitrary `{{#if ...}}`, source conditional comments and other raw template syntax are never interpreted.

**Required parent sender integration:**

```ts
import { resolveConditionalHtml } from '../../../shared/emailRendering/conditions'

// Frozen source/body only, before recipient merge replacement and tracking:
const conditionalBody = resolveConditionalHtml(frozenBodyHtml, {
  email: recipient.email,
  name: recipient.name,
  first_name: recipient.first_name
})
// Pass conditionalBody into the parent's existing one-pass personalizer.
// Marker errors must block this recipient/send, never fall back to frozenBodyHtml.
```

Use the real recipient variables already derived by the sender; do not join the mutable catalog. Do not run condition evaluation after recipient replacement, and do not send remaining markers to Resend. Parent retains ownership of post-personalization/tracking checks for visible unsubscribe/footer, claims and provider execution.

**Required parent renderer merge:** this older checkout places sample condition resolution immediately before its existing final `replaceMergeFields` call. Parent already has a newer metadata one-pass/escaping fix and declared width handling. Preserve those changes and relocate `resolveConditionalHtml(contentHtml, options.variables)` to **before the parent's body merge resolution and wrapper assembly**; evaluate only when variables are supplied. No-values compilation must retain markers and source HTML. The imported full-document bypass remains untouched. Do not restore this checkout's older whole-wrapper metadata resolver or width constant over parent code.

Parent also owns runtime route/admission changes for the new GET/POST designer endpoint and catalog routes, immutable source pins, combined brand/condition pending guards, public marketing sync and final integration tests. Merge the small `useEdmBuilder` setter changes alongside the brand worker's separate add-block defaults. Preserve optional `source.brand` and `policy.designerLocks` through the parent schema merge; test their actual integrated shapes.

## Verification and remaining acceptance

Node `24.18.0`, no installs or lockfile changes. Focused Vitest run: **18 files, 168 tests passed**:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/unit/emailDesignConditionRoutes.test.ts test/unit/emailConditions.test.ts \
  test/server/emailDesignConditions.test.ts test/server/api/emailConditionDefinitions.test.ts \
  test/server/emailConditionStorage.test.ts test/app/edmConditions.test.ts \
  test/components/edmConditions.test.ts test/unit/emailDesignStaffEdit.test.ts \
  test/unit/emailDesignContract.test.ts test/unit/emailDesignAdapter.test.ts \
  test/workers/emailRenderingVariables.test.ts test/utils/emailRenderDocument.test.ts \
  test/unit/importedEmailDocument.test.ts test/workers/emailRenderingBoundary.test.ts \
  test/workers/emailRenderingParity.test.ts test/components/emailEdmBlockSettingsPanel.test.ts \
  test/components/edmMergeAuthoring.test.ts test/app/edmBuilderStore.test.ts --no-cache
```

Coverage includes real-field admission, bounds, missing values/accessors, all/any, nested and malformed marker closure, frozen retention, sample evaluation, complete imported document identity, required/legal/mobile/unknown/linked/lock ancestry, canonical staff rejection, scoped catalog SQL and APIs, origin/session/feature gates, server-derived designer changes, immutable retry derivation, stale CAS propagation, client-response fencing, mounted recursive editor behavior and existing rendering/builder regression suites. Database tests use injected/mock storage; they do not prove remote schema execution or transaction transport. The existing writer's CAS/receipt implementation is reused, not replaced.

Private Worker `tsc -p workers/email-rendering/tsconfig.json --noEmit` passed. A strict isolated TypeScript program for the shared condition/canonical files passed. Six touched Vue SFCs passed script/template compilation. Scoped ESLint passed with zero errors and the two existing `vue/no-v-html` warnings in EdmBlockRenderer; `git diff --check` passed. Source review covered the new contracts/services/UI and narrow integration diffs, including server aliases, sentinel select values, reactivity, duplicate badges, marker ordering, no server URL fetching, unchanged pins/policies, and current renderer allocation budgets.

Not claimed: migrated/hosted/real-client CRUD, designer/staff acceptance in the authenticated full builder, full native/WASM acceptance, final sender integration, actual provider delivery, integrated parent metadata/brand/lock proofs, deployment or production readiness. Next coordinator checks are migration 496 review/application, parent helper/routing integration, exact integrated source regressions and authenticated saved/reloaded sample preview plus frozen-recipient evaluation before any authorized send.
