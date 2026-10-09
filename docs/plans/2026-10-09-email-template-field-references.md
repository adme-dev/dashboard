# Stable email field references — local contract, 9 October 2026

Implements the validator, private renderer, generation admission and owned draft
runtime portion of the accepted email-template plan, now including the local manual
field picker and compatibility admission. Hosted acceptance and delivery activation
remain pending.

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

## Manual picker and compatibility admission

The local editor offers saved visible fields, an explicit fallback (blank allowed),
and Insert into subject, preheader or text-bearing blocks. One insertion is one
unsaved history change. Binding fallback edits follow Undo; deliberately typed
pending fallback text survives response refreshes. Use fallback text replaces all
exact occurrences and removes the binding, returning to V1 when none remain.
Variable-looking fallback text must be edited before conversion; rendering itself
continues to treat it literally. Read-only and busy states withhold edits.

Availability is a read-only, current-authority check: the existing private draft
read RPC accepts a strict `{scope, audience, contractVersion:2}` probe. The installed
runtime confirms codec support only after the existing template table is readable.
The router validates the exact scope and rechecks managed route/capability after
reply. Ordinary V1 reads preserve their strict original request/response shape.
Dashboard additionally probes the real private V2 renderer with neutral synthetic
content. The picker requires matching site, session surface, form key and checkpoint.
Hidden fields, defaults and enquiry answers are excluded from field options.

V2 save/preview/generation are withheld without both services. Generation derives
its availability flag on the server and rejects V2 input before reserving usage
when services are older. A provider cannot add V2 output when unavailable. Authority
snapshots copy only scope, actor ID, authority key and edit permission: actual
adapters also carry RPC services, which cannot safely be structured-cloned.

## Acceptance checklist

- [x] Bounded V2 contract, literal fallbacks and legacy wire preservation.
- [x] Current field IDs/types, canonical shared mapping and adoption invalidation.
- [x] Synthetic renderer, escaping, stale schema denial and answer-input rejection.
- [x] Save/preview/generation await races and explicit accepted-draft repair.
- [x] Customer SQLite immutable revision/history and stale-save checks.
- [x] Independent code review and focused tests.
- [x] Final local build/size, changed-file types/lint and broad regression checks.
- [x] Local manual field picker, fallback repair, parent Undo/Redo and real private preview.
- [ ] Hosted picker and AI Apply acceptance after coordinated service release.
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

## 9 October manual picker validation

Local browser QA used the existing copied PostgreSQL workspace, owned SQLite draft
store built from the matching native source and actual private renderer. Verified
Insert, Undo/Redo, selected synthetic answer, foreign-form fallback, mobile email
preview and light/dark controls. Restored the original revision-10 Team draft
without saving; no original demo files, production data or draft history changed.
No new device viewport acceptance is claimed. Two adapter-function snapshot
regressions failed with DataCloneError before the correction and passed afterward.

Independent review approves the picker and snapshot correction. Updated focused
and broader validation receipts are recorded in the current local handoff; prior
contract figures above refer to its earlier committed source, not this increment.

Final picker build and review: Dashboard broader regression 209 passed with 31
existing skips; 26 changed TypeScript/Vue files pass ESLint. The scoped Vue graph
retains the same 205 normalised existing error identities (851 lines), with no
new identities. Nuxt build/wrapping/size pass at raw 25,458,225/25,468,928 (10,703
bytes spare), gzip 7,041,594/9,750,000. Repository typechecking is still not clean.
Native compatibility increment passes build 28 tasks, types 44 plus security,
full package/security/operator tests and lint 1576 files. Runtime candidate
6cb34fd939e71028567270190fb6d02c59011b2cdc1c4b0497effb3f702367f5 is 911,081 bytes;
releaseApproved remains false and no retained pins changed. Subsequent toolbar
layout work is a separate local increment with its own tests and review.
