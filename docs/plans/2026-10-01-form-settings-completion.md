# Form settings completion

For the current tick-off list and interruption recovery, start with
[Customer CMS status](customer-cms-status.md).

Current local status: restored and verified in durable project storage. See
**Durable local demo restored** at the end for current paths and acceptance.
Earlier `/private/tmp` references record a previous run and no longer exist.

Source: Customer CMS PRD sections 4.2–4.3 and RND-05/06/07, held in
`dashboard-component-workspace-rnd-20260930/docs/prd/page-studio-customer-cms-prd.md`.
The user explicitly requested completion on 1 October 2026. This plan does not
replace that PRD or mark its tasks complete.

## Starting evidence

The standalone CMS exposes the existing submissions inbox. Saved page summaries
previously retained form IDs only. Website email preferences are revisioned but
sending and inbound forwarding are explicitly disabled. Public forms use fixed
receipt text; the published form schema has no conditional outcome policy.
Customer D1 has a scoped form-submission store, but the standalone legacy inbox
currently reads lead/audit records. These paths must converge before claiming a
customer-owned end-to-end enquiry workspace.

## Ordered acceptance slices

1. **Per-form draft settings and simulation:** select a real saved form and its
   placement; inspect fields; save revisioned settings in customer-owned storage;
   safely preview a default message or same-site redirect plus ordered conditions.
   Preserve edits on conflicts/errors. Saving a draft does not activate delivery.
2. **Published outcomes:** bind a settings revision and field schema to approval
   and publication. Apply the selected outcome only after durable acceptance;
   pending/rejected/uncertain receipts must never redirect. Native browser and
   JavaScript submissions behave consistently. No answer interpolation in URLs.
3. **AI-assisted email template builder, notifications and customer replies:** separate team recipients, customer
   acknowledgement templates and inbound mailbox forwarding. Validate approved
   variables and sender/reply-to ownership, preview escaped output. Install a
   durable customer outbox with idempotency, suppression, bounded retries and
   redacted delivery history before offering enable or real-send actions.
4. **Integrations:** versioned enquiry.created events, named customer-owned
   connections, allowed field mapping, safe egress, signatures, replay controls,
   explicit isolated test versus real delivery, disable and retry controls.
5. **Operational completeness:** one customer-owned inbox, per-form entries,
   assignments/notes, schema/config/placement identity, privacy and retention,
   export, insights and role/tenant/session rejection coverage.

## Release and demo boundaries

No settings draft enables a public redirect, sends a message, or activates a
webhook. Local previews must say what they simulate and show no success claim
for an unavailable storage/provider connection. Do not migrate customer production
storage or enable deliveries as an incidental consequence of editing the UI.
Use the established scoped content router and isolated customer runtime; never
store enquiry configuration in browser storage or an unscoped agency table.

## Verification gates

- Field IDs and condition types are validated against the saved form schema.
- First matching condition wins; missing answers use the deterministic fallback.
- Reject external, scheme-relative, encoded traversal, credential and executable
  redirects. Redirect paths are fixed, not visitor inputs or answer templates.
- Revision conflicts preserve the prior revision and the user's unsaved edits.
- Cross-customer/site/environment reads/writes fail; viewers cannot save settings.
- Browser keyboard, error/loading, mobile and reload-persistence checks.
- Independently review before commit; no production completion claim until the
  published runtime and provider/outbox acceptance evidence exists.

## Implemented local slice — 1 October 2026

Slice 1 initially exposed the eight real Fantasy Limo form placements, their saved
fields, draft messages, fixed same-site redirects and ordered conditions. The later
shared adoption checkpoint below consolidates them into four definitions.
Preview evaluates example answers locally without submitting an enquiry. Draft
writes use scoped customer storage, optimistic revision checks and checkpoint
validation. Unsaved changes are protected on navigation; conflicts preserve edits
and offer reload. The local demo persists drafts across reloads.

**Hosted release blocker:** the new table is held in the separate
`form-settings-migrations` catalogue. It is installed only in the isolated local
demo. Installation through the managed customer schema/runtime upgrade and
activation flow is still required before hosted customers can use this feature.
The existing pinned bootstrap schema is deliberately unchanged. Missing hosted
storage/RPC support fails closed as unavailable. This is not a completed hosted
rollout, and none of slices 2–5 is complete.

## Toyota theme reference

Read-only reference: `/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt`.
Its existing uncommitted work was left intact.

