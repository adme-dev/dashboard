# Form settings completion

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

Slice 1 now exposes the eight real Fantasy Limo forms, their saved fields and
placement, draft messages, fixed same-site redirects and ordered conditions.
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

The current saved Fantasy Limo manifest has eight independent form IDs:
- `/contact` and `/enquiries`: same four-field structure, separate IDs.
- `/bookings`: one 21-field quote form.
- `/book-1hour`, `/book-one-hour-limo-hire`, `/book`, `/free-limo-quote`,
  `/general-hire-quote`: same nine-field booking structure, five separate IDs.

This proves three structural groups, not three authoritative shared definitions.
The current dropdown lists placements, and now labels that explicitly. Identical
fields or names do not establish shared operational identity; do not auto-merge or
delete forms. Introduce reusable form definitions with explicit placements and
shared defaults. Adoption must preserve old IDs/submission attribution, review
configuration differences, and permit intentional independent copies. Future
catalogue shows one definition with “Used on N pages” and a placement list.

Email default inheritance, reusable-form linking and adoption are pending work;
the current outcome editor still saves per page/form identity. Templates, shared
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

Implementation evidence: Studio `packages/protocol/src/page.ts` currently defines
forms inside each page; `packages/protocol/src/validation.ts` validates leadForm
references only against that page's forms. Shared-definition identity and legacy
adoption therefore precede the email-builder storage rollout. Do not merely group
labels or copy settings between separate IDs and call reuse complete.

Required tests: AI/manual placement of an existing form produces another reference
and no new definition; explicit independent duplication produces a new identity;
shared template/recipient changes affect all placements; website defaults and
per-form overrides resolve consistently; other-site references fail; existing
submission IDs and originating page attribution survive adoption. Enforcement is
pending implementation and is now recorded in the repository's AGENTS.md.
