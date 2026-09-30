# Page Studio Customer CMS and AI Website Platform — PRD

Status: confirmed product direction; implementation in progress, broader CMS not complete.
Owner: XeroFlow Product and Engineering.
Last updated: 30 September 2026.

## 1. Authority and purpose

This is the canonical product requirements document for the customer website CMS, guided website generation and managed components. It incorporates the customer discussion and research into Squarespace, Wix, Framer, Gravity Forms and Base44. Scope, priorities, acceptance and task status are maintained here. Supporting research records evidence and alternatives; ADR-010 remains a proposed technical design and is not automatically accepted by this PRD.

Give a business owner one place to create, publish and operate a website: pages, content, media, enquiries, people, business tools, SEO and analytics. Customers must be able to sign in independently of the agency operations dashboard and perform everyday management without opening the visual builder. Page Studio remains the visual editing tool within this product.

An AI-created functional component is complete when its visible UI, persistent data, settings, permissions, management screen, follow-up and relevant metrics work together. A generated form that only looks correct does not meet the requirement.

## 2. Users and access boundaries

| Actor or relationship | Required experience and boundary |
| --- | --- |
| Website owner | Manage assigned sites, team, website configuration and authorized billing; retain owner continuity. |
| Invited team member | Role-appropriate enquiry, content, publishing or integration work; no automatic access to all capabilities. |
| Builder collaborator | Edit design and approved artifacts; builder access and operational CMS access remain separately controlled. |
| Public visitor | Browse published content and submit permitted forms without an account; cannot list private entries. |
| Website member | Authenticate to visitor-facing features and access permitted own records or gated content; no implicit CMS rights. |
| Contact | A business relationship that may exist without login, marketing consent or a paid plan. |
| Newsletter subscriber | Purpose-specific consent and delivery/suppression state; signup need not require a member account. |
| Paying customer/member | Provider-verified paid entitlement, cancellation and expiry; separate from marketing consent. |
| Agency/operator | Authorized provisioning, support, recovery and release management with audit. |

One person can occupy several relationships. The website owner's platform subscription/AI credits are distinct from subscriptions their visitors purchase. Reuse existing owner/portal authentication; do not duplicate credentials into a content database. A shared identity provider may be referenced by customer-owned profiles and entitlements.

Server-side capabilities must distinguish read/manage enquiries, export, edit content/schema/design, publish, configure integrations, invite/change roles and manage billing. Hiding controls is not authorization. Expired/revoked membership must affect active access and relevant queued actions. Map these capabilities to existing roles during the access audit rather than adopting an unreviewed replacement role enum.

## 3. Customer journey and information architecture

**Create:** describe the business → choose visitor goals → review suggested pages/capabilities → supply missing facts → preview → complete setup → test → publish.

**Operate:** sign in at the independent Studio entry → choose an authorized website → see its CMS overview → manage content, enquiries and settings → open the visual builder when design work is needed.

| CMS area | Contents |
| --- | --- |
| Overview | Verified setup tasks, recent activity, enquiries and publication/delivery health. |
| Website | Pages/navigation, blog posts, gallery posts, other collections, media, SEO and publication history. |
| Business | Forms/enquiries, plus installed bookings, products/orders and paid subscription capabilities. |
| Audience | Contacts, website members, newsletter lists and consent. |
| Insights | Website/component analytics and delivery outcomes. |
| Settings | Team/roles, domains, email/integrations, privacy/retention, platform plan and AI credits. |

Use familiar names such as Enquiries, Posts and Appointments. Components remain a library/advanced view. Show installed capabilities progressively; do not present placeholder pages or unconnected services as working features. A decorative component does not need an inbox or database table.

All management screens need usable mobile and keyboard paths plus honest empty, loading, error, denied, expired-session, stale-edit conflict and unavailable states. Use the project's Nuxt UI v4 design conventions. Data records and metadata may be managed in the CMS; visual canvas, layout editing and component rendering remain in the separate Studio application.

