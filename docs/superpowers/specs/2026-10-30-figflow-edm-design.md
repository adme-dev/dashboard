# PRD: FigFlow EDM design and the shared XeroFlow email library

Date: 2026-10-30
Status: Design draft; implementation not started. User requested this PRD, task tracking, composer capability recommendations, and Kimi/Grok assistance. Approval of documentation work does not establish implementation or release acceptance.
Product owner: Paul. Implementation owners: unassigned until task claim.
Execution plan and live task ledger: [FigFlow EDM implementation plan](../plans/2026-10-30-figflow-edm.md).

## 1. Outcome and agreed scope

Designers create emails and reusable email modules in FigFlow. Staff assemble and edit campaigns in the existing XeroFlow email composer, with a link back to FigFlow for design changes. Both editors use the existing template/module system and the canonical email renderer. Modules travel in both directions. Templates are selected as campaign content, not attached as email files.

The user requested:
- An Email / EDM option in FigFlow.
- Save a complete design into XeroFlow templates for use in outgoing EDMs.
- Import existing composer modules into FigFlow and save FigFlow sections into the module library.
- Useful staff editing in the composer, with FigFlow available for more advanced work.
- Conversion to sendable email, targeting Apple Mail, Outlook and Gmail.
- Composer improvements where necessary to support designs made in FigFlow.
- A maintained PRD, tasks and handoff record for agents and developers.

The detailed versioning, locking, API and rollout choices below are proposed engineering defaults, not claims that the user specified every detail. Implementers may refine internals through a recorded decision; changing user-visible scope requires product review.

## 2. Current evidence and source boundaries

Inspected dashboard workspace: `adme-dev/xeroflow-email-builder-20261030`, HEAD `fb7e001df0b1343e60f65a6213ea03f837eae9e2`, with substantial pre-existing uncommitted email-builder work. File observations include working-tree changes, not only that commit. Preserve all unrelated work. Reinspect current main and the owning branches before implementation.

Entry points:
- Composer: https://app.xeroflow.io/agency/email/compose?starter=postcards-futurax
- Hosted FigFlow: https://creative.xeroflow.io/figflow/0.11.2-flow1/
- Live authenticated behaviour at these URLs was not verified for this PRD.

Existing integration surfaces:
| Surface | Owning source | What was observed |
|---|---|---|
| Composer document | `app/types/edm.ts`, `app/composables/useEdmBuilder.ts` | Existing local editor document; do not replace it with another runtime |
| Module UI | `app/components/email/builder/EdmAddModuleMenu.vue`, `EdmFlyhubBuilder.client.vue` | Built-in sections, custom module insert/save/manage |
| Module fragments | `app/utils/edmModuleFragment.ts` | Extract subtrees and remap IDs on insertion |
| Module storage | `server/utils/email-marketing/customModules.ts`, `server/api/agency/email/modules/` | Existing `edm_custom_modules`, agency/client scope; no complete immutable version workflow |
| Module bounds | `customModules.ts` | 300 blocks and nominal 512 KiB; current size validation uses string length, so verify UTF-8 byte enforcement |
| Templates | `server/utils/email-marketing/templates.ts`, `server/api/email/templates/` | `body_source` generates `body_html` via renderer; templates and drafts already exist |
| Rendering | `shared/emailRendering/`, `workers/email-rendering/src/render/` | Existing renderer/contract, sanitisation and responsive behaviour |
| Sendability | `server/utils/email-marketing/sendability.ts` | Subject, unsupported markup, unsubscribe and size checks; not proof of inbox compatibility |
| FigFlow R&D | `docs/plans/2026-10-28-figflow-browser-bridge-rnd.md` | Prior research describes Rust/WASM bridge and snapshot requirements; not a delivered bridge |

Prior FigFlow source pointer: `/private/tmp/flow-source-build-20261028/figcraft`, upstream `d4a303d4708602a9df1738960852d18b185a616b`. This temporary directory is discovery evidence, never the canonical implementation location. The R&D references `workers/craft-editors/source-pins.json`, which is absent from this checkout. F01 must find the current owning repository, deployed source pins and build pipeline before assigning FigFlow changes.

