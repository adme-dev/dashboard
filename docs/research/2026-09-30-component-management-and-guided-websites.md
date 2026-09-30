# Guided website creation and component management — R&D brief

Date: 30 September 2026. Status: product requirements captured; technical design proposed; implementation backlog open.

This document records the discussion about a Squarespace/Wix/Base44-style website product, guided industry templates, and a customer management workspace outside the visual builder and agency operations dashboard. It is the handoff for the next phase, not a claim that the proposed capabilities have shipped. The user requested that the R&D, login, enquiry access, outbound webhooks and AI component/data/admin relationship all be documented.

Related design: [ADR-010: Managed component contracts](../decisions/ADR-010-managed-website-component-contracts.md). Entry point: [Page Studio documentation](../page-studio/README.md).

## 1. Confirmed product requirements

- Customers can build and operate a website without understanding prompts, Workers, database schemas or the agency dashboard.
- Start with the business and its goals. Guided choices and prompt templates should cover common best practices and use cases across industries, including e-commerce, bookings, sales, finance, services and location-based businesses.
- A functional component includes its operational experience: data, settings, metrics, follow-up actions and an appropriate admin screen, as well as its visible website UI.
- A form has a submissions inbox, field/settings controls, post-submission behaviour, notification recipients, customer-response templates and metrics.
- A customer can log in outside the builder and view their own enquiries. Customer here means the website owner or invited team member; the visitor submitting a public enquiry is a different actor.
- Enquiries can be pushed to configured external systems through outbound webhooks.
- AI-created components must connect reliably to approved persistent storage and the customer management workspace. A generated visual form alone is not a complete functional component.
- Content, AI-generated/uploaded media, components and operational management should feel like one website product. Existing image generation/model selection/credits remain a separate implemented capability; this brief does not reopen their billing design.

## 2. Verified foundation and current gaps

Code baseline: Dashboard `a98b83a53c65fbb80da48e8a2348610d2c9d24bb`; Studio `50d372e1cb0bc92a661379866062dbe75a4539d0`. These observations describe source at those commits. Merged code, staging availability and production activation are separate facts. Older linked documents contain historical release checkpoints.

| Area | Existing foundation | Work still required for this experience |
| --- | --- | --- |
| Customer login | `/studio` requests an invited customer's magic link; `studio-auth` and portal authentication protect the workspace | Extend the existing identity flow to enquiry/component destinations, verify invitations, return paths, revocation and hosted login end to end; do not create a second account system |
| Independent workspace | `/studio/sites`, content, draft history and image credits | Website overview, Components and Enquiries navigation, plus operating controls outside the builder |
| Form entries | Agency **Manage site → Forms** lists entries, live/test filters and details | Customer-scoped inbox, filtering/pagination, operating status, search and component links; do not expose the agency endpoint to portal users |
| CMS | Scoped business content and generated collection administration; typed fields, revisions and schema permissions | A stable component-to-collection/admin association and appropriate workflow views rather than exposing raw storage concepts |
| Email | Agency/portal website preferences for sender, reply-to, team inbox and incoming forwarding | Actual delivery, verification, per-component rules, customer template editing, delivery history and suppression/retry handling; current preferences explicitly report sending/forwarding disabled |
| Redirects | Website URL redirects exist; form action/field mapping exists in Studio | Configurable, validated post-submit redirects and ordered conditions in the component workspace; URL redirects are not form redirect rules |
| Webhooks | The separate agency Leads subsystem has an outbound webhook adapter and dispatch machinery | A scoped component event contract, durable delivery integration and customer-facing configuration/history; existing Leads functionality does not establish Studio support |
| Metrics | Website analytics surfaces and scoped runtime/usage foundations | Component event definitions, attribution, denominators and customer-facing reports |
| AI components | Reviewed component/action/collection artifacts and scoped CMS preparation exist | A validated management contract, capability adapters, generation readiness checks and a complete managed-component lifecycle |

Source anchors:

- [Customer login](../../app/pages/studio/index.vue), [route guard](../../app/middleware/studio-auth.ts), [standalone site list](../../app/pages/studio/sites/index.vue), [workspace shell](../../app/layouts/studio.vue).
- [Agency submissions UI](../../app/components/page-studio/FormSubmissionsWorkspace.client.vue), [site management tabs](../../app/components/page-studio/PublishingWorkspace.client.vue).
- [Generated collection UI](../../app/components/page-studio/GeneratedCollectionsWorkspace.client.vue), [collection schema](../../shared/pageStudio/collectionDefinition.ts), [managed CMS contracts](../../shared/pageStudio/cmsManaged.ts).
- [Email implementation boundaries](../page-studio/customer-email-configuration.md), [existing Leads webhook adapter](../../server/utils/leads/destinations/webhook.ts).
- Studio at the pinned baseline: `packages/protocol/src/builder-feature.ts`, `collection-definition.ts`, `public-form-action.ts`; `packages/overlay/src/website/form-action-editor.ts`.

## 3. Intuitive creation journey

The customer sees **Tell us about your business**, selects what visitors should accomplish, and reviews a proposed website. Prompt templates operate behind this interaction; free-text instructions remain available.

1. Establish business name/type, audience, services/products, locations/service areas, language, currency and timezone only where relevant.
2. Choose outcomes: enquiries/quotes, appointments, online purchases, subscriptions, location discovery or customer self-service.
3. Suggest pages and functional components with a plain-language explanation of each.
4. Ask only for missing facts needed by those components: recipients, availability, service duration, addresses, pricing or provider connections.
5. Generate a preview and management configuration with example data clearly marked as examples.
6. Show a setup checklist. Distinguish **Draft**, **Needs setup**, **Ready to test**, **Ready to publish**, **Live** and **Attention needed** using verified underlying state.
7. Run a test transaction and preview its inbox entry, response and delivery results before normal publishing.

Template quality defaults should include responsive layouts, accessible labels and keyboard paths, clear validation and recovery, page titles/metadata, appropriate image alternative text and honest loading/empty/error states. These are acceptance criteria to verify, not guarantees supplied by a prompt alone.

Readiness is server-derived. An AI response or completed visual design cannot mark storage, email, checkout, booking capacity or a webhook as connected.

### Template composition

Combine **business type + visitor goal + reusable capabilities**, instead of maintaining an unrelated prompt for every industry combination. Template versions should declare required facts, component contracts, suggested copy, sample data, setup questions, readiness checks and acceptance scenarios.

| Journey | Suggested components and admin data | Facts the business must supply |
| --- | --- | --- |
| Trades / professional services | Services, locations, quote request, enquiry inbox | Service areas, services, recipients, response expectations |
| Salon / appointment business | Service catalogue, availability, booking, confirmations | Durations, timezone, staff/resources, cancellation rules |
| Retail / e-commerce | Products, stock, cart/checkout, orders | Prices, currency, fulfilment, tax configuration and payment provider |
| Sales / lead generation | Landing page, qualification form, routing, CRM webhook | Qualification criteria, destinations, consent wording |
| Finance / advisory | Service information, consultation booking, enquiry intake | Approved claims, required disclosures, approved data fields and destinations |
| Hospitality / locations | Addresses/maps, opening hours, menus, reservations | Location details, exceptions, reservation rules and capacity |

Finance is an industry variation, not permission to generate financial decisions or invent rates/disclosures. Taxes, payment terms, legal text, prices and customer promises remain explicit owner-provided or reviewed facts. Address controls must support the selected country; service areas, billing addresses and venue addresses have different purposes. Online sales and bookings require their own transaction/concurrency acceptance, beyond a visual template.

Proposed first three complete journeys: **enquiries and quotes**, **bookings**, then **online sales**. Broader industry templates reuse these capabilities. This sequence is a recommendation, not a commitment that all industry workflows already exist.