## 4. Functional requirements

### 4.1 Guided creation and industry templates

Compose business type + visitor goal + reusable capabilities. Cover enquiries/quotes, appointments, sales, newsletters/memberships, locations and self-service, with industry variations for trades, professional services, retail, hospitality, finance and other businesses.

Templates declare required facts, typed data/configuration, management views, dependencies, suggested copy, example data and acceptance scenarios. Ask only relevant questions about services, audience, location/service areas, language, currency, timezone, recipients, availability and provider connections. Support country-appropriate addresses and distinguish billing, venue and service-area information.

The owner supplies or reviews prices, tax/payment terms, availability, legal disclosures and business claims. AI must not invent those facts or generate financial decision-making authority from a finance-themed template. Clearly label examples. Initial business journeys are enquiries/quotes, then bookings and online sales; editorial CMS work follows the sequence in section 8.

### 4.2 Forms, enquiries and component management

Provide a site-wide enquiry inbox and per-form views over the same records. Include bounded search/filter/pagination, live/test separation, detail, operational status, assignment/notes, permitted export, placement links and delivery history. Preserve original answers; corrections and annotations are versioned/audited.

Form management covers **Overview, Entries, Fields, After submission, Emails, Integrations and Insights**, with privacy/retention/archive settings. Fields have stable IDs, types, labels/help, validation, required/conditional visibility and appropriate consent controls. Submissions capture immutable schema/configuration/publication and placement identity so field renames do not reinterpret history.

After submission, offer a default message or approved destination with optional ordered conditions and deterministic fallback. Provide a preview using test inputs. Reject unsafe or visitor-controlled redirect destinations; do not place sensitive answers in query strings by default. Website URL redirects and post-form outcomes remain different settings.

### 4.3 Email, webhooks and workflows

Separate team notifications, customer acknowledgements and inbound mailbox forwarding. Customer responses need subject/body, approved variables, sender/reply-to, escaping, preview and controlled tests. Existing saved email preferences are defaults, not proof that sending or forwarding is enabled.

Webhooks need named destinations, event selection, allowed field mapping, conditions, synthetic tests, enable/disable, redacted attempt history and controlled retry/replay. The first proposed event is a versioned `enquiry.created` envelope. Credentials stay private; callers cannot select another customer's connection.

Show follow-up as trigger → conditions → actions, with delays where supported. Keep workflow/configuration versions tied to accepted events; define which authorized operational changes take effect immediately and which require publication. Distinguish simulation, isolated test delivery and real delivery/replay explicitly. A “test” label cannot hide external effects.

Verified sender ownership, suppression/bounce handling and provider readiness precede email activation. Delivery requires durable events/outbox, deduplication, bounded retries/timeouts, safe public egress, signature/replay protections and disable/revocation handling. Email or webhook failure cannot lose an enquiry. An acknowledgement means durable acceptance, not successful external delivery.

### 4.4 Pages, blog, gallery and structured content

Pages need title/slug, navigation/homepage settings, preview, SEO, publication history and safe URL changes. Content supports typed rich text, asset references and relationships, with public index/detail templates bound by stable IDs.

Blog posts need title, unique slug, sanitized rich text, excerpt, cover, author, categories/tags, draft/review/publish/archive, revisions and scheduled publication in the site timezone. Gallery posts need ordered assets, cover, captions/alt text, title/slug, optional description/taxonomy and publication state. Content editors can draft without permission to publish or alter design.

Validate scheduled retries and timezone transitions, stale edits, reference integrity and public/private boundaries. Drafts and private content must not leak into public rendering or feeds. Archive/removal and permanent deletion are separate operations.

### 4.5 Media, AI images and credits

Provide one reusable media library/picker for upload, existing assets and AI generation, including hero and section backgrounds. Retain approved model selection through Cloudflare AI Gateway and the existing image/credit work; expose availability, usage/credit state and generation outcomes honestly. Customer top-ups belong to the platform's per-customer billing/credit flow, not an assumed Cloudflare payment wallet for every end customer.

