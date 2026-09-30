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

### 2.1 One website platform, two product entry points

Confirmed scope: support both a standalone website product and websites managed through XeroFlow Agency. Share the website/CMS services, component contracts and Page Studio; vary navigation, branding, onboarding and authorized commercial arrangements. A customer must not need an agency staff account to own or operate a standalone site.

| Concern | Standalone customer | Agency-managed customer |
| --- | --- | --- |
| Entry | Product-branded signup/login domain | XeroFlow website portfolio or invited customer CMS link |
| Onboarding | Verify identity, create customer workspace, become its owner, create first site | Agency selects an authorized client, creates/assigns a site and invites the client |
| Daily work | Customer CMS; open Page Studio for visual editing | Same customer CMS and editor services, with agency portfolio/support tools where authorized |
| Publishing | Owner or delegated publisher can review and release when checks pass | Existing agency review policy applies until explicitly changed by an authorized party |
| Commercial relationship | Customer pays for its platform plan and AI usage | Agency-managed or client-paid according to an explicit billing agreement |
| Data | Customer-owned website database | Customer-owned website database; agency access is a separate authorized relationship |

Model these concerns separately: **identity → customer workspace → membership/capabilities → site → environment/storage binding**. An agency support/management grant and a billing account/payer are separate relationships. Entry hostname, signup source, email domain and a browser-selected mode must never grant access or determine data ownership.

A workspace can have multiple sites and an identity can join multiple workspaces. Resolve an explicit active workspace on every request. Existing agency client IDs need a reviewed mapping to this model; do not silently put all standalone customers under a shared default agency/client. Shared platform identity and workspace authorization metadata belong to the control plane; website content, enquiries and operational records remain in the customer's database.

A standalone owner can later invite an agency, and an agency-managed customer can become self-managed through an authorized handover. Retain site IDs, data bindings, domains, history and asset ownership; audit the grant/revocation or ownership transfer. Billing changes require their own explicit transition, including outstanding obligations and credit ownership. Removing agency assistance must not accidentally delete the customer's site or expose other agency clients. Revoked grants invalidate future launches and management actions.

## 3. Customer journey and information architecture

**Standalone create:** sign up → verify email → complete business setup → create customer workspace and first site → CMS dashboard → Page Studio → preview/test → connect domain → publish.

**Agency create:** select authorized client → assign site/entitlement → invite customer → customer CMS dashboard → Page Studio → agency review → publish.

**Guided website creation:** describe the business → choose visitor goals → review suggested pages/capabilities → supply missing facts → preview → complete setup → test → publish.

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

### 3.1 Registration, step form and customer creation

The route names below are proposed additions to the existing `/studio` namespace, not claims of implemented screens. A branded product origin may expose clean public aliases while preserving a single route/service contract. Keep the existing agency registration separate.

```mermaid
flowchart TD
  A[Standalone product signup] --> B[Verified customer identity]
  B --> C[Resumable business setup]
  C --> D[Create customer workspace and owner membership]
  D --> E[Authorize plan or trial and create first site]
  X[XeroFlow agency: select client] --> Y[Assign site and invite customer]
  E --> P[Provision customer storage and starter content]
  Y --> P
  P --> F[Customer CMS dashboard]
  F --> G[Open Page Studio]
  G --> H[Save draft and preview]
  H --> I[Test content and business tools]
  I --> J[Verify custom domain and TLS]
  J --> K[Authorized review and publish]
  K --> F
```

Invited users accepting an already prepared website go directly to its dashboard after authentication. They do not re-provision its storage or repeat owner signup.