## 4. Customer login and management workspace

Reuse the existing `/studio` sign-in and portal account model. An invited owner/team member signs in, sees assigned websites and opens the website's operational workspace. Public signup, custom product hostname/branding and accounts for a website's shoppers/visitors are separate scope decisions; they are not implied by an owner enquiry inbox.

Proposed navigation:

```text
My sites → Website
  Overview
  Enquiries                  aggregated across permitted form instances
  Components → Contact form
    Overview / Entries / Settings / Notifications / Integrations / Metrics / Activity
  Content
  Media
  Team and access
  Open page builder
```

Proposed routes such as `/studio/sites/:siteId/components/:instanceId` and `/studio/sites/:siteId/enquiries` are design targets, not existing URLs. Preserve a safe, same-origin return destination through login and expired-session recovery. Inspect the existing allowlist rather than widening authentication redirects indiscriminately.

Map capabilities to existing roles after an access audit: read enquiries, update operating status, export, configure notifications/webhooks, manage team members, edit schema, publish and manage billing must be independently enforceable. UI visibility is not authorization. Every request derives and checks the current tenant/customer/business/site/environment and membership server-side; revocation must affect active sessions and queued deliveries where relevant.

An enquiry detail view should show submitted answers and labels, component/form and page, received time, test/live status, operating status, notes/assignment where supported, and notification/webhook delivery history. Preserve the submitted record; subsequent operational annotations must not silently rewrite the original answers. Search, pagination, export and attachments need their own limits and permissions. All screens need usable empty, loading, denied, expired-session, conflict and delivery-failure states, including mobile and keyboard access.

## 5. The AI component-to-admin/storage contract

The central difficulty is that visual generation, durable storage and an operating dashboard are different concerns with a shared identity and lifecycle. The proposed solution is a **versioned managed-component contract** interpreted by trusted platform code, extending existing component/action/collection contracts.

A generated feature proposes the following bundle; these are conceptual fields, not a new implemented wire schema:

| Contract area | Required meaning |
| --- | --- |
| Identity | Definition/template ID and version; stable installed component instance; explicit page placements |
| Render contract | Website fields, layout, accessibility and supported editor properties |
| Configuration | Typed editable settings, defaults, validation and who may change each setting |
| Data contract | Typed fields with stable IDs, record ownership, indexes/query needs and retention classification |
| Storage binding | Native-issued collection/storage reference and readiness receipt; never an AI-provided database credential |
| Admin presentation | Allowed list columns, detail fields, filters, status workflow and supported actions rendered by trusted UI |
| Actions and events | Named supported operations, input/output schemas and versioned event types |
| Integrations | Required capabilities, configuration state and private connection references |
| Metrics | Defined events, aggregation rules and visibility; no arbitrary SQL from a prompt |
| Lifecycle | Draft/review/activation, compatibility, migration, archive, rollback and retained historical definitions |

Example: “Create a quote form” proposes the visual form, a scoped enquiries collection/binding, approved submit action, inbox configuration, owner notification and customer-response drafts, optional outbound event and metric definitions. Unsupported capability requests are explained as unavailable or needing review. A decorative component need not receive an empty database or inbox; show only the capabilities it actually declares.

### Responsibility boundary

- **AI:** proposes copy, presentation, typed fields, supported rules and management metadata, plus test scenarios.
- **Trusted platform:** validates the proposal, authorizes provisioning, resolves storage, enforces access, renders approved admin controls and executes delivery/metrics adapters.
- **Website owner:** supplies business facts, approves recipients/destinations and publishes or activates within their permissions.
- **Agency/operator:** manages provider setup, allowed capabilities, migrations, exceptions and recovery within existing roles.

The AI must not generate executable admin pages with ambient authority, run arbitrary SQL/migrations, choose another customer's storage, embed secrets or grant itself capabilities. Custom executable behaviour uses the existing reviewed action/Worker path and explicit capabilities; it is not automatically trusted because it accompanies an attractive component.