Generated and uploaded images use the same attach/reuse path. Preserve ownership, metadata, alt text, dimensions/type, provenance and usage references; protect cross-customer assets and explain referenced deletion. Billing-disabled demos/tests must be clearly identified and must not imply live payment collection. Existing image and credit staging evidence does not establish production activation of every capability.

### 4.6 Contacts, newsletters, members and subscriptions

Contacts support deduplication, lists/tags and links to business records without conflating distinct enquiries. Newsletter records preserve purpose, consent wording/version/source/time, pending/confirmed/unsubscribed/suppressed state and export. Repeat signup is idempotent; unsubscribe and suppression prevent queued marketing sends. Decide double opt-in and retention policies explicitly. Sending transactional email does not subscribe a person to marketing.

Website members need signup/sign-in/recovery, verification where required, profile/account status, roles and permitted own-record access. Team invitations require expiry/revoke and safe owner continuity. Account removal, role reduction and blocked access must be effective server-side.

Paid memberships/subscriptions need provider-linked plans, verified lifecycle events, entitlement, cancellation/expiry and self-service. Client-supplied payment status or form submission cannot grant paid access. Reconcile duplicate/out-of-order events. Booking capacity, fulfilment and payment authority require purpose-built adapters and acceptance beyond a generic form.

### 4.7 SEO, analytics and operations

Provide site/content-type SEO defaults with page/item overrides: title/description, canonical, robots, social preview/image, structured data, sitemap and redirects. Verify rendered published output; noindex is not authentication. AI suggestions require factual accuracy and owner review.

Define component views/starts/attempts/durable acceptances/conversions, attribution, denominator, window/timezone, deduplication and bot/test exclusions. Never conflate provider acceptance, delivery and business completion. Missing instrumentation is unavailable, not zero. Keep form answer content out of analytics and routine logs.

Show actionable setup/health states derived from evidence: Draft, Needs setup, Ready to test, Ready to publish, Live and Attention needed. Metrics and operations require scoped customer data just as records do.

## 5. Customer database ownership and component contract

Customer website content and operational records must use the customer's own database as their source of truth: content, form definitions/entries, operational settings, audience records and visitor entitlements. Media and immutable publication artifacts may reside in scoped object storage with customer-owned metadata/references. Shared platform authentication, infrastructure authorization and platform billing remain separately documented control-plane responsibilities; they do not justify a duplicate shared enquiry store.

Resolve storage through trusted, server-authorized tenant/customer/business/site/environment bindings. A browser or generated component cannot choose a database/Worker or grant itself access. Database ownership must include a practical export/backup/recovery and deletion policy. Do not use sandbox filesystem state as persistent authority.

The proposed managed-component contract includes definition/version, installed instance, placements, render/configuration/data schemas, authorized storage reference, management metadata, actions/events, integrations, metrics and lifecycle. AI proposes; trusted platform code validates, provisions and renders approved management controls. Unsupported capabilities produce a clear limitation or reviewed extension path. Arbitrary AI-generated admin code, SQL or credentials are not automatically trusted.

Independent installations do not accidentally share records or recipients. Intentional shared placements use one explicit instance. Duplication explains inherited data/integrations; removal of a placement does not delete retained records. Preserve owner edits during regeneration and show a proposed change summary. Breaking schema changes need migration/rollback evidence.

Submission and event/outbox persistence must be atomic where co-located, or use a durable idempotent handoff with reconciliation across services. Provisioning must recover without duplicate resources or false readiness. External delivery is at least once; receivers need stable identity for deduplication. Retention/export/deletion must account for attachments, events, provider-held data and audit requirements.

## 6. Current state and implementation constraints