Related work: [existing email-builder design](2026-10-30-xeroflow-email-builder-design.md), [email-builder ownership notes](../../email-builder/README.md), [OEM library runbook](../../runbooks/email-oem-template-library.md). This project extends those features without replacing ongoing import/cleanup work or asserting OEM approval.

## 3. User journeys

### Designer creates a template
1. Choose Email / EDM in FigFlow; select client or authorised agency library scope.
2. Start from a template or approved modules. Default email width is 600 px; existing 620 px designs retain their width. Desktop and mobile previews use the actual compiled output.
3. Compose sections and define editable content fields, allowed section operations and brand locks.
4. Run email preflight. Unsupported effects require an explicit fallback choice or correction.
5. Save design, then choose Save to email templates. Publication stores a versioned native source snapshot, canonical email document, assets and compatibility report.
6. The existing template picker shows the published version and editing capabilities. Publication is not a send action.

### Staff prepares a campaign
1. Select a template; create an independent draft pinned to its published revision.
2. Edit permitted text, imagery, crops, links, button labels, personalisation and permitted section order/duplication/removal.
3. For structural changes, choose Edit design in FigFlow. Open the exact draft and revision, including unsaved composer changes only after a successful draft save.
4. Return a proposal to that draft. Preview changes and apply only if the draft revision is unchanged. One apply is one undoable editor action.
5. Updating the shared library is a separate authorised action. Existing drafts and sent campaigns never change implicitly.

### Shared modules, both directions
- Insert a composer module into FigFlow as a structured email section, with new instance IDs and stable field lineage.
- Select a valid FigFlow email section and Save as email module; choose name, category and authorised scope.
- Reinsert the module in either editor with independent content overrides.
- Publish an updated module as a new immutable revision. Existing instances show Update available; they do not auto-refresh.
- Preview an update against an instance. Retain overrides only where field identity/type remains compatible; show conflicts and require a choice for removed or changed fields. No silent loss.
- Removing a library item archives it from new selection; already-pinned campaign snapshots remain renderable.

### Working drafts, library revisions and campaign drafts

| Object / action | Ownership and effect |
|---|---|
| Designer working draft — Save design | Durable private draft owned by its author in the selected scope; explicitly authorised collaborators may resume it. Saving does not publish it to the library. Archive hides it without deleting referenced artifacts. |
| Working draft — Publish template / Publish module | Authorised publisher creates an immutable library revision after type-specific preflight and destination/content preview. |
| Campaign draft — Save draft / Apply design changes | Updates only this draft via revision check, including its own canonical source, native artifact and mappings. |
| Campaign draft — Update from template | Optional explicit preview against a selected newer template revision; compatible overrides survive, conflicts require choices, cancel changes nothing. |
| Save as new template / Save as new module / Duplicate draft | Separate labelled actions create the named object type with new identity and explicit scope. No ambiguous generic Save as new operation. |

Every campaign-draft revision owns its latest optional native design artifact, canonical content, node/field mappings and base-template revision. Applying a FigFlow proposal advances these atomically. Subsequent handoffs open that draft artifact, never silently the original library design. A two-round-trip acceptance test must combine structural design changes and intervening staff edits.

Handoff proposals have durable IDs bound to actor/scope, draft ID and base revision, with `proposed`, `applied`, `cancelled` or `expired` state. The source working draft remains separately saved/unsaved. Both editors display client, document and save status, plus Back to campaign and Resume design actions. Closing a tab does not apply or discard a proposal. On conflict offer keep current, save proposal as a new campaign draft, or restart from current; never force overwrite. F02 defines expiry and recovery retention before implementation, preserving referenced artifacts.

## 4. Shared contract and source authority

Extend the existing email document/fragment contract; do not introduce a competing CRM, template library or sending pipeline. Keep existing block type strings, child references, responsive overrides and legacy documents compatible.

Each published asset has a stable template/module ID, immutable revision ID, schema version, owning scope, author, source-editor provenance, optional native design artifact reference, canonical email source, asset manifest, edit policy and compiler/report versions. Drafts have their own revision and copy of resolved content. Module instances include module revision, instance ID, field mappings and explicit overrides. Template revisions pin the complete module-revision dependency closure; changing those dependencies requires a new template revision. Republishing an edited instance requires its source/base revision plus explicit selection of which campaign-specific overrides enter the shared revision, with content/scope preview and cancel-without-mutation.

