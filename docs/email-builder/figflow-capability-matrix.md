# FigFlow EDM source capability matrix — F02

Status: partial implementation, 30 October 2026. This is a canonical document
boundary, not a native FigFlow adapter or a publication certificate. No route
consumes it yet. `assessDesignCapabilities` explicitly reports the
`source-capabilities` tier. Hosted/editor/client acceptance remains open.

| Feature | Current source disposition | Staff policy / remaining work |
|---|---|---|
| Heading, Text | Native composer block | New designs grant existing text fields by default; preserve typed merge tokens for later contextual validation |
| Button | Native composer block | Existing label and URL fields editable by default; styles require explicit policy |
| Image | Native composer block | Existing URL, alt and link fields editable by default; crop/size require explicit policy and verified derived assets |
| Avatar | Native composer block | No new default grants until avatar-specific fields are inventoried |
| Divider, Spacer | Native composer block | Layout edits require explicit policy |
| EmailLayout, Container, ColumnsContainer | Native composer block | Layout, stacking and section operations require explicit policy; no default structural grants |
| Html | Design-only in cross-editor conversion | Preserve original bounded section. Existing composer HTML behaviour is unchanged; do not claim native editable layers |
| social, menu, header, footer | Design-only in cross-editor conversion | Existing renderer types; native reverse mapping not verified |
| hero-section, feature-grid, countdown-timer, cta-banner | Design-only in cross-editor conversion | Preserve existing source; dynamic values require their current owners |
| testimonial, review-stars, next-steps | Design-only in cross-editor conversion | Existing renderer support is not evidence of native reverse mapping |
| Dynamic/product modules | Unsupported unless a verified mapping is added | Do not fabricate catalogue values or cross-client bindings |
| Overlap, arbitrary canvas layers, effects, unknown types | Unsupported | Explicit reviewed raster conversion or a verified structured mapping required |
| Raster artwork | No automatic fallback | F05 must create a real Image plus provenance, accessible text and functional links; setting a flag cannot confer approval |

`native-editable` means the existing composer understands the block type and
the persisted policy grants at least one scalar field. Native blocks with no
grants are reported as `design-only`. It does **not** mean every
property is permitted or verified in every email client. Reports for locked or
unsupported blocks expose no editable-field grants.

## Implemented boundary

- Strict version-1 envelope with kind, declared scope, native artifact reference,
  existing block map, roots, node/field lineage, revision pins, module instances,
  media metadata and explicit edit policy.
- Native artifacts use opaque IDs and digests, never public native-source URLs.
- The existing bounded JSON snapshot rejects object cycles, accessors, excessive
  nesting and non-JSON values before schema parsing. A copied result cannot be
  altered by later mutation of the input.
- Block graph must be a closed tree: no missing roots/children, cycles, orphan
  blocks, shared children or render depth greater than 32 (including the layout wrapper for modules). Module insertion must mint
  fresh IDs. Only renderer-recognised container references are traversed; child links on leaves are rejected. New column documents require 1–3 columns and exact equality between columnsCount (default 2) and the stored slots; mismatches are rejected without dropping content. Existing
  feature-grid numeric column counts are not mistaken for graph edges.
- Conservative initial limits: 300 blocks; 512 KiB UTF-8 for a module envelope;
  2 MiB for a document envelope, below the existing renderer's 8 MiB request
  bound; 100 media metadata entries, each at most 10 MiB and 10,000 pixels per
  axis. These are source admission ceilings, not recipient delivery budgets.
- Instance overrides must resolve inside that instance subtree and be allowed
  by the persisted policy. Direct module references must have immutable pins. Instance roots cannot claim the layout or overlap another instance. Nested module provenance must be resolved before admission; the current envelope does not support overlapping instance ownership.
- Staff policy changes can be rejected against a freshly read persisted policy.
  `assertStaffDesignEdit` additionally compares the complete document, allowing
  only granted scalar content fields of the original type. Scope, structural
  references, provenance and instance metadata cannot be changed through this
  content-save guard. F08 still owns fresh actor authority and revision CAS.

## Required before F02 is frozen

1. Resolve complete transitive module dependency closure from stored immutable
   revisions; envelope declarations cannot prove closure or ownership.
2. Define scoped action/session/proposal request and receipt schemas after the
   native bridge is reconciled. Include payload-bound idempotency, CAS conflicts,
   expiry/recovery retention and save-as-new destinations.
3. Verify native field mappings and ownership; this code does not parse the
   `.figcraft` ZIP or claim correspondence between arbitrary node IDs.
4. Add asset-reference validation and context-specific token/URL validation in
   the actual compiler/publication paths. Media metadata is not upload proof.
5. Measure large real design fixtures and renderer output, then approve limits
   and visual tolerances using the required actual clients. Do not invent pixel
   tolerances from browser previews.
6. Wire trusted server-derived scope, role checks, locks and default policy into
   actual mutations. Do not use the declared client ID as authority.

## Verification

Acceptance tests exercise malformed graphs, Unicode byte overflow, object
cycles, semantic lineage collisions, unresolved pins, policy escalation,
instance override isolation, content defaults, independent snapshots and
conservative capability classification. See `test/unit/emailDesignContract.test.ts`
and `test/unit/emailDesignCapabilities.test.ts`.

Synthetic native fixture `test/fixtures/email-design/figflow-synthetic.figcraft`
is derived from the hosted editor's empty/rectangle save with explicit 600x300
geometry added for a reopen smoke test. It contains no customer data. Browser
upload was refused by the tool's configured workspace-root policy, so this
fixture is **not** evidence of a successful hosted reopen or export.


## 31 October review follow-up

Grok's report was received and checked against the source. Fixed with failing
regressions first: hidden column slots; native editability without grants;
whole-object/structural policy paths; non-UUID declared client IDs; clientless
campaign drafts; incompatible override types; WebP delivery manifests; and
inconsistent public validation error types. A separate content-save guard now
rejects scope, layout and provenance changes while allowing granted content
changes. Input declarations still confer no authority.

Remaining review work is explicit, not accepted as complete: compound-module
content mapping; Avatar settings/renderer field mismatch; optional image link
creation; crop/responsive mapping; approved raster provenance; asset-reference
resolution and aggregate media budgets. Those require actual adapter, composer
and publication work. The policy-only helper retains its narrow meaning; callers
must use the content guard plus fresh scope/role checks and CAS for staff saves.

Verification: 8 focused files, 118 tests passed, including 58 new design tests.
No route integration, DB change, actual client acceptance or activation follows
from these results.


## Dependency resolution and rendering handoff

`server/utils/email-marketing/designDependencies.ts` now checks the complete
transitive set against pinned immutable revisions supplied by an authorised
resolver. It rejects unused/missing pins, wrong revision identity, cycles,
foreign scope at each edge, and aggregate source size over the document budget.
A shared module cannot import client-owned content merely because its outer
campaign belongs to that client. Database resolver wiring remains open.

`designAdapter.ts` unwraps canonical source into the existing renderer document,
adding only a layout wrapper for standalone modules. It rejects unsupported
blocks, policy/capability conflicts and a module-root name collision. It does
not decode native FigFlow ZIPs, fetch assets, rasterise, personalise recipients
or certify publication. Legacy HTML remains labelled design-only.
