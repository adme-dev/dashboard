# Customer CMS standards and delivery sequence

Date: 30 September 2026. Status: confirmed product scope with proposed implementation standards. This document does not indicate shipped functionality.

Inputs: [user requirements and backlog](../research/2026-09-30-component-management-and-guided-websites.md), [official competitor research](../research/2026-09-30-website-cms-competitive-research.md), [ADR-010](../decisions/ADR-010-managed-website-component-contracts.md).

## Product boundary

The CMS is the customer's website management application, reached through independent `/studio` login. Page Studio remains its visual editing tool. Pages, media, forms, blog/gallery posts, SEO, analytics, contacts, team access, newsletters and installed business capabilities belong in one coherent product. The agency dashboard is not the required customer entry point.

The user confirmed customer-owned database storage. Proposed implementation: native services authorize access and resolve the customer's provisioned database; customer content and operational data are read and written there. Native identity, infrastructure authorization and platform billing remain control-plane concerns. This exception does not authorize duplicate operational records in shared agency tables. An export/backup and migration policy must make ownership practical, not merely a label in the UI.

## Source audit and migration boundary

Baseline: Dashboard `a98b83a53c65fbb80da48e8a2348610d2c9d24bb`, Studio `50d372e1cb0bc92a661379866062dbe75a4539d0`.

| Existing source | Finding | Required treatment |
| --- | --- | --- |
| [Native site operations](../../server/utils/pageStudio/siteOperations.ts) | Agency assets, submissions and analytics read shared native tables; submissions are reconstructed from audit events | Do not expose these endpoints as the new customer database CMS. Identify legacy records, migration scope and cutover/reconciliation before adopting them. |
| [Business content authorization](../../server/utils/pageStudio/businessContent.ts), [managed CMS consumers](../../server/utils/pageStudio/cmsConsumers.ts) | Existing trusted scope, memberships and managed content routing provide the authorized entry point | Extend these boundaries; browser input cannot choose a database, worker or tenant. |
| Studio `services/business-content-worker/src/worker.ts` at the baseline | Scoped D1 binding and content/form/booking/outbox stores exist | Trace public acceptance through active routing and management reads before reuse. The existence of a store does not prove the managed route exposes it. |
| [Collection definition](../../shared/pageStudio/collectionDefinition.ts) | Current generated collection fields are primitive text, integer, boolean, date, instant, decimal and enum | Rich text, asset references, relationships and ordered gallery media require protocol, validation, renderer and migration work; do not pretend a text field is a complete blog editor. |
| [Standalone shell](../../app/layouts/studio.vue), [site list](../../app/pages/studio/sites/index.vue) | Independent entry already exists | Add site management navigation and scoped adapters without a second login system or duplicate visual editor. |

RND-01 is partially researched, not complete. Its remaining output is a per-capability writer/reader map, route availability, historical-data inventory, ownership decision, migration/rollback procedure and hosted two-customer proof. Inventory pages/manifests and media separately: customer-owned metadata may reference immutable published artifacts, but the database and deployment history must agree on version authority. Never silently switch an existing site's source of truth.

## Common capability contract

Every functional component declares a stable definition/version, installed instance, page placements, typed configuration, data binding, allowed actions, permissions, management presentation and lifecycle. An AI proposal cannot provision arbitrary infrastructure or mark itself ready. Trusted code verifies binding and dependencies. “Used on” connects records/settings back to page placements.

Support Draft, Needs setup, Ready to test, Ready to publish, Live and Attention needed only when underlying evidence supports them. Keep visual publication and operational configuration revisions explicit. Archive preserves records according to retention policy; removing a page does not erase enquiries. Replication, export and integration delivery must identify their authoritative source.

## Minimum standards by area