| Screen / proposed route | Customer action | Persistent outcome and recovery |
| --- | --- | --- |
| Signup `/studio/signup` | Enter name/email, accept applicable product terms; existing users sign in | Pending identity verification with expiry/resend/rate limits; no agency staff membership or paid entitlement |
| Verification `/studio/verify` | Redeem the short-lived sign-in/verification link | Verified identity and scoped session; expired/used links get a recoverable state; original invitation/return target remains allowlisted |
| Setup `/studio/onboarding`: About your business | Business/site name, industry, locale/timezone; conditional location/service-area fields | Revisioned onboarding draft bound to the verified identity; back/refresh/resume preserve answers |
| Setup: Website goals | Choose enquiries, bookings, sales, blog, gallery or other supported capabilities | Proposed pages/capabilities with prerequisites and missing facts; unsupported options are visibly unavailable |
| Setup: Starting point | Choose starter or describe the website; optionally add existing brand assets | Validated brief and starter reference; skip optional assets and domain connection |
| Setup: Review and create | Review facts, selected capabilities and applicable trial/plan terms | Idempotently create workspace + owner membership, then authorize entitlement and site; retry resumes the same operation |
| Website setup `/studio/sites/:siteId/setup` | Follow preparation; retry recoverable failures | Durable provisioning job and resource receipts; no false Ready state while database/content/runtime checks remain incomplete |
| CMS `/studio/sites/:siteId` | View setup checklist, manage content/enquiries/media/team | Scoped customer dashboard independent of the builder; only installed, available capabilities are active |
| Page Studio launch | Open visual editor, save draft, return to dashboard | Short-lived scoped launch to approved editor origin; customer/site/environment binding and draft history survive return |
| Domains `/studio/sites/:siteId/settings/domains` | Add hostname, follow DNS instructions, check verification | Persisted ownership/DNS/TLS state; connecting a domain does not itself publish |
| Review and publish | Preview and test, review changes, publish with the required capability | Release tied to exact source/artifacts, deployment and domain; failures retain prior verified live release |

Request only the facts needed at each step. Do not force a new user to choose “standalone versus agency” when the trusted entry or invitation already establishes the journey. In the CMS, make the active business/site and any agency management relationship visible. A “Back to XeroFlow” action appears only for users authorized to enter it.

“Create customer” means a workspace with a verified owner and explicit control-plane bindings. It is distinct from a visitor/member account, newsletter subscription, agency staff record and payment-provider customer. Identity creation must not automatically grant any of those other relationships. An existing email match never claims a workspace without verified authentication and an authorized membership/invitation.

Workspace/owner creation must be atomic; entitlement, payment-provider and infrastructure steps use retained operation IDs with reconciliation. Repeated clicks, network loss, multiple tabs and resumed sessions cannot create duplicate owners, sites, subscriptions or databases. Do not charge for a retried provisioning request. Define pending-account expiry and abandoned-draft retention before release; surface recoverable progress and support references without exposing credentials.

### 3.2 Product domain, editor domain and customer website domains