### Identity, instances and changes

Separate reusable definitions from installed instances and page placements. Two independently installed contact forms should not share an inbox or recipients by accident. Multiple placements can intentionally point at one instance when the owner chooses shared processing. Removing a page placement does not delete submissions or cancel unresolved deliveries. Duplicating a component must make its data/integration inheritance explicit.

Capture immutable form definition, schema version, active configuration version, page/placement and publication identity with each accepted submission. Stable field IDs survive label changes. Older entries remain readable after edits; historical payloads are not reinterpreted using a new schema. Breaking changes need compatibility/migration review and rollback evidence. Archive/deletion and retention are separate operations.

Visual/page changes follow the existing draft/review/publication path. The design must explicitly decide which operational settings can take effect immediately. Proposed default: authorized recipient/routing changes are versioned and audited; queued deliveries retain their recorded configuration version, while current revocation/disable policy can stop them. Replaying an old event against a new destination requires an explicit, logged action.

## 6. Storage, submission and provisioning behaviour

Keep the existing native management authority and scoped content router/collection/runtime boundaries. The precise owner of new enquiry records and delivery outbox tables requires an implementation spike: inspect existing form storage and D1/collection semantics before selecting a store. This brief does not mandate one database or Worker per generated component, and sandbox filesystem state cannot be the source of truth.

Recommended submission path:

```text
Published form → authenticated publication binding + input/abuse validation
               → durable scoped submission and durable event/outbox
               → receipt + configured visitor success behaviour
               → asynchronous notification / customer email / webhook workers
Customer login → scoped management API → submissions and delivery status
```

- Public submission authority comes from the active publication and native instance binding, not caller-supplied tenant or collection IDs. Anonymous submit permission does not grant read/list access.
- Require bounded validated fields, idempotent submission identity, test/live separation and appropriate challenge/rate controls.
- A successful receipt means the record is durably accepted. It must not claim email/webhook delivery already succeeded. On storage failure, do not show a false success or enqueue a detached notification.
- Persist the record and outbox atomically where they share a store. Across services, use a durable, idempotent handoff and reconciliation; no assumed cross-database transaction or fragile write-then-fire-and-forget queue call.
- Provisioning must be recoverable: validate → authorize → prepare storage/admin binding → verify → activate. Failed provisioning remains “Needs setup”; retries cannot create duplicate collections or leave a falsely live form.
- Implement retention, export/deletion and attachment handling deliberately. Delivery logs and analytics should minimize stored personal data; access to records does not automatically grant integration-secret access.

## 7. Form settings and follow-up

The component workspace should expose field labels/types/required rules, safe validation, submit text, consent/help text, success message and optional post-submit redirect. Conditional routing/redirects should use typed conditions on known field IDs, an explicit order, a default fallback and a preview using test inputs. Redirect targets need a safe destination policy; never accept an arbitrary visitor-supplied redirect URL.

Distinguish three email concepts:

1. **Team notification:** send the business an enquiry summary or secure link, with approved recipients and optional routing conditions.
2. **Customer acknowledgement:** a versioned template sent to the validated submitted email field, with sender/reply-to, subject, approved variables, preview and a test-send workflow.
3. **Mailbox forwarding:** inbound mail routing between addresses; this is separate from form submission notifications and requires its own provider/domain/destination setup.

Templates should escape substituted values, restrict template logic, distinguish test/live sends and show delivery outcomes. Provider verification, retry deduplication, bounce/suppression handling, authenticated provider events and abuse controls must precede activation. Reuse existing website email preferences as defaults where appropriate; saving preferences is not evidence of connected sending. Customer email, webhook and redirect failures must not lose the original enquiry.

## 8. Outbound webhook requirement

The owner can configure a supported HTTPS destination, choose events, map permitted fields, run a synthetic test, see attempts and disable/retry deliveries. This is an outbound push from the website product; importing enquiries through an inbound webhook is a separate capability.