Source baseline: Dashboard `a98b83a53c65fbb80da48e8a2348610d2c9d24bb`; Studio `50d372e1cb0bc92a661379866062dbe75a4539d0`. These are audit checkpoints, not future release bases.

Existing foundations include independent Studio login/site listing, scoped business content and generated collections, managed runtime boundaries, image/media/credit work, and publication/history. Customer email preferences explicitly do not establish activated delivery. A complete customer enquiry/component CMS is still open.

The audit found legacy agency assets, audit-derived submissions and analytics in shared native tables. Do not expose those as the new customer-database CMS by relabelling routes. Complete a writer/reader map, historical inventory and explicit cutover/reconciliation/rollback plan. Existing scoped D1 stores are candidates, but active public and management routing must be traced and tested.

Generated collection fields currently support primitive types. Rich text, media references, relationships and galleries need protocol, validation, migration and renderer work. Existing agency Leads delivery is a reuse candidate requiring scope, egress, signing and retry review. Preserve unrelated agency workflows and the separate Studio visual builder.

## 7. Acceptance and completion evidence

The first complete journey is **owner login → configure a form → visitor submits → owner sees the durable enquiry → follow-up delivers with visible status**. Email activation additionally requires verified provider readiness.

Each relevant slice must demonstrate:

- Two isolated customers and environments; anonymous, visitor/member, operator/editor/publisher and revoked access cases.
- Durable reload/restart behaviour, idempotent retries, schema/configuration history, stale edits and partial provisioning recovery.
- Storage/queue/provider failures without false success, lost records or duplicate external effects from uncontrolled replay.
- Mobile/keyboard use, accessible forms and real empty/loading/error/denied states.
- Domain-specific publishing, consent, payment or booking invariants where that capability is delivered.
- Preservation of existing CMS, media, publication and established navigation including QR Codes.

Track task completion through linked source/tests and hosted evidence, not generated screenshots or documentation alone. Record current main, exact source commit, target, deployment ID and live verification separately. Update marketing pages only when shipped evidence supports the claim. No conversion uplift, latency target or launch date has yet been agreed; do not invent those commitments.

## 8. Delivery order and canonical backlog

All 16 tasks remain open. RND-01 has preliminary research but incomplete routing/migration validation. IDs remain stable across the supporting documents. This is the only maintained task-status ledger for this PRD.

1. **Foundation:** RND-01 and RND-02 — source/ownership map, access matrix, contract and migration design.
2. **Customer CMS and forms:** RND-03–RND-05 — independent shell, private inbox, durable submission and safe settings; basic team permissions are required here.
3. **Follow-up and guided creation:** RND-06–RND-09 — webhook/email delivery, insights and a complete enquiries/quotes template.
4. **Editorial CMS:** RND-12 and RND-13 — pages/media integration, blog/gallery publishing and SEO.
5. **People:** RND-14 and RND-15 — full invitation/role lifecycle, contacts/consent and visitor/member features.
6. **Business transactions:** RND-10 and RND-16 — bookings/sales, paid memberships and further industry templates.

RND-11 applies to every release slice. Delivery order does not defer security, permissions or retention required by an earlier capability.

