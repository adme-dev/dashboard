# Stable email field references — local contract, 9 October 2026

Implements the validator, private renderer, generation admission and owned draft
runtime portion of the accepted email-template plan. This is not hosted acceptance,
a manual field picker or delivery activation.

## Contract

Version 1 remains byte-for-byte compatible: no `fieldBindings` or preview `formKey`
is added to old templates/requests. Version 2 requires an explicit `fieldBindings`
array, with at most 100 unique references. Each binding has the current form key,
canonical field ID, visible field type and required single-line fallback (200
characters maximum). An explicitly empty fallback is allowed; omission is rejected.
The token is `{{field.<formKey>.<fieldId>}}`.

A form key is the shared definition ID, or the existing `pageId:formId` legacy
placement key. Shared placement field mappings resolve to canonical definition
field IDs. Labels are not identities. Adoption changes the key and must invalidate
or explicitly rebind old references; no name matching or silent migration occurs.

Website defaults may use a declared fallback when previewed on another form;
foreign-form answers are never read. Overrides may reference only their selected
shared definition. Hidden fields cannot be bound. Fallbacks/answers are literal
values and never recursively expanded. Header controls are stripped, HTML is
escaped, and existing render allocation and record-size limits remain enforced.

## Current schema and repair

Save, preview and generation admit references against a freshly authorised owned
catalogue. Renaming a label is valid; removed or type-changed fields are invalid.
Preview rereads around media/render awaits. Generation validates input before
charging, validates model output against offered fields, and rechecks saved base
and catalogue schema across awaited work. Only schema is supplied to inference;
configured defaults, answers and private login provenance are omitted.

Template storage CAS protects expected template revision, not the current form
checkpoint. A schema race inside the write RPC can append an invalidated draft
before the Dashboard's reread returns 409. There is no automatic replay and no
claim of atomic schema freshness. The appended revision remains readable for
explicit repair; the next preview/save revalidates its references.

Unchanged unrelated stale overrides remain draft-only and readable while the
selected valid template is saved. This avoids a multi-template repair deadlock.
Removed overrides can still be explicitly cleaned up. Any future delivery or
activation path must admit every effective current template before freezing its
approved revision; preserving a stale draft is not approval to send it.

## Renderer/runtime compatibility and release order

The updated private renderer, Dashboard codec and native content router/runtime
all accept V2. Older strict services reject it. Legacy requests retain the existing
wire shape; V2 preview context includes only a server-derived form key and schema.
The preview RPC rejects real answers/defaults and renders synthetic answers only.
The generic literal-value helper is not a delivery API.

Release must coordinate these reviewed versions: private renderer first, matching
content router and retained runtime/storage verification next, then Dashboard and
manual picker exposure. Do not enable field references against an older runtime.
Existing managed installation, exact artifact, authority and capability gates remain
in force. No new migration, public RPC, entitlement or native AI allowance is added.

## Acceptance checklist

- [x] Bounded V2 contract, literal fallbacks and legacy wire preservation.
- [x] Current field IDs/types, canonical shared mapping and adoption invalidation.
- [x] Synthetic renderer, escaping, stale schema denial and answer-input rejection.
- [x] Save/preview/generation await races and explicit accepted-draft repair.
- [x] Customer SQLite immutable revision/history and stale-save checks.
- [x] Independent code review and focused tests.
- [x] Final local build/size, changed-file types/lint and broad regression checks.
- [ ] Manual field picker and fallback controls with Undo/preview/Apply acceptance.
- [ ] Coordinated matching renderer/router/runtime release and hosted acceptance.

No paid model call, email, GitHub Actions, deployment or customer activation was used.

## Final local validation

Dashboard: 178 tests across 14 focused/regression suites pass. Changed-source ESLint
passes. The scoped Vue type graph has the same 205 normalised existing error
identities (851 diagnostic lines), with no added/removed identities or changed-file
diagnostics; repository typechecking is not clean. Nuxt build/wrapping/size pass:
raw 25,453,847/25,468,928 (15,081 headroom), gzip 7,040,196/9,750,000.

Native: build 28 tasks, types 44 plus security types, test 40 package tasks plus 36
security and 8 operator tests, and full lint 1574 files pass. Four existing publisher
skips remain. Independent code review approved the contract after 163 Dashboard and 8
native tests; later V1/repair regressions also pass. No remote CI or deployment.