Proposed initial event: `enquiry.created`. The final versioned envelope should identify event ID, event version, occurrence time, scoped site/component instance, submission ID, schema/configuration version and an explicitly selected payload. Never expose internal credentials or rely on a payload tenant ID as destination authority.

Delivery design requirements:

- Durable outbox and at-least-once delivery with stable event/delivery identity; document consumer deduplication. Do not promise exactly-once effects in a third-party system.
- Versioned HMAC signature over timestamp and raw body, receiver verification guidance, replay window and supported key rotation; secrets remain server-side and redacted.
- Bounded timeouts/payloads, retry backoff, bounded `Retry-After`, a terminal failed state and explicit operator/customer replay. Treat rate limits, network errors and permanent errors deliberately.
- Record attempts, response status and redacted error summary. Keep full customer payloads out of routine logs.
- Enforce destination ownership/access, safe public egress and protection against private/reserved addresses, DNS rebinding and redirects on every attempt. Decide on an enforceable Cloudflare egress/connector strategy in a spike; hostname string checks alone are insufficient evidence.
- Prevent custom headers from overriding platform signatures/identity. A webhook destination must not receive data from another site/account because an integration ID was guessed or moved.
- Disabling a destination stops new sends and has defined behaviour for queued attempts. Delivery retries cannot duplicate the stored enquiry or resend unrelated emails.

The existing Leads adapter is a research/reuse candidate, not a drop-in security approval. Review its redirect behaviour, DNS/IP enforcement, signature/replay contract, identity model and retry integration before reuse. Do not modify the agency Leads product merely to add a Studio destination.

## 9. Metrics and operations

Define what constitutes a component view, start, attempted submission, durable acceptance and conversion. Establish the denominator, time window, deduplication, bot/test exclusion, timezone and attribution before displaying percentages. Provider acceptance, email delivery and a completed enquiry are different events. Respect applicable consent settings and avoid putting answer content into analytics events.

The component should expose health and actionable next steps: disconnected storage, rejected input, pending delivery, failed webhook, unverified sender, expired connection or missing setup. Show only relevant controls, with capability-based permissions. Bookings add availability and capacity; commerce adds order/payment state and fulfilment; finance-specific workflows must use reviewed domain adapters rather than inventing privileged generic actions.

## 10. Implementation backlog and acceptance gates

All tasks below are **open**. Documentation completion does not complete an implementation task. The form/enquiry journey is the proposed first vertical slice.

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

Cross-cutting tests: exact site/environment scoping; reader versus editor/integration-admin permissions; immutable submission data; bounded inputs; retries/concurrent edits; configuration upgrades; storage failure; queue failure; provider ambiguity; deletion/retention; preserved existing CMS, media, publication and QR/navigation behaviour.

Before any feature is described as live, record tested source, current main, deployment targets/IDs and hosted evidence. Update the public feature pages only when implementation status supports the claim. This R&D change makes no marketing claims, migrations, deployments, provider connections or outbound test sends.

## 11. Open decisions and next handoff

- Exact storage adapter and transaction/outbox boundary for each existing form type.
- Which existing roles may read enquiries, export, configure destinations, change schema and manage memberships.
- Definition/instance/placement reuse semantics and migration of existing forms without losing history.
- Operational settings that apply immediately versus requiring a website publication; treatment of queued events after reconfiguration.
- Supported redirect destination policy, webhook connector/egress strategy, retry limits and retention windows.
- Invitation provisioning, optional future self-signup and future visitor/customer accounts.
- Email provider verification flow, sender ownership, consent handling and support escalation.
- Initial template catalogue, languages/countries, metrics definitions and industry-specific acceptance.

Proceed with RND-01 and RND-02 before implementation. Then deliver one complete journey: **owner login → create/configure a form → visitor submits → owner sees the enquiry → webhook delivers with visible status**. Add customer/team email activation when provider readiness is demonstrably complete. This proves the shared architecture before expanding the industry catalogue.