The canonical email document is authoritative for sendable content. Native FigFlow data holds design-only structure and stable mappings. On reopening, apply the latest draft content to that design through the adapter; stale native snapshots must never overwrite staff edits. Unmappable edits produce a conflict, not an inferred rewrite. For a composer-created or legacy document without native source, first open constructs a new native document from supported canonical blocks. Unsupported HTML/dynamic sections remain labelled bounded elements with preserved source; native-source references remain absent until successful conversion and save.

Publication is a recoverable state machine, not a cross-service database/storage transaction: validate permissions → reserve idempotent operation → stage source/media privately → compile and type-specific preflight → persist immutable artifacts and commit revision/manifest → enable recipient delivery only for committed ready assets → confirm receipt. The delivery gateway must not expose staging or failed-publish objects. Database revision/manifest changes are atomic; storage steps are reconciled with recorded states. Same-ID/same-payload retries resume a failed transient operation or return its confirmed result; retain payload binding and never erase uncertain in-flight claims. Same ID with a different payload is a conflict. Clean abandoned private uploads only after reconciliation/retention. Do not mark published merely because upload began.

Published email media must use durable public HTTPS delivery suitable for recipients without login. Private native design files use authenticated retrieval and must never be exposed through public media URLs. Use content-addressed immutable media keys; never overwrite an asset used by a sent email. Published asset retention follows references from drafts and sent campaign snapshots, not the designer's current session.

## 5. Composer capability review and design issue policy

F02 produces a versioned capability matrix before adapters or UI expansion. Every feature has one disposition: native composer editing; locked design-only with FigFlow action; explicit raster fallback; unsupported/block publication. Record the compiler minimum version and a fixture for each supported capability.

Initial proposed matrix:
| Capability | Composer expectation | FigFlow / conversion rule |
|---|---|---|
| Headings and text | Edit content, inline emphasis/body links, permitted font/size/weight/colour/alignment | Preserve real accessible text; use tested font fallbacks |
| Images | Replace, alt text, link, aspect ratio and controlled crop | Persist crop parameters; use deterministic derived assets when required |
| Buttons | Label, URL, alignment and permitted style | Compile tested email button markup; no JavaScript |
| Spacing | Constrained section padding and gaps | Convert to deterministic email layout dimensions |
| Columns | Approved ratios and mobile stacking/order | No arbitrary absolute-position layout in structured mode |
| Section operations | Duplicate/remove/reorder when allowed | Stable lineage; required footer cannot be removed from sendable output |
| Brand controls | Only fields permitted by policy | Server enforces locks, not just UI controls |
| Merge fields | Typed token picker and safe preview values | Preserve tokens as data; no arbitrary template execution |
| Complex illustration/effects | Replace image or reopen FigFlow | Explicit image fallback with dimensions, alt text and size checks |
| Imported HTML | Preserve as a bounded legacy section | No false promise of fully editable layers; conversion is explicit and reversible |
| Dynamic/product modules | Preserve existing validated behaviour | Unsupported mapping remains locked; no fabrication of catalogue/offer values |
| Freeform overlapping layers | Design in FigFlow | Explicit fallback or actionable publish blocker |

Default editing policy: new structured assets allow ordinary text/inline links, image replacement/alt text and CTA content edits; layout, brand styles and section operations require an explicit designer policy. Only an authorised designer/publisher may change locks. Legacy composer documents keep their existing editing behaviour; migration must not retroactively lock them or grant new cross-client authority. Legacy HTML remains bounded and labelled. F02 records field-level policy defaults, including focal crop and responsive controls, and F08 tests an end-to-end staff-only campaign editing journey.

Recommended first composer additions, only where F02 proves a gap: text styles, spacing controls, crop/aspect ratio, button options, column stacking/order, permitted section actions, capability badges and Edit in FigFlow. Avoid exposing every canvas tool in the composer.