Use a branded product origin for signup/login/CMS. Keep XeroFlow's agency entry available. Give every site a scoped preview address, then allow the owner to connect their published website's custom domain. Webflow documents the same user-facing distinction between its staging subdomain and a customer-owned production domain ([official domain guide](https://help.webflow.com/hc/en-us/articles/33961334343827-How-do-I-connect-my-domain-to-Webflow)); our access and storage design remains our own requirement.

| Host purpose | Requirement |
| --- | --- |
| Product application | Trusted, configured origin for signup, CMS, help and branded authentication callbacks; exact brand/hostname remains to be chosen |
| XeroFlow agency application | Existing staff portfolio and client operations; shared service contracts do not confer staff rights on product customers |
| Visual editor | Approved editor origin with short-lived scoped handoff; no transferable agency session in URLs |
| Preview/published user content | Isolated origin boundary from privileged applications; customer/generated scripts cannot read application cookies or credentials |
| Customer custom website domain | Verified ownership, unique site/environment binding, DNS and TLS checks, primary-domain/canonical redirect behaviour, safe removal/reassignment |
| Customer-branded CMS hostname | Later optional capability; not required to launch the standalone product |

Do not share a parent-domain authentication cookie with untrusted previews. Explicitly allowlist authentication return URLs, editor launches and server-side trusted hosts; do not derive email-link origins from arbitrary request headers. Cross-origin authentication must use an audited one-time exchange or identity-provider redirect with state/replay protection. Preserve tenant/site scope after every handoff. A custom published domain never becomes an authentication or management origin merely because it is attached to a site.

Domain readiness and release readiness are separate. Support pending DNS/certificate issuance, conflicting ownership, provider outage and lost acknowledgements without claiming Live. Default preview indexing must be controlled; private previews need authorization, not just noindex. Exact Cloudflare domain routing/certificate configuration is an implementation decision validated against current provider documentation before changes.

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

The customer workspace foundation is now implemented on a separate review branch ([PR #602](https://github.com/adme-dev/dashboard/pull/602), initial source `e5f4ad3faa58d11e159b2e21c542058b2ef4efe5`). The [ownership mapping and cutover record](https://github.com/adme-dev/dashboard/blob/feature/customer-workspace-foundation/docs/architecture/page-studio-customer-workspaces.md) documents verified identity references, explicit workspace memberships and legacy client/agency grants. It is an internal service with no public signup or route cutover. Local validation passed 79 targeted tests, including 23 new PostgreSQL cases; migration 442 was applied twice only to a disposable local database. Server typecheck diagnostics match the unchanged baseline. No hosted or production activation is claimed.

The next gated slice is implemented in [PR #603](https://github.com/adme-dev/dashboard/pull/603), stacked on #602, source `60d946a303c887d3413eb601c46daad961bed2d4`. It adds dedicated standalone email verification/session authority, saved revisioned business setup, and atomic creation of one customer-owned workspace. The [signup architecture and activation record](https://github.com/adme-dev/dashboard/blob/feature/studio-customer-signup/docs/architecture/page-studio-customer-signup.md) describes exact scope and configuration. All 72 focused tests pass, including 36 real PostgreSQL cases; Chrome verified captured-mail sign-in, save/reload, keyboard and 390px use, completion/reload and logout. Both final-review findings were fixed with failing-then-passing regression tests. Migration 443 was applied only to disposable local PostgreSQL. Full local frontend typechecking remained resource-limited; the remote CI/build has since passed on this source. Public signup is disabled by default, no production migration or deployment occurred, and no website/customer content database or billing relationship is created by this slice.

The ownership/site prerequisite is now implemented in [PR #604](https://github.com/adme-dev/dashboard/pull/604), stacked on #603, source `2206543d6fac7afbe38cd517c094bafb223becce`. Its explicit business-owner registry preserves legacy agency IDs and allows a verified standalone workspace owner to retain one operator-approved preview site, with atomic entitlement/receipt creation and fresh authorization on retries. The [site ownership record](https://github.com/adme-dev/dashboard/blob/feature/studio-customer-site-ownership/docs/architecture/page-studio-customer-site-ownership.md) documents migration, rollback limits and remaining adapters. All 30 real PostgreSQL cases pass, including both competing ownership orders under read-committed and repeatable-read isolation. Final repository verification passed 15,136 tests plus 54 separately scheduled route-scan tests; 1,612 environment-dependent cases were skipped. The review concurrency finding was fixed RED→GREEN. One additional populated legacy upgrade fixture remains a minor follow-up before production migration. Migration 444 was applied/replayed only locally; server typecheck matches the existing 289-diagnostic baseline. The service has no public route, provider dispatch, customer database allocation, editor grant or billing charge. **RND-20 and RND-21 remain open**. Remote CI/build passed for this source. The follow-on provisioning adapter is described below; hosted resource receipts and the dashboard/editor journey remain outstanding. Public trial policy and activation remain separate decisions.

The internal native-session provisioning adapter is implemented in [Dashboard PR #605](https://github.com/adme-dev/dashboard/pull/605), stacked on #604, source `238a63c46980c1fa3f5129a7cbb97d78e34cfd50`, and [Studio PR #110](https://github.com/adme-dev/xeroflow-page-studio/pull/110), source `42086e444b9b95939d174796e32b47375d0795e0`. It retains one immutable approved staging intent, carries the distinct customer actor/original login, rechecks native authority before provider effects and fences first-checkpoint acceptance under the same transaction. Migration445 was applied/replayed only locally. The [native provisioning record](https://github.com/adme-dev/dashboard/blob/feature/studio-customer-provisioning/docs/architecture/page-studio-customer-provisioning.md) and [Studio contract](https://github.com/adme-dev/xeroflow-page-studio/blob/feat/customer-provisioning-session/docs/architecture/customer-provisioning.md) document rollout and recovery. Both review findings (lock order and accepted name boundaries) passed RED→GREEN regressions. All22 PostgreSQL cases pass; the final Dashboard suite passed15,158 +54 cases with1,612 environment-dependent skips. One initial unrelated timing failure passed in isolation and in the complete rerun. Server TypeScript remains the exact289-diagnostic baseline. Studio build/typecheck/security checks and5,606 Vitest +48 action-runtime cases pass; lint and remote CI status are retained on the paired PRs. Two independent local SQLite databases verify ownership/content/route isolation with provider fixtures; **hosted Cloudflare acceptance is not yet complete**. No public producer, Ready claim, editor grant, billing or production deployment is enabled. Next complete customer create/progress/dashboard routes, scoped editor handoff and the hosted two-customer receipt proof.

### 6.1 Onboarding audit checkpoint

- [`app/pages/auth/register.vue`](../../app/pages/auth/register.vue) and [`server/api/auth/register.post.ts`](../../server/api/auth/register.post.ts) create agency `team_members`; they are not the standalone customer signup flow.
- [`app/pages/studio/index.vue`](../../app/pages/studio/index.vue) and the [magic-link request endpoint](../../server/api/portal/auth/magic-link/request.post.ts) support existing invited customers. The site list currently has assigned-site navigation, not self-service account/site onboarding.
- The [portal site creation endpoint](../../server/api/portal/page-studio/sites/index.post.ts) and [site service](../../server/utils/pageStudio/sites.ts) already enforce customer scope and active entitlements. Extend/adapt these contracts after workspace mapping; do not bypass their limits to make signup work.
- [`PortalSetup.client.vue`](../../app/components/page-studio/PortalSetup.client.vue) supports proposals and provisioning but assumes agency review and portal return routes. Standalone owners need explicit approval/publishing capabilities and appropriate copy/navigation.
- [`DomainsWorkspace.client.vue`](../../app/components/page-studio/DomainsWorkspace.client.vue) and the [domain management contract](../../shared/pageStudio/domainManagement.ts) already expose domain verification state. Reuse these services after verifying standalone authorization and route/branding support.

The local entry-page check and reproducible startup instructions are recorded in [local onboarding review](../page-studio/local-onboarding-review-2026-09-30.md). Local rendering does not establish completed signup, database provisioning or hosted domain activation.

## 7. Acceptance and completion evidence

The first onboarding acceptance journey is **new verified owner → resumable business setup → one customer workspace/site → customer dashboard → scoped Page Studio launch → saved preview**. Repeat the shared dashboard/editor path for an agency-invited customer. The first complete operational journey is **owner login → configure a form → visitor submits → owner sees the durable enquiry → follow-up delivers with visible status**. Email activation additionally requires verified provider readiness.

Each relevant slice must demonstrate:

- Two isolated customers and environments; anonymous, visitor/member, operator/editor/publisher and revoked access cases.
- Durable reload/restart behaviour, idempotent retries, schema/configuration history, stale edits and partial provisioning recovery.
- Storage/queue/provider failures without false success, lost records or duplicate external effects from uncontrolled replay.
- Mobile/keyboard use, accessible forms and real empty/loading/error/denied states.
- Domain-specific publishing, consent, payment or booking invariants where that capability is delivered.
- Preservation of existing CMS, media, publication and established navigation including QR Codes.

Track task completion through linked source/tests and hosted evidence, not generated screenshots or documentation alone. Record current main, exact source commit, target, deployment ID and live verification separately. Update marketing pages only when shipped evidence supports the claim. No conversion uplift, latency target or launch date has yet been agreed; do not invent those commitments.

## 8. Delivery order and canonical backlog

All 24 tasks remain open. RND-01 has preliminary research but incomplete routing/migration validation. RND-17 now has a persistence/access foundation in review in [PR #602](https://github.com/adme-dev/dashboard/pull/602): atomic workspace ownership, explicit legacy client binding, scoped agency grants and 23 PostgreSQL cases. The standalone verified-identity adapter, baseline resumable step form and workspace-only portion of RND-18/19/20 are now in review in [PR #603](https://github.com/adme-dev/dashboard/pull/603). Legacy identity cutover, production migration validation, conditional onboarding questions, approved trial/plan/site provisioning, and hosted acceptance remain open. The internal owner registry and approved preview-site creation portion of RND-20 are in review in [PR #604](https://github.com/adme-dev/dashboard/pull/604). The internal customer-session provisioning/first-checkpoint portion of RND-21 is in review in [Dashboard PR #605](https://github.com/adme-dev/dashboard/pull/605) and [Studio PR #110](https://github.com/adme-dev/xeroflow-page-studio/pull/110). Next connect customer create/progress/dashboard/editor authorization and verify hosted customer database/runtime receipts; local isolation tests do not close hosted acceptance. IDs remain stable across the supporting documents. This is the only maintained task-status ledger for this PRD.

1. **Identity and ownership foundation:** RND-01 and RND-17 — map current stores/identities and define customer workspace, agency grants and payer relationships. Validate on two isolated fixtures before adding signup.
2. **Standalone onboarding:** RND-18–RND-21 — verified owner signup, resumable step form, idempotent customer/site creation and provisioning into the CMS. Existing invited customers converge on the same dashboard.
3. **First website release:** RND-22–RND-23 — brand-aware navigation/authentication, scoped editor handoff, save/preview and custom-domain publication. RND-24 validates delegated agency access and later handover.
4. **Customer CMS and forms:** RND-02–RND-05 — managed-component contract, private inbox, durable submission and safe settings; basic team permissions are required here.
5. **Follow-up and guided creation:** RND-06–RND-09 — webhook/email delivery, insights and a complete enquiries/quotes template.
6. **Editorial CMS:** RND-12 and RND-13 — pages/media integration, blog/gallery publishing and SEO.
7. **People:** RND-14 and RND-15 — full invitation/role lifecycle, contacts/consent and visitor/member features.
8. **Business transactions:** RND-10 and RND-16 — bookings/sales, paid memberships and further industry templates.

The first release can publish supported starter content. Selecting an operational feature does not claim its later CMS/delivery work is complete. Initial delegated access must be secure from the first agency path; RND-24 adds full handover rather than deferring authorization.

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
| RND-17 | Customer workspace, agency grant and payer mapping; depends on RND-01 | Fixture tests prove standalone ownership and agency-assisted access without a shared default tenant; existing client mappings and rollback reviewed |
| RND-18 | Customer signup/verification; depends on RND-17 | New owner verifies and resumes; expired/replayed links and duplicate signup are safe; no agency staff account created; unit/API tests and browser check |
| RND-19 | Resumable business step form; depends on RND-18 | Mobile/keyboard completion, back/refresh/resume and concurrent draft conflict verified; conditional questions and unavailable capabilities clear |
| RND-20 | Idempotent workspace/owner/site creation; depends on RND-17/RND-19 | Atomic workspace/owner creation; approved trial/plan checks; duplicate/lost-response/reconciliation tests produce exactly one intended site and billing relationship |
| RND-21 | Provisioning-to-dashboard journey; depends on RND-20 | Storage/runtime receipts verified before Ready; interrupted job resumes; two customer databases isolated; existing invite skips repeat provisioning |
| RND-22 | Dual-entry navigation, authentication and editor return; depends on RND-21 | Standalone and agency users open the same authorized site, save/reload a draft and return correctly; wrong-origin, cross-site and revoked handoffs rejected |
| RND-23 | Standalone domain and first-publish journey; depends on RND-22 | Ownership/DNS/TLS and primary-host output checked in authorized staging; pending/failure/retry states honest; owner release and agency review policy both enforced |
| RND-24 | Agency assistance and managed-to-self-service handover; depends on RND-17/RND-22 | Authorized grant/revoke/transfer preserves IDs, customer database and history; billing remains explicit; revoked agency cannot reopen sessions or queued management actions |

### 8.1 Implementation checkpoints and likely change areas

RND IDs describe deliverables; split larger deliverables into focused implementation plans before coding. Each plan should change one working journey, carry tests for its failure cases and reference this ledger rather than introducing another status list.

| Checkpoint | Likely code areas | Required evidence before proceeding |
| --- | --- | --- |
| Ownership mapped (RND-01/17) | Customer/portal auth utilities, entitlement/site services, control-plane schema/migrations | Existing agency fixture still works; standalone fixture has separate ownership; writer/reader and identity migration maps reviewed |
| Signup and step form (RND-18/19) | New Studio signup/onboarding pages, existing portal auth adapters, onboarding API/storage | Browser walkthrough with isolated email capture and test database; no production invitations or mail sent; resume and expired-link checks |
| First dashboard (RND-20/21) | Site creation service, setup/provisioning orchestration, Studio site overview | Repeated create/request and interrupted provisioning retain one workspace/site; actual scoped customer storage reads/writes |
| Editor and first release (RND-22/23) | Studio layout/launcher, standalone auth return handling, domain workspace/publishing services and separate Studio repository | Both entry journeys; draft saved/reloaded; exact editor origin; staging domain verification and publication receipt; unchanged agency/QR navigation |
| Agency handover (RND-24) | Membership/grant lifecycle, audit and billing relationship services | Revoked access fails server-side; authorized ownership/payer changes preserve live website continuity |
| Each later CMS slice | Areas specified by RND-02–RND-16 and supporting component contracts | Feature-specific API/unit tests, real browser operational flow, customer storage isolation and RND-11 release evidence |

## 9. Open technical decisions and scope boundaries

Before the corresponding capability ships, resolve storage adapters/outbox transactions and legacy cutover; role mapping; instance duplication; operational versus publication activation; safe redirect/egress strategy; provider onboarding; retry/retention limits; visitor identity provider; country/language support; and exact metric definitions. Public owner self-signup and dual standalone/agency entry are now in scope. Resolve the exact product name/hostname, identity-provider integration, workspace-to-existing-client schema mapping, starter trial/plan policy, supported payer transitions and standalone publication authority before their respective implementation slices. Customer-branded admin domains remain a later option.

This phase does not promise complete feature parity with any competitor, arbitrary app/backend generation, a replacement agency CRM, a general financial decision engine or an immediately available commerce/payment provider. Existing image billing design is not reopened. Broad product scope is recorded above; each capability ships through its acceptance gate.

## 10. Supporting evidence and design records

- [Competitive research: Squarespace, Wix, Framer, Gravity Forms and Base44](../research/2026-09-30-website-cms-competitive-research.md): 35 official sources; documented features distinguished from design conclusions. Our reference patterns are approachable publishing, central operations, structured content, complete forms, and generation that connects UI/data/workflows.
- [Original R&D brief](../research/2026-09-30-component-management-and-guided-websites.md): discussion history, detailed submission/delivery rationale and template examples.
- [Customer CMS standards](../page-studio/customer-cms-standards.md): source audit and detailed acceptance examples supporting this PRD.
- [ADR-010](../decisions/ADR-010-managed-website-component-contracts.md): proposed contract architecture and alternatives; validation remains required.
- [Documentation index](../page-studio/README.md): authentication, content, email, images/credits and release references.

These documents support this PRD. Update requirements and task status here first; amend affected technical evidence when implementation changes. Competitor documentation review was not a hands-on product test and does not establish their database tenancy or our security guarantees.