| Reference | Evidence and reuse |
| --- | --- |
| `app/pages/admin/forms/index.vue` | Form catalogue and clear per-form entry point. |
| `app/pages/admin/forms/[slug]/index.vue` | Separate Settings, Notifications, Confirmations and Routing tabs; compact sections, explicit save, preview and ordered rules. Adopt the organisation as each capability becomes functional. |
| `app/components/admin/NotificationEditor.vue` | Team/customer recipients, merge-tag guidance and conditional notification controls. Adapt approved variables and escaped previews for the new delivery slice. |
| `server/api/submit-enquiry.post.ts`, `server/utils/email.ts` | Submission calls the actual team/customer email notification path, reading dealer-specific settings. Useful behaviour reference, not portable customer-storage code. |
| `app/composables/useEnquiryForm.ts` | Submission composable does not read the saved confirmation or redirect policy. Admin controls plus persistence are not evidence of end-to-end redirects. |
| `docs/admin-ui-card-guidelines.md` | Compact operational canvas, restrained borders and spacing. Keep our semantic Nuxt UI palette and the standalone style guide. |

Do not transplant Toyota branding, dealer-specific defaults, unchecked settings
writes or fail-open condition handling. Reuse the product patterns with our
customer isolation, schema validation, revision conflicts and delivery controls.

## AI-assisted form email builder — accepted requirement

Requested 1 October 2026: design admin/team notifications and customer replies
with a visual template builder and an adjacent AI conversation. The same editable
structured document must drive manual edits, AI proposals and rendered output.

Customer journey: Forms → choose form → Emails → Team notification / Customer
reply → start from a template or describe the design → review the AI proposal →
apply or discard → preview desktop/mobile with example data → save draft →
explicitly enable an approved revision once delivery is available.

- Separate subject, preheader, body and brand styling for each audience; website
  brand defaults, reusable header/footer, text, image, divider and button blocks.
- AI chat supports a first draft and targeted revisions (tone, content, layout,
  colours), uses the enabled model catalogue through Cloudflare AI Gateway, and
  exposes costs/usage using the existing customer credit system. Model/provider
  availability must be real; do not simulate a completed generation.
- AI receives the form schema, website brand and synthetic examples by default,
  not real enquiry answers. Approved merge tags bind to stable field IDs. Missing
  values have defined fallbacks; renamed/deleted fields invalidate approval.
- Validate generated documents and links, escape inserted values, restrict block
  types and never allow generated executable markup. AI cannot change recipients,
  sender ownership, delivery status or integrations. Proposals require Apply.
- Preserve manual edits and unsaved chat proposals; undo/redo, version history,
  accessible controls and preview errors. Concurrent saves use expected revisions.
- Keep team recipient lists and the schema-validated customer email field separate
  from template design. Use verified sender/reply-to identity. Actual test send and
  enabling remain unavailable until the durable outbox/idempotency/suppression
  and delivery history acceptance gates in slice 3 pass.
- Saved templates and approved revisions belong to the customer's own storage,
  with site/role checks. Transactional replies do not subscribe people to marketing.

### Existing assets to adapt

The agency already has a visual email builder in
`app/components/email/builder/EdmFlyhubBuilder.client.vue`, block renderers,
`app/composables/useEdmBuilder`, `app/types/edm`, presets, responsive behaviour,
server HTML rendering and preview/test-send flows. This is a better starting
point than a second independent email editor. Extract/adapt presentation and
structured rendering behind customer-scoped persistence and authority; do not
mount agency campaign scheduling or agency template APIs into the customer CMS.
The current agency template store uses `edm_templates` in agency Postgres, so it
cannot be reused as the customer's authoritative template database.

Toyota's NotificationEditor supplies the per-form team/customer organisation,
merge-tag guidance and conditional-notification UX. The AI chat and customer-owned
storage integration are new work, not capabilities already demonstrated there.

### Implementation order and acceptance

1. Reuse the structured editor/rendering core with two customer-owned draft
   templates, scoped revision APIs, schema-aware merge tags and synthetic preview.
2. Add authenticated AI conversation/proposals via the existing gateway/credit
   conventions, validate the output, and require Apply before changing the draft.
3. Bind approved template revisions to the notification outbox, explicit test
   recipient, sender identity and activation controls; verify actual delivery.

Acceptance covers cross-customer access, concurrent edits, provider/credit errors,
unsafe AI output, unknown merge tags, escaped answers, desktop/mobile rendering,
undo/discard and duplicate-delivery prevention. These tasks remain pending; the
current local demo provides outcome settings only, not this email builder.

## Verification checkpoint