| ID | Deliverable / dependencies | Required acceptance |
| --- | --- | --- |
| RND-01 | Audit existing login, submissions, collections, actions and Leads delivery; produce a storage/identity adapter map | Existing form variants identified; no accidental second inbox/store or account model; deployment boundaries recorded |
| RND-02 | Define and validate the managed-component contract; depends on RND-01 | A form and a non-form example register management controls; unsupported capabilities and foreign storage references are rejected |
| RND-03 | Extend customer shell and scoped enquiry read/detail APIs; reuse existing login | Invited customer signs in and sees only authorized websites/entries; expired/revoked access and cross-customer IDs fail; no builder required |
| RND-04 | Durable submission/admin binding and instance lifecycle; depends on RND-02 | Public test submission appears once, survives restart, remains readable after field rename, and cannot be listed anonymously |
| RND-05 | Form configuration and safe conditional success behaviour | Field/rule validation, deterministic fallback, stale-edit conflict, test preview and unsafe redirect rejection |
| RND-06 | Durable outbox and customer-managed outbound webhooks; depends on RND-04 | Synthetic delivery, signed payload verification, timeout/replay/dedup, SSRF/redirect tests, disable/revocation and failed-delivery visibility |
| RND-07 | Team/customer email templates and provider activation | Verified sender, approved recipients, escaping, preview/test send, bounce/suppression, retries and no duplicate response on replay |
| RND-08 | Component metrics/activity and operating controls | Defined counters match known test events; test/bot exclusions, permissions, redaction and timezone behaviour verified |
| RND-09 | Guided enquiries/quotes template and end-to-end AI generation | Business brief produces working visual component + settings + inbox + approved actions; missing setup is explicit |
| RND-10 | Bookings and online-sales journeys, then industry variations | Booking concurrency, payment/order authority and domain-specific readiness verified independently; no visual-only claim of completion |
| RND-11 | Hosted acceptance, docs/marketing and release | Two isolated customers; mobile/keyboard paths; real login/submission/webhook/email tests in authorized test environments; production enablement recorded separately |
| RND-12 | Customer-database pages/navigation/media integration and legacy reconciliation | Authoritative metadata, published artifact references and asset ownership agree; usage-aware deletion; existing pages and generated images remain accessible |
| RND-13 | Rich content, blog/gallery publishing and SEO; depends on RND-02/RND-12 | Typed rich text/references, editorial roles, history, scheduling, public index/detail templates, ordered media and rendered SEO verified |
| RND-14 | Team invitations and capability-based roles; basic read/write isolation required already by RND-03 | Invite expiry/revocation, role changes and owner continuity; content/design/publish/enquiry/integration/billing rights enforced server-side |
| RND-15 | Contacts, newsletter consent and visitor/member access | Contact deduplication, purpose-specific consent, unsubscribe/suppression, member recovery and own-record access; visitor access never grants CMS access |
| RND-16 | Customer paid memberships/subscriptions and self-service | Provider-verified events, entitlement changes, duplicate/out-of-order reconciliation, cancellation and expiry; distinct from marketing consent and platform AI credits |

## 9. Open technical decisions and scope boundaries

Before the corresponding capability ships, resolve storage adapters/outbox transactions and legacy cutover; role mapping; instance duplication; operational versus publication activation; safe redirect/egress strategy; provider onboarding; retry/retention limits; visitor identity provider; country/language support; and exact metric definitions. Public owner self-signup and custom product hostname/branding remain undecided.

This phase does not promise complete feature parity with any competitor, arbitrary app/backend generation, a replacement agency CRM, a general financial decision engine or an immediately available commerce/payment provider. Existing image billing design is not reopened. Broad product scope is recorded above; each capability ships through its acceptance gate.

## 10. Supporting evidence and design records

- [Competitive research: Squarespace, Wix, Framer, Gravity Forms and Base44](../research/2026-09-30-website-cms-competitive-research.md): 35 official sources; documented features distinguished from design conclusions. Our reference patterns are approachable publishing, central operations, structured content, complete forms, and generation that connects UI/data/workflows.
- [Original R&D brief](../research/2026-09-30-component-management-and-guided-websites.md): discussion history, detailed submission/delivery rationale and template examples.
- [Customer CMS standards](../page-studio/customer-cms-standards.md): source audit and detailed acceptance examples supporting this PRD.
- [ADR-010](../decisions/ADR-010-managed-website-component-contracts.md): proposed contract architecture and alternatives; validation remains required.
- [Documentation index](../page-studio/README.md): authentication, content, email, images/credits and release references.

These documents support this PRD. Update requirements and task status here first; amend affected technical evidence when implementation changes. Competitor documentation review was not a hands-on product test and does not establish their database tenancy or our security guarantees.