When a design issue is discovered: create an issue with task ID, minimal fixture, expected/actual output and affected clients; classify as data loss, incompatible output, missing staff control or cosmetic difference; propose the smallest reliable fix. Data loss, silent flattening, security failures and broken required content block publication. Cosmetic differences may be documented only after explicit acceptance. AI may explain suggestions but cannot silently convert content, offers, links, locks or layouts.

## 6. Email output and acceptance

Use the existing private rendering service for both editors. Native canvas geometry is not sendable HTML. Generate a conservative responsive email layout, inline styles as appropriate, required Outlook fallbacks, hosted image assets, useful alt text and plain text. Critical text, CTA links and unsubscribe content must not exist only inside raster artwork.

Preflight is context-specific: module publication checks fragment structure, assets, edit policy and conversion, without requiring a subject or complete footer; template publication validates layout and required placeholders without recipient-specific values; send-ready campaign validation checks the fully assembled, personalised output including subject, sender and unsubscribe requirements. Draft saves may retain unresolved issues.

Preflight must cover syntax/schema, content/asset bounds, safe URL protocols, no active markup, accessible reading order, missing assets/alt text, font substitutions, dark-mode warnings, subject/preheader, broken or unresolved tokens and required sender/unsubscribe content. The existing 102 KiB HTML warning threshold is retained as a warning, not a guarantee about Gmail clipping. Measure after personalisation and tracking; if a tested design depends on styling lost when clipped, treat that specific incompatibility as a readiness blocker rather than globally treating 102 KiB as a legal or client guarantee. For new campaigns, freeze the selected compiled HTML into the existing campaign snapshot before scheduling. Preserve the current send path: existing scheduled/sent campaign HTML is not regenerated by this feature. Final send validation checks actual frozen/personalised/tracked content and the existing campaign consent, suppression, sender authentication and unsubscribe controls. Template validation alone cannot certify legal compliance or inbox placement.

Conversion security requirements: preserve a private original of imported HTML, then use an email-aware sanitizer that retains only validated Outlook conditional/fallback markup. Never serve raw imported markup as an active application document. Test supported conditionals survive and scripts/event handlers/unsafe URLs do not. Type and contextually escape text/URL merge fields; supported unresolved placeholders are allowed in reusable assets but all required values must resolve at send. Require the platform-owned unsubscribe token in a functional visible link, resolved to the approved unsubscribe URL at send; substring matching alone is insufficient. Public email images use tested PNG/JPEG/GIF delivery without data/blob URLs or login redirects. Validate fetched hosts/redirects against SSRF controls. Cross-client dynamic bindings require explicit authorised rebinding; reject insertion otherwise, without fetching source-client data or silently stripping content.

Validation tiers are separate: schema valid; compiled; preflight passed; browser preview checked; real-client tested; approved for release. Do not label a browser screenshot as an Outlook test.

Before building the bridge UI, F05 performs an early real-client spike for columns, buttons, legacy Outlook markup and dark mode. This establishes viable compiler strategies and prevents late discovery of fundamental rendering failures; F10 remains the full end-to-end gate. Prefer tested conditional Outlook fallbacks where needed, not assumptions about what every Outlook version supports.

Required release matrix: Apple Mail macOS and iOS; Gmail web and mobile; classic Outlook Windows, new Outlook Windows and Outlook web. Record exact versions/devices or testing-provider client identifiers and date. Cover narrow mobile, desktop, dark mode where supported, images disabled, long text, replaced images, tracked URLs and personalised content. Use synthetic fixtures and designated test recipients; never send a customer campaign for validation. External paid testing requires separately available credentials/budget.

Acceptance fixtures: header, hero with text and CTA, two-column feature, repeating vehicle offers, footer, complex image artwork and imported HTML. Every supported fixture must survive composer → FigFlow → composer with unchanged text, links, merge fields, module lineage and locks; geometry must meet recorded visual tolerances. F02 defines measurable per-fixture tolerances before implementation. A generic pixel-perfect-all-clients claim is out of scope.

## 7. Permissions, concurrency and lifecycle