Focused Dashboard tests: 43 passed, including legacy saved-form compatibility.
Changed-source ESLint passed. The whole Dashboard typecheck still fails on
repository-wide errors; no diagnostics remain in this slice's changed files.
Worker build/typecheck/lint passed; its unchanged staging route-count test failure
is recorded in Studio's `docs/architecture/form-settings-drafts.md`. Independent
review found no blockers for this local-only draft commit.

Chrome verified persisted revision 3 after server restart, default message and
conditional wedding redirect simulation, conflict recovery, navigation protection
and disabled sign-out while dirty. Screenshot:
`/private/tmp/fantasy-limo-form-settings-20261001.png`. The final browser pass used
native Chrome control after the browser debugger detached; exact responsive
breakpoint checks for this new form editor remain pending.

## Form identity and inherited email defaults

Follow-up requirement, 1 October 2026: customers must not repeat their admin email
address on every page. Provide website-wide team recipients, verified sender and
default team/customer templates. Forms inherit those defaults unless a customer
explicitly selects an override. Display “Using website defaults” or “Custom for
this form”, show the effective recipients/template, and offer reset to default.
Changes to website defaults must show which inheriting forms will be affected;
existing overrides stay intact. Resolve and snapshot effective approved settings
when creating each delivery job, so retries do not send to newly changed recipients.

Before adoption, the saved Fantasy Limo manifest had eight independent form IDs:
- `/contact` and `/enquiries`: same four-field structure, separate IDs.
- `/bookings`: one 21-field quote form.
- `/book-1hour`, `/book-one-hour-limo-hire`, `/book`, `/free-limo-quote`,
  `/general-hire-quote`: same nine-field booking structure, five separate IDs.

This proves three structural groups, not three authoritative shared definitions.
The pre-adoption dropdown listed placements explicitly. Identical
fields or names do not establish shared operational identity; do not auto-merge or
delete forms. Introduce reusable form definitions with explicit placements and
shared defaults. Adoption must preserve old IDs/submission attribution, review
configuration differences, and permit intentional independent copies. Future
catalogue shows one definition with “Used on N pages” and a placement list.

Email default inheritance remains pending. Shared definition storage and local
adoption are now implemented as described in the checkpoint below. Templates, shared
recipients and delivery configuration are not active in this local slice.

### Confirmed product decision

The user clarified that identical booking copies are one reusable form displayed
on multiple pages. Adopt that model: “Booking enquiry — used on 5 pages”, with one
shared email/settings configuration and page-of-origin attribution on entries.
Distinct IDs in the current saved format are a migration concern, not a reason to
require customers to configure the same form repeatedly. Create a separate form
only through an intentional “Duplicate as new form” action; placing an existing
form on another page must retain the shared definition. Reconciliation preserves
legacy IDs and entries while binding placements to the shared definition.

### Enforced for AI and manual creation

Reuse is mandatory for both manual and AI-created placements. AI operations must
resolve a shared form definition, and a separate explicit operation creates an
independent form. Approval/publication validation rejects unknown or cross-site
references and silent independent copies without create-new intent. Prompts may
explain the rule but are not its enforcement boundary.

Implementation evidence: Studio `packages/protocol/src/page.ts` now supports the
optional shared form library, and protocol validation enforces each adopted inline
form as a projection of its definition. The typed operations and AI acceptance
guards enforce reuse. The shared adoption below precedes email-builder storage;
this is shared identity and persistence, not label grouping or copying settings.

Required tests: AI/manual placement of an existing form produces another reference
and no new definition; explicit independent duplication produces a new identity;
shared template/recipient changes affect all placements; website defaults and
per-form overrides resolve consistently; other-site references fail; existing
submission IDs and originating page attribution survive adoption. The shared-form protocol and AI/manual reuse enforcement are implemented in the
Studio foundation; email inheritance and delivery tests remain pending.


## Clean navigation: Forms and Enquiries (1 October 2026)

Implemented in the standalone local demo:
- **Forms** contains the form selector, Fields and After submission settings.
- **Enquiries** is a separate inbox for received submissions, with details and live/test filters.
- **View enquiries** opens the selected form/page filter; **Show all enquiries** and the Enquiries navigation item clear that filter.
- Removed the embedded inbox and Entries tab from Forms. Unsaved settings still protect navigation.

Browser verified with the Fantasy Limo demo at localhost:3044. Screenshot:
`/private/tmp/fantasy-limo-separated-enquiries-20261001.png`.
This is a local UI change, not evidence of hosted activation.

Shared-form protocol, typed operations, projection validation and AI reuse guards
are implemented as a reviewed foundation in the Studio branch. Local adoption and shared outcome storage are now verified below. Shared email
defaults/templates, managed hosted adoption and delivery activation remain pending.

