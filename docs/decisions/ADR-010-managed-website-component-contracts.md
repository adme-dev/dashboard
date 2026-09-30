# ADR-010: Managed website component contracts

## Status

Proposed. The product requirement for components with settings, data and metrics is confirmed; this technical design still requires the RND-01/RND-02 validation described in the [R&D brief](../research/2026-09-30-component-management-and-guided-websites.md). No new runtime protocol or database layout is adopted by this documentation commit.

## Date

30 September 2026.

## Context

An AI-generated form is incomplete if it renders correctly but cannot persist enquiries, expose them to the authorized customer, configure follow-up or report delivery failures. The same problem applies to booking, product and other operational components. The visual editor and the independent customer workspace need to agree on identity, data, permissions and lifecycle.

The platform already has portal identities, standalone Studio login, reviewed component/action/collection artifacts, scoped content administration and runtime boundaries. Building a new account system, arbitrary AI-generated admin applications or unrestricted database access would duplicate or bypass those foundations.

## Proposed decision

Extend the reviewed artifact model with a versioned managed-component contract. A generated feature proposes typed presentation, configuration, data, admin-view metadata, supported actions/events, integration requirements, metrics and lifecycle information. Trusted native services validate and bind that proposal; the existing Nuxt UI workspace renders approved controls from it.

Reuse the existing customer identity and server-derived scope. Resolve storage through existing authorized adapters. The contract never grants permissions, carries database credentials or names a raw customer-supplied backend endpoint as authority. Custom executable behaviour remains on the reviewed action/Worker path.

The subsequent product discussion fixes customer-owned database storage as a requirement. Customer content, form definitions/entries, audience records and operational settings use that database as their authority. Scoped object storage may hold media/published artifacts referenced by customer-owned metadata. Platform identity, deployment authorization and platform billing remain explicitly separate control-plane services. Existing native agency data needs an adapter/cutover plan; it is not automatically the source for the new customer CMS.

Apply the contract to editorial capabilities as well as operational forms: blog posts, galleries and other collections need typed fields, media/relationship bindings, editorial permissions and publication history. Distinguish team roles, visitor membership, marketing consent and paid entitlements. See [CMS standards](../page-studio/customer-cms-standards.md) and [competitor research](../research/2026-09-30-website-cms-competitive-research.md) for scope and evidence. This clarification does not adopt an unvalidated runtime schema.

Distinguish reusable definitions, installed component instances and page placements. Bind every accepted enquiry to stable instance identity and immutable schema/publication/configuration versions. Preserve records across page edits, component removal and compatible upgrades.

Treat submission acceptance and external delivery as separate operations. Persist durable submission/event evidence, then dispatch notifications and outbound webhooks asynchronously with idempotency and visible status. Reuse Leads delivery ideas only after a scope and security review; do not assume that an existing adapter provides the new product boundary.

## Alternatives considered

| Alternative | Benefit | Reason not to select as the default |
| --- | --- | --- |
| Generate a custom admin app, API and schema for every component | Maximum flexibility | Repeated auth/security work, inconsistent UX, difficult upgrades and migration/recovery burden |
| Keep all settings and entries inside the page builder | Fewer initial navigation surfaces | Customers need to operate their business without loading the editor; staff/owner permissions differ from design permissions |
| Hand-build each industry's complete backend | Precise bespoke workflows | Duplicates common enquiries, notifications and delivery functions; industry breadth becomes costly |
| Generic database editor only | Reuses collection CRUD | Does not explain enquiry state, routing, response templates or delivery health in customer terms |
| Managed contract with trusted adapters | Reusable operating screens and explicit capability boundaries | Requires schema/versioning discipline, provisioning recovery and domain adapters for specialized behaviour |

## Consequences

- A capability is complete only when its storage, operational UI, permissions and acceptance tests work together; a generated screenshot is insufficient.
- Existing forms require an explicit adapter/migration plan. New identity fields cannot silently orphan earlier submissions.
- Unsupported AI requests produce an understandable limitation or reviewed extension proposal.
- Generic settings/list/detail UI can be shared; scheduling, checkout and other specialized transactions retain purpose-built logic.
- Template changes, operational configuration and published visual changes have separate, explicit versioning and activation semantics.
- Delivery is at least once across external systems. Stable event identity enables deduplication; exactly-once external effects are not promised.
- Costs, retention, migrations and per-capability metrics need implementation decisions before broad customer admission.

## Validation before acceptance

1. Map existing form submission storage, scope and delivery paths; identify the customer-database canonical record and durable outbox boundary, including legacy migration/reconciliation and rollback.
2. Prototype a form contract and one non-form contract using the current scoped collections and trusted admin renderer.
3. Demonstrate owner login, isolated inbox, durable submission, webhook delivery status and version-compatible record reads.
4. Prove foreign bindings/capabilities are rejected and partial provisioning cannot claim readiness.
5. Record accepted wire schema, storage ownership, compatibility policy and applicable role mapping in a follow-up implementation specification.