- Reuse server-derived identity and existing client scope. Verify both source read and destination write permissions for cross-library operations; agency-global publishing requires explicit authority. Treat legacy scope conservatively; do not broaden access during migration.
- Roles/capabilities proposed: campaign editor edits allowed draft fields; designer edits structure; library publisher publishes shared revisions. F01 maps these to existing RBAC rather than inventing unrestricted roles.
- Bridge grants bind actor, scope, draft/document ID, revision and browser instance. Exact origin checks, short-lived grants and revocation checks; no bearer tokens in URLs, no arbitrary engine commands or paths.
- Server validates edit policies, token types and complete bounded graph. Enforce UTF-8 byte counts, maximum depth, acyclic references, valid roots, no orphan or cross-document references and bounded image pixels/output.
- Stale save/return/publish fails with a recoverable conflict. Default transport is a separate FigFlow tab with a server-mediated scoped session; bind exact production origins `https://app.xeroflow.io` and `https://creative.xeroflow.io` (explicit separate staging allowlist). Optional postMessage is only a status signal with exact targetOrigin/origin/source checks, never authority. Use compare-and-swap rather than requiring a long-lived exclusive lock; show when another editor session is active, pause conflicting autosave during return application, and retain divergent work. Inserts name the displayed module revision; update application binds current draft/instance and previewed target revision. Reject scope reassignment mixed with content save; handle any authorised copy/move separately. Changing tabs, reconnecting, undoing or switching clients must not retarget an operation.
- Saving draft work remains possible when publication is blocked; retain warnings and native source. Unsupported newer schema opens read-only or with explicit supported fallback, never silent downgrade.
- Cancellation/offline failures retain local unsaved work and its unsaved indicator; clear only operation/progress state. Durable server receipts determine saved/published status. No full real-time bidirectional collaborative editing requirement in v1.
- Logs contain IDs, versions, timings and issue codes; no recipient data, design content, credentials or full HTML.

## 8. Migration, rollout and non-goals

Add version/provenance/policy data without destructive replacement of existing templates/modules. Legacy IDs and content remain valid; backfill an initial revision with explicit legacy provenance, not invented FigFlow source. Existing APIs retain compatibility while new revision-aware operations are introduced. Route legacy mutation endpoints through revision-aware writes; mutable head rows must not be the content referenced by pinned snapshots. Backfill copies immutable bytes instead of pointing at mutable rows, and referenced revisions/assets cannot cascade-delete. Preserve source archives and OEM provenance.

Release behind independent server-enforced authoring, publish and campaign-selection eligibility flags, initially staff-only. Internal published test revisions must not automatically enter the production campaign picker or be accepted by send endpoints. Roll back by disabling new authoring/publishing while keeping existing composer edits, pinned renders and sending functional. Schema additions must remain backward compatible. Pin renderer/schema versions and retain the compatible renderer path for already-published content; rollback must not make stored revisions unreadable.

Non-goals: converting every arbitrary canvas perfectly; replacing the composer; rebuilding the sending system; automatic merging of design edits; automatic updates to sent/draft campaigns; AI-generated approval; full editor feature parity; importing Figma files as an unrelated project.

Update public feature pages only when implementation is available with truthful capability/status wording. Follow repository deployment guards and verify existing navigation including QR Codes. Never deploy a stale worktree or build this feature from the dirty documentation workspace without reconciliation.

## 9. Definition of done and handoff

Done requires all F01–F12 tasks accepted with linked evidence, validated migration/rollback, access and concurrency tests, real-client acceptance, source/deployment receipts, public documentation, support runbook and owner sign-off. Documentation completion is not implementation completion.

New agent: read this PRD and the plan; verify repository/branch/upstream and current main; inspect active work and shared dependencies; claim one task in the ledger before editing; work only within that scope. Record blockers and changed decisions immediately. Preserve disk space: reuse existing environments where safe, avoid redundant worktrees/build copies, and retire only owned verified-complete checkouts.

Open discovery gates (engineering-owned): actual FigFlow source/build owner; exact browser document APIs and layout support; existing RBAC mapping; test-service availability; detailed schema/migration numbers. These block their dependent implementation tasks, not drafting the rest of the project.

Reference: [Gmail CSS support](https://developers.google.com/workspace/gmail/design/css) documents supported styles and media queries; other client evidence must be obtained during F10 rather than inferred from Gmail.