For this navigation slice, changed-source ESLint and 27 focused Dashboard tests
passed. Independent review found no blocking navigation/filter issues.


## Shared catalogue and local adoption — 1 October 2026

The local Fantasy Limo demo now has **four definitions across eight placements**:
Contact enquiry, Limousine quote request, Enquiries, and Booking enquiry used on
five pages. Contact and Enquiries remain independent because their configured
outcomes differ; no names or matching field structures are used to infer identity.

Forms shows one selector entry per definition, “Used on N pages”, an expandable
placement list and shared draft settings. View enquiries filters all of that
form's stable placement IDs, including historical page URLs. Receipt details keep
the original page route. Legacy manifests retain their explicit placement list.
The server derives the definition from the saved checkpoint rather than trusting
a client-provided definition ID. Shared writes keep expected-revision conflicts.

The adoption planner requires complete explicit grouping, maps legacy rule field
IDs to canonical IDs, and rejects conflicting outcomes, invalid fields/redirects,
foreign scope and unused source records. A missing draft means default settings,
not permission to discard a differing saved draft. Historical IDs and legacy
settings revisions are preserved.

Local cutover was performed with the dev server offline, source checkpoint and
settings revisions rechecked, a SQLite write lock and a scoped Postgres row lock.
Backup: `/private/tmp/customer-cms-local-layer/shared-adoption-backup-1790826902001/`.
Checkpoint: `checkpoint_local_shared_forms_20261001`.
The local executor and its journal are in `/private/tmp/customer-cms-local-layer`.
This two-database cutover is not a distributed transaction: on failure the server
must stay offline until actual database state and the journal are reconciled.
This local executor is not a hosted migration API.

Verification: 29 focused Dashboard tests and changed-source lint passed. Local
HTTP checks confirmed five placements read one shared revision, a save through one
placement is visible through another, stale writes return 409, missing login 401,
and a foreign site 404. Contact rules and legacy revision 3 were preserved; the
booking test restored its original settings at shared revision 3. Browser checks
confirmed four selector entries, the five-page list and the separate Enquiries
filter. Screenshot: `/private/tmp/fantasy-limo-shared-forms-20261001.png`.

Studio build (28 tasks), typecheck (44 tasks plus security types), lint and package
tests (40 tasks, retried at concurrency 2 after an autosave timing failure under
load) passed. Action runtime: 48 passed. Security: 35 passed, the unchanged staging
route-count assertion still fails. Dashboard repository-wide typecheck fails with
934 diagnostics; none reference this slice's changed sources. These results are
local acceptance, not hosted release acceptance.

Next: website email defaults and separate team/customer template drafts, followed
by AI proposals and the approved delivery/outbox path. Published outcomes, hosted
managed schema/runtime installation, reuse/new-form controls and explicit detach
remain separate acceptance work. No public redirects or email delivery enabled.


## Recovery after temporary files disappeared — 1 October 2026

On continuation, the previous `/private/tmp` worktrees, demo layer, database copies,
logs and screenshots were absent. The reported earlier acceptance remains a record
of that run; localhost was unavailable until the rebuild documented below. Dashboard commits
were already pushed. Studio's complete staged index survived in the repository
metadata and was recovered without reconstructing source code from conversation.
Dashboard now lives at `/Users/paulgiurin/Documents/Projects/customer-cms-development`
(with `.worktrees/customer-cms` as a symlink). Studio remains at
`dashboard/.worktrees/studio-customer-forms`. A staged patch/index backup is retained
in `tmp/cms-recovery-20261001` under the Dashboard root. Keep these active workspaces.

The required recovery was to rebuild the isolated Fantasy Limo fixture from an
authorized read of the saved checkpoint/media and reapply reviewed explicit
adoption; this is now completed in the restoration checkpoint below. Do not redirect the local UI at production storage
or silently invent replacement customer records. The lost local adoption backup
and screenshot paths above are historical evidence references, not available files.


## Durable local demo restored — 1 October 2026