| Area | Required behaviour | Acceptance evidence |
| --- | --- | --- |
| Pages and navigation | Page title/slug, navigation state, homepage, preview, publication/version history and safe redirects | Saved metadata survives reload; published version matches receipt; changed slug follows approved redirect behaviour; draft is not publicly exposed. |
| Blog and structured content | Title, unique slug, sanitized rich text, excerpt, cover asset, author, categories/tags, draft/review/publish/archive, scheduling in site timezone, history | Author can draft without publishing; scheduled job is idempotent across retries/timezone transitions; references and public index/detail templates resolve; old revision remains readable. |
| Gallery posts | Ordered asset references, cover, captions/alt text, title/slug, optional description/taxonomy and publication state | Reordering persists; inaccessible/deleted assets cannot leak; keyboard/mobile gallery works; ordinary media deletion reports usage. |
| Media | Upload, reuse and existing AI generation; ownership, alt text, dimensions/type, provenance and page/content usage | A customer cannot attach another customer's asset; unused versus referenced deletion is explicit; generated/uploaded assets use the same picker. |
| Forms and enquiries | Field schema, entries, status/assignment/notes, conditional success outcomes, email templates, integrations, metrics and retention | One durable submission appears once in both site and per-form inboxes; failures are visible; historical answers survive field changes; anonymous users cannot list entries. |
| Contacts and newsletter audiences | Contact identity, lists/tags, consent purpose/source/text version/time, pending/confirmed/unsubscribed/suppressed states and export | Enquiry acceptance does not opt in; signup works without an account; repeat requests are idempotent; unsubscribe/suppression blocks queued marketing sends; provider events reconcile safely. |
| Website members | Signup/sign-in/recovery, verification where required, account status, roles and own-record access | Visitor accounts never gain CMS rights; blocked/deleted accounts lose access; one member cannot read another member's orders/bookings. |
| Paid subscriptions | Provider-linked plan, verified lifecycle events, entitlement, cancellation/expiry policy and self-service | Form submission or client-supplied payment status cannot grant access; duplicate/out-of-order events reconcile; cancellation and marketing unsubscribe remain independent. |
| Team and access | Site invitations with expiry/revoke, role/capability management, audit, session revocation and owner continuity | Viewer, content editor, publisher, enquiry operator and integration/billing administrator boundaries are tested; role reduction affects active access; no accidental last-owner removal. |
| SEO | Content-type defaults plus page/item overrides for title/description, canonical, robots, social image and structured data; sitemap/redirect integration | Rendered output matches saved and published version; private/draft pages stay protected; noindex is not treated as authentication; AI does not invent business facts. |
| Analytics | Site/component scope, defined events and denominator, time range/timezone, test/bot handling and privacy settings | Known fixtures produce expected counts; missing instrumentation is labelled unavailable, not zero; answer contents do not enter analytics logs. |
| Delivery and integrations | Durable outbox, approved destinations, signed webhook contract, retries, redacted attempts and controlled replay; verified email sending | Storage success is separate from provider delivery; retries cannot duplicate the entry; disable/revoke is respected; secret access and public egress are independently enforced. |

These are product acceptance standards, not legal-compliance certifications. Double opt-in, retention durations and country-specific wording need explicit configurable policy, rather than an AI-invented universal rule.

### Access and subscription vocabulary

Use separate records/concepts for team membership, visitor identity, contact profile, marketing consent, customer paid entitlement, and the website owner's platform/AI-credit subscription. Map capabilities onto existing roles after audit; the role names above describe required separation, not a replacement role enum. Customer profiles and visitor entitlements belong to their database; references to a shared identity provider must not duplicate credentials there.

### AI generation standards

Use business type + visitor goal + capabilities. Templates declare required facts, supported countries/languages, default data schema, admin screens, setup dependencies and test scenarios. AI drafts copy/layout/configuration; the owner supplies business facts and approves publishable content. Generation cannot claim bookings, checkout, delivery or billing is working because a visual component exists.

Preserve owner-edited values during regeneration. Show a proposed diff for changes to fields, rules and destinations. Reject unsupported capabilities and foreign references. A blog, gallery and enquiry form are initial contract examples; booking and commerce adapters need additional concurrency/payment invariants.

The [Base44 research](../research/2026-09-30-website-cms-competitive-research.md#base44-generated-applications-data-and-management) reinforces generating UI, data, permissions and management together, while keeping builder collaboration separate from live operational access. RND-02/RND-09 must expose that bundle for review. For RND-06/RND-07, distinguish simulation, isolated test delivery and real delivery/replay explicitly: a test label must never imply that no external effects occur. RND-03/RND-14/RND-15 must verify each actor's access, not just a successful administrator preview.

## Delivery sequence and backlog mapping

All delivery gates below remain open. Existing foundations may be reused after their source and access boundaries are verified.

| Order | Work | Existing / new backlog IDs | Completion gate |
| --- | --- | --- | --- |
| 1 | Database/source map, access matrix, versioned managed-component contract and legacy cutover design | RND-01, RND-02 | Customer database is authoritative; form and non-form contracts validate; rejected foreign references and migration/recovery paths are demonstrated. |
| 2 | Independent CMS shell, customer-scoped forms/inbox, real durable submission and safe form configuration | RND-03, RND-04, RND-05 | Owner login → test submission → same durable entry in CMS; reload, revocation and two-customer isolation pass. |
| 3 | Outbound webhooks, team/customer emails, operational insights and guided quote/enquiry template | RND-06–RND-09 | Destination test and failures are visible; retry/signature/abuse tests pass; email activation has verified provider evidence. |
| 4 | Pages/media integration, rich content, blog/gallery publishing and SEO | RND-12, RND-13 | Publish a post and gallery from CMS, bind to public templates, verify SEO/asset ownership and scheduling without opening the builder. |
| 5 | Team invitations/permissions and customer audience/member foundations | RND-14, RND-15 | Team versus visitor access enforced; invite lifecycle, contact deduplication, consent and unsubscribe tested end to end. Minimum inbox permissions are required already in order 2. |
| 6 | Bookings/orders and paid member subscriptions; more industry templates | RND-10, RND-16 | Verified transactional lifecycle and self-service; capacity/payment/access reconciliation proven. |
| Each slice | Hosted acceptance, documentation, truthful marketing and release receipts | RND-11 | Current-main source and exact deployment verified; existing CMS/media/publication/QR navigation regressions checked. |

Next implementation: finish the order-1 adapter map, then deliver order 2 as the first customer-visible slice. Do not scaffold all navigation as apparently working features backed by placeholder data or shared agency operational tables.