The local demo is running again at
`http://127.0.0.1:3044/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
Its layer, database, media, scripts and private backups now live outside temporary
storage at `/Users/paulgiurin/Documents/Projects/customer-cms-demo`.
`README.md` there records restart, checks, backup and sign-in recovery.
Run its `start.sh` to restart the owned local PostgreSQL instance and Nuxt.
Keep database/media files outside the watched `layer/` directory.

An authorized read-only copy restored 75 saved pages and 109 hash-verified images.
No production enquiries, customer users or sessions were copied. The local
Postgres schema is a selected demo projection, not hosted migration acceptance.
The reviewed adoption planner created four definitions over eight placements;
Booking enquiry shares one definition across five pages. The rebuilt checkpoint
is `checkpoint_local_shared_forms_rebuilt_20261001`. Lost local draft history was
not recovered: Contact's wedding sample was explicitly recreated at revision 2.
Booking defaults are at revision 3 after a save/conflict/restore check.

HTTP acceptance passed for authenticated workspace/media reads, all five shared
placements, cross-placement writes, stale-write 409, missing-login 401 and foreign
site 404. Chrome verified four form entries, the five-page placement list, separate
filtered Enquiries, reload persistence, 18 loaded media thumbnails and Contact's
`wedding transport` redirect preview. Current `contains` matching is case-sensitive.
Screenshot: `customer-cms-demo/fantasy-limo-restored.png`.
Local backup: `customer-cms-demo/private/backups/2026-10-01T04-44-53.503Z/`.
Keep private credentials, copied data and dumps out of Git.

No production deployment or email delivery occurred. Website email defaults and
team/customer template drafts remain the next implementation slice. Published
outcomes and hosted schema/runtime installation are still pending.


## Team recipient inheritance — local slice, 1 October 2026

Implemented Forms → Website email defaults and shared form → Email recipients.
One site-scoped recipient draft contains the website list and explicit overrides
keyed by shared definition ID. No override means inherit; an explicit empty list
means no team recipients. Changing defaults preserves overrides. The UI shows the
inheriting form names, effective recipients, and unchanged custom forms. Removed
form overrides require explicit review/removal before saving; nothing is silently
discarded. Legacy placements inherit website defaults but do not offer overrides
until shared identity adoption.

Customer-owned private storage uses append-only `form_recipients_drafts` in the
separate `form-settings-migrations/0003_form_recipients_drafts.sql` catalogue.
Scope-bound Worker/router RPCs check record acknowledgements; Dashboard checks
current authority before and after storage, validates the saved checkpoint and
form definitions, and never replays uncertain writes. A site-wide expected
revision protects simultaneous edits to defaults and overrides. This intentionally
serialises these small configuration changes to avoid a mixed defaults snapshot.
No recipients are copied from the agency-managed email setup preferences.

Recipient lists are bounded, reject duplicate addresses and header controls, and
cannot contain sending switches. UI edits survive rejected saves; uncertain saves
require reload. In-app navigation/sign-out are locked while dirty or saving; the
explicit discard reload waits for both workspace and recipient reads. Browser
refresh/close still discards unsaved edits, disclosed beside the save controls;
no recipient data is persisted in browser storage and no native dialog is added.

Local schema installed after backup; no hosted migration, publish or email send.
Studio now lives at `/Users/paulgiurin/Documents/Projects/customer-cms-studio`;
`dashboard/.worktrees/studio-customer-forms` is a compatibility symlink. This keeps
Studio tools from inheriting the Dashboard root's unrelated Nuxt tsconfig.

The existing sender/forwarding preferences remain separate. Verified sender,
customer replies, template drafts, AI proposals and approved outbox delivery are
still pending. This slice completes team recipient draft inheritance only.

Recipient acceptance: 11 focused Dashboard tests and 39 focused Studio tests pass;
Studio build (28 tasks), typecheck (44 plus security types), package tests (40 tasks)
and action runtime (48 tests) pass. Aggregate Studio tests still fail the recorded
staging route-count assertion (35 security pass, one fail). Dashboard-wide typecheck
still reports 934 existing diagnostics, none in the modified sources; the
whole-repository check remains failing. Independent review verified the obsolete-override cleanup,
frozen expected revision and coordinated reload fixes without remaining blockers.

Chrome verified default save, inherited Contact display, explicit Contact override,
default changes preserving the override, duplicate-address rejection, dirty
navigation locks, stale-save edit retention and reload recovery. Saved drafts
survive a full browser reload. At 390px the document has no horizontal overflow;
viewport restored. Local HTTP checks additionally reject foreign definitions,
unknown delivery controls, missing login and foreign-site access. The example
addresses use `example.test`, and no emails were sent.

Evidence files are in the durable demo directory: `fantasy-limo-email-defaults.png`,
`check-recipients.mjs` and private test logs. Post-acceptance local backup:
`private/backups/2026-10-01T05-20-43.918Z/`. Example recipient revision 4 has website
`office@example.test` and Contact override `contact@example.test`; these are demo
values and must not be treated as customer-approved delivery addresses.
