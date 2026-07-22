# PRD: XeroFlow Enterprise Platform

**Status:** Proposed

**Version:** 0.2

**Date:** 2026-07-22

**Owner:** Product and Platform Engineering

**Decision required:** Approve enterprise-first isolated-cell strategy before implementation planning

**Revision note (v0.2):** Added the Cloudflare Pages hosting-runtime constraint and required Workers migration decision (§8.6, §14.1, §22, §23); pulled design-partner commitment forward to a Phase 0 exit criterion; marked SCIM, SIEM streaming and legal hold as partner-negotiable pilot scope; recorded existing identity controls that reduce Phase 3 scope; added the delivery-capacity assumption.

## 1. Executive Summary

XeroFlow will evolve from a single-agency internal platform into a sales-assisted enterprise agency operating system. The first enterprise release will use an automated, isolated customer-cell model: every enterprise customer receives a separately provisioned application environment and data plane, while XeroFlow maintains one codebase, one release process, and a shared control plane.

This is not a code-fork-per-customer model. A customer cell is a repeatable infrastructure unit created from the same templates and promoted through the same release train.

The enterprise release must be governed by verifiable isolation, identity lifecycle management, auditability, recovery, support, and contractual operating controls. Public self-service signup and low-cost shared tenancy are explicitly deferred until those controls are proven.

### 1.1 Product decision

For the initial enterprise release:

- Default to a dedicated customer data plane.
- Provision customers through a sales-assisted workflow.
- Support multiple organisations or business units inside an enterprise account.
- Use enterprise SSO and automated user lifecycle management.
- Maintain one platform codebase and automated migration process.
- Add shared regional cells later for smaller customers; do not make them the enterprise launch dependency.

### 1.2 Relationship to the existing multi-tenancy PRD

This PRD supersedes the product strategy and deployment model in [`docs/PRD-multi-tenancy.md`](../PRD-multi-tenancy.md) where they conflict.

The earlier document remains valuable as an implementation inventory, particularly its audit of:

- request-scoped database routing;
- in-memory cache contamination;
- R2, KV, Queue, Durable Object and Vectorize isolation;
- worker and cron iteration;
- OAuth callback and webhook routing;
- email, AI and internal API tenant context;
- hard-coded ADME behavior;
- seed-data classification.

The following earlier assumptions are rejected:

- one shared deployment is the mandatory first release architecture;
- database separation alone provides sufficient isolation;
- the conversion is a small-file-count change;
- public signup and per-seat billing are launch-critical;
- tenant database routing can be treated independently from workers, caches, files and integrations.

## 2. Problem Statement

XeroFlow currently exposes enterprise-grade functional breadth—work management, finance, Xero, media, CRM, AI, client portals, files, communications and workflow automation—but its trust boundary is still that of a single agency.

Current constraints include:

- marketing trial calls to action route to login rather than customer provisioning;
- registration creates a user but not an enterprise or organisation;
- core business tables do not consistently carry an owning XeroFlow organisation;
- Xero tenant identifiers are used as accounting-connection identifiers, not platform tenancy identifiers;
- several caches, OAuth stores, jobs and scheduled processes have global singleton assumptions;
- identity is custom and lacks enterprise SSO, SCIM and central session administration;
- audit data is fragmented across feature-specific tables;
- no enterprise subscription, entitlement, SLA or deployment registry exists;
- infrastructure-level recovery is not expressed as tested customer-facing RPO/RTO commitments;
- the application is deployed as a single Cloudflare Pages project whose bindings, queue consumers and cron behavior partly depend on dashboard configuration, and whose deploy tooling intentionally pins exactly one production target.

Onboarding unrelated enterprises into the current production environment would create unacceptable confidentiality and operational risk.

## 3. Assumptions

This proposed PRD assumes:

1. The first target customers are medium-to-large agencies, agency groups, corporate marketing teams, franchise/dealer networks, or holding companies.
2. Enterprise onboarding is sales-assisted rather than anonymous self-service.
3. Initial enterprise volume is low enough that dedicated customer cells are economically viable.
4. The existing Nuxt 4, Cloudflare and Neon/PostgreSQL stack remains the foundation.
5. Australia is the initial deployment region, with future US and EU regional options.
6. Customers may contain multiple agencies, subsidiaries, brands or operating units.
7. Xero, advertising, CRM, email and AI integrations must be independently scoped per organisation.
8. XeroFlow will purchase rather than build SAML/OIDC and SCIM protocol support unless a later security review approves another direction.
9. Existing ADME production data becomes the first migrated customer cell.
10. No implementation begins until this PRD is approved and its open decisions are resolved.
11. Current delivery capacity is one operator with AI-assisted engineering, shared with ongoing agency operations and other product workstreams. The programme calendar is baselined on that capacity unless hiring toward the recommended team is approved (see the implementation task list, §2).
12. A design partner commitment — at minimum a signed letter of intent defining launch-critical modules and identity requirements — is obtained before Phase 1 investment begins, so that Phases 3 and 4 build only what the pilot contract actually requires.

## 4. Objectives

### 4.1 Primary objective

Enable XeroFlow to contract, provision, operate and support enterprise customers with demonstrable separation of customer data and operations.

### 4.2 Product goals

- Provision a new enterprise environment repeatably without cloning or editing application code.
- Give enterprise IT administrators SSO, automated provisioning, role management and session controls.
- Support enterprise account, organisation, workspace, client and project hierarchy.
- Prevent data, cache, file, integration, realtime and background-job crossover.
- Produce a complete and exportable administrative audit trail.
- Provide testable availability, recovery, retention and support commitments.
- Allow regional deployment and customer-specific contractual policies.
- Preserve a future path to shared regional cells for lower-cost plans.
- Make AI features governable at enterprise and organisation level.

### 4.3 Business goals

- Replace low-cost self-service positioning with annual enterprise contracts.
- Support paid implementation, migration and premium support.
- Reduce time and engineering effort required to provision each additional enterprise.
- Pass standard security, privacy and architecture reviews without bespoke engineering for every deal.
- Make dedicated deployment, data region and advanced governance commercially packageable entitlements.

## 5. Non-Goals

The first enterprise release will not:

- provide anonymous public signup;
- provide a free-forever plan;
- place unrelated enterprise customers in the current ADME production environment;
- support arbitrary per-customer code forks;
- provide cross-customer AI training or shared customer embeddings;
- guarantee active-active multi-region database operation;
- build SAML, OIDC or SCIM protocols from first principles;
- offer a marketplace for cross-customer templates or integrations;
- promise customer-managed encryption keys before vendor and architecture validation;
- promise Australian residency for infrastructure metadata that the underlying provider cannot contractually localise;
- certify XeroFlow itself as SOC 2 or ISO 27001 merely because infrastructure providers hold those certifications.

## 6. Target Customers and Personas

### 6.1 Target customer profiles

- Multi-office digital or media agency with 50–1,000 users.
- Holding company operating several agencies or brands.
- Corporate in-house marketing organisation managing agencies and suppliers.
- Automotive, franchise or dealer network requiring central governance with local execution.
- Regulated or procurement-led organisation requiring SSO, audit, retention and data-region controls.

### 6.2 Personas

#### Enterprise sponsor

Owns the commercial outcome, adoption, risk and value realisation.

Needs:

- contractual SLA and support;
- portfolio-level reporting;
- controlled rollout across business units;
- predictable commercial terms.

#### Enterprise IT administrator

Owns identity, access, domains and integrations.

Needs:

- SAML/OIDC SSO;
- SCIM provisioning and deprovisioning;
- domain verification;
- session and service-account administration;
- audit and SIEM export.

#### Security and privacy reviewer

Assesses architecture, controls, data flows and suppliers.

Needs:

- isolation model and data-flow diagrams;
- encryption and secrets controls;
- subprocessors, retention and deletion evidence;
- penetration-test and vulnerability-management evidence;
- incident and recovery procedures.

#### Enterprise administrator

Configures organisations, workspaces, roles, policies and feature entitlements.

#### Organisation administrator

Manages one agency, brand, subsidiary or operating unit without access to peer organisations.

#### Member and external collaborator

Uses permitted work-management and operational features without administrative or cross-organisation access.

#### XeroFlow operator

Provisions and supports customers through explicit, audited and time-limited access.

## 7. Product Principles

1. **Isolation is a system property.** Database separation is insufficient if caches, files, queues, workers or integrations remain global.
2. **One product, many cells.** Customer-specific infrastructure is permitted; customer-specific source forks are not.
3. **Identity and membership are different.** A person has one identity and one or more enterprise/organisation memberships.
4. **Organisation context is explicit.** It must never be inferred from the newest Xero connection, an email domain alone, or an unverified client parameter.
5. **Enterprise changes are auditable.** Sensitive configuration and data actions must generate durable events.
6. **Recovery must be rehearsed.** A backup feature is not an RTO/RPO commitment until restoration is tested.
7. **AI is governed like any other data processor.** Provider, model, retention, tool access and approval policies are customer-configurable.
8. **Fail closed.** Missing tenant context, policy context or entitlement must deny access rather than fall back to ADME or a global default.

## 8. Target Architecture

### 8.1 Logical architecture

```text
                         ┌─────────────────────────────┐
                         │ Shared enterprise control   │
                         │ plane                       │
                         │                             │
                         │ Accounts · contracts        │
                         │ deployment registry         │
                         │ identity connections        │
                         │ entitlements · provisioning │
                         │ fleet health                │
                         └──────────────┬──────────────┘
                                        │ provisions/routes
                ┌───────────────────────┼───────────────────────┐
                │                       │                       │
      ┌─────────▼──────────┐  ┌─────────▼──────────┐  ┌────────▼───────────┐
      │ Enterprise Cell A  │  │ Enterprise Cell B  │  │ Regional Shared    │
      │                    │  │                    │  │ Cell (future)      │
      │ app deployment     │  │ app deployment     │  │ multiple smaller  │
      │ database           │  │ database           │  │ customers + RLS   │
      │ files/caches/jobs  │  │ files/caches/jobs  │  │                    │
      │ secrets/realtime   │  │ secrets/realtime   │  │                    │
      └────────────────────┘  └────────────────────┘  └────────────────────┘
```

### 8.2 Control-plane responsibilities

The shared control plane stores only the minimum information required to sell, provision, route and operate cells:

- enterprise account identity and lifecycle;
- deployment and region registry;
- customer hostname and certificate status;
- contract, plan and entitlement state;
- identity-provider and directory connection references;
- cell schema version and health;
- provisioning workflow state;
- aggregate usage and operational metadata;
- XeroFlow operator audit events;
- support entitlement and incident associations.

The control plane must not become an ungoverned copy of customer business content.

### 8.3 Customer-cell responsibilities

Each dedicated enterprise cell owns:

- customer business data;
- users/memberships required for local authorisation;
- workspaces, clients, projects, boards and tasks;
- Xero and third-party integration credentials;
- customer files and generated assets;
- AI conversations, memory, vector indexes and action history;
- customer audit events;
- queues, scheduled work and realtime state;
- retention and deletion execution.

### 8.4 Cell isolation baseline

A dedicated cell must have independently addressable:

- application deployment/environment;
- Neon project or database and credentials;
- Hyperdrive configuration;
- R2 storage boundary;
- KV namespace or provably isolated namespace contract;
- Queue producers/consumers or tenant-bound message routing;
- Durable Object namespace or cell-qualified object identity;
- Vectorize index or cell-qualified vector namespace;
- secrets and OAuth credentials;
- monitoring and deployment identity;
- backup and restore policy.

Where a physical resource is shared, the security review must document the enforced logical boundary and its isolation tests.

### 8.5 Future shared regional cells

Shared cells are permitted only after the dedicated-cell launch and must add:

- immutable `enterprise_account_id` and `organization_id` ownership;
- PostgreSQL row-level security with default-deny policies;
- composite foreign keys or equivalent checks preventing cross-organisation relationships;
- per-request database policy context compatible with Hyperdrive transaction pooling;
- tenant-qualified cache, object, queue, realtime and vector keys;
- automated adversarial cross-tenant testing;
- per-tenant workload quotas and noisy-neighbour controls.

### 8.6 Hosting-runtime constraint (Pages exit)

The application currently deploys as a single Cloudflare Pages project (`nitro.preset: 'cloudflare_pages'`). Three observed Pages limitations conflict directly with automated cell provisioning:

- queue consumers and several bindings cannot be declared in `wrangler.toml` for Pages and require dashboard configuration (already bitten once: a queue consumer was silently lost on redeploy);
- Pages has no `scheduled()` handler, which is why cron endpoints today require companion Workers;
- the repository's deploy guard (`scripts/deploy-pages.mjs`) intentionally fails closed unless the target equals exactly one project, a safety control created after a real cross-deployment incident.

Provisioning N cells "without provider-console or database edits" (the M2 gate) is therefore not achievable on Pages. Before the control plane is built, the application deployment must migrate to Cloudflare Workers with static assets, or Workers for Platforms, where deployments, bindings, secrets, queues, Durable Objects and cron triggers are all API- and configuration-driven. The runtime choice is a Phase 0 ADR; the migration itself is a Phase 1 task and a prerequisite for the cell infrastructure template. The migrated deploy tooling must preserve the wrong-target protection the current guard provides, generalised to cell-aware validation rather than a single hard-coded project name.

## 9. Enterprise Domain Model

### 9.1 Required entities

```text
user
enterprise_account
enterprise_membership
organization
organization_membership
workspace
client
project
deployment_cell
identity_connection
directory_connection
service_account
subscription_contract
entitlement
usage_meter
integration_connection
audit_event
support_access_grant
retention_policy
```

### 9.2 Hierarchy

- An `enterprise_account` is the commercial and top-level governance boundary.
- An enterprise account contains one or more `organization` records.
- An organisation represents an agency, subsidiary, brand, business unit or operating company.
- An organisation contains workspaces, clients and operational data.
- A user may hold different roles in different enterprise accounts or organisations.
- A client portal identity is scoped to an organisation and client; it is not a staff identity.
- Xero `tenant_id` identifies a Xero organisation connection and must never replace XeroFlow `organization_id`.

### 9.3 Identity migration direction

The current `team_members` table conflates login identity, employment profile and agency membership. The target model separates:

- `users`: global authentication identity;
- `enterprise_memberships`: enterprise-level administration;
- `organization_memberships`: organisation role and status;
- `staff_profiles`: organisation-specific employment and capacity data.

Existing foreign keys to `team_members` require an incremental compatibility migration rather than a destructive rename.

## 10. Functional Requirements

### 10.1 Enterprise contracting and provisioning

**ENT-PROV-001** — An authorised XeroFlow operator can create an enterprise account with selected region, isolation tier, hostname, modules, support tier and retention policy.

**ENT-PROV-002** — Provisioning is idempotent and records each step, retry and terminal state.

**ENT-PROV-003** — Provisioning creates infrastructure, applies migrations, seeds approved system templates, configures secrets, runs smoke tests and registers health.

**ENT-PROV-004** — A failed provisioning attempt cannot expose a partially initialised cell to customer traffic.

**ENT-PROV-005** — Provisioning never seeds ADME clients, staff, boards, accounting mappings or credentials.

**ENT-PROV-006** — Cell creation, suspension, reactivation and decommissioning require authorised operator roles and audit events.

**ENT-PROV-007** — Customer-specific differences are configuration or entitlements, not source-code branches.

### 10.2 Enterprise administration

**ENT-ADM-001** — Enterprise administrators can create and manage organisations within contractual limits.

**ENT-ADM-002** — Organisation administrators cannot inspect or change peer organisations unless granted enterprise-level permission.

**ENT-ADM-003** — Administrators can configure branding, locale, timezone, retention, approved integrations and AI policies.

**ENT-ADM-004** — Administrators can view licences, active users, usage, service accounts and identity connections.

**ENT-ADM-005** — Sensitive changes require reauthentication or step-up authentication where supported.

### 10.3 Authentication and user lifecycle

**ENT-IAM-001** — Support SAML 2.0 and OIDC SSO through an approved enterprise identity provider service.

**ENT-IAM-002** — Bind SSO profiles to the verified enterprise/organisation identifier, not email matching alone.

**ENT-IAM-003** — Support SCIM or directory-driven create, update, suspend, reactivate and deprovision events.

**ENT-IAM-004** — Deprovisioning invalidates sessions and access within five minutes of a verified directory event.

**ENT-IAM-005** — Support IdP group-to-role mapping with a safe default role.

**ENT-IAM-006** — Enterprise administrators can require SSO and disable password login for managed domains.

**ENT-IAM-007** — Sessions support configurable idle timeout, absolute lifetime, revocation and active-session visibility.

**ENT-IAM-008** — Service accounts use scoped, rotatable credentials and cannot authenticate through interactive user flows.

**ENT-IAM-009** — Missing secrets or identity configuration fail closed; production must not use fallback authentication secrets.

### 10.4 Authorisation

**ENT-AUTHZ-001** — Authorisation evaluates enterprise, organisation, role, permission and resource ownership.

**ENT-AUTHZ-002** — The platform supports enterprise owner, enterprise admin, organisation owner, organisation admin, manager, member, viewer, external collaborator and service-account principals.

**ENT-AUTHZ-003** — Custom roles are organisation-scoped unless explicitly promoted to an enterprise template.

**ENT-AUTHZ-004** — Financial, HR, credentials, AI administration and destructive operations are separate permission groups.

**ENT-AUTHZ-005** — Object identifiers from another organisation return a non-disclosing denial and generate a security event.

**ENT-AUTHZ-006** — Background workers carry signed cell and organisation context; they never derive it from newest/default records.

### 10.5 Integrations

**ENT-INT-001** — Every integration connection belongs to a cell and organisation.

**ENT-INT-002** — OAuth state binds callback, organisation, initiating user and expiry and is single-use.

**ENT-INT-003** — Xero tokens are keyed by XeroFlow organisation plus Xero tenant ID.

**ENT-INT-004** — Webhooks resolve the organisation from a signed or provider-verified connection mapping before processing payload data.

**ENT-INT-005** — Connection secrets are encrypted, access-controlled, rotatable and excluded from application logs.

**ENT-INT-006** — Revoking one organisation's connection cannot clear another organisation's cache or credential.

**ENT-INT-007** — Integration health and last-success timestamps are visible to authorised administrators.

### 10.6 Files, realtime and asynchronous work

**ENT-DATA-001** — Every R2 object key begins with a cell and organisation ownership path or is stored in a physically dedicated bucket.

**ENT-DATA-002** — Signed file URLs carry short expiry and verified resource ownership.

**ENT-DATA-003** — Queue messages include immutable cell, organisation, actor, correlation and idempotency identifiers.

**ENT-DATA-004** — Consumers reject missing or mismatched tenant context and route dead letters without leaking payloads.

**ENT-DATA-005** — Durable Object and realtime room identities include the cell/organisation boundary even where inner object IDs are UUIDs.

**ENT-DATA-006** — Vector and AI retrieval namespaces cannot return another organisation's embeddings or memory.

**ENT-DATA-007** — Cache invalidation is scoped and cannot flush or repopulate another customer's state.

### 10.7 Audit and customer security events

**ENT-AUD-001** — Emit append-only audit events for authentication, membership, roles, permissions, data export, administrative reads, writes, deletes, integrations, support access, AI actions and policy changes.

**ENT-AUD-002** — Events include event ID, occurred time, received time, enterprise, organisation, actor, actor type, action, targets, source IP, user agent, outcome, correlation ID and redacted metadata.

**ENT-AUD-003** — Audit records are not editable through product APIs.

**ENT-AUD-004** — Authorised customers can search, filter and export events.

**ENT-AUD-005** — Enterprise plans support streaming audit events to an approved SIEM destination or generic HTTPS endpoint.

**ENT-AUD-006** — Delivery failures are retried and surfaced; event creation does not silently fail because an export destination is unavailable.

**ENT-AUD-007** — Support access records include approver, purpose, scope, start, expiry and actions performed.

### 10.8 AI governance

**ENT-AI-001** — Enterprise administrators can enable or disable AI by organisation and feature.

**ENT-AI-002** — Administrators can view the approved model/provider catalogue and data-processing classification.

**ENT-AI-003** — Customer content must not be used for cross-customer model training or retrieval.

**ENT-AI-004** — Tool actions affecting external systems or material records require policy evaluation, audit and configured approval.

**ENT-AI-005** — AI memory, conversations, prompts, outputs and embeddings obey organisation retention and deletion policy.

**ENT-AI-006** — AI usage is metered by organisation, provider, model and feature without storing unnecessary prompt content in control-plane telemetry.

**ENT-AI-007** — Customers can disable particular providers or require approved regions where technically supported.

### 10.9 Data export, retention and deletion

**ENT-LIFE-001** — Administrators can define supported retention policies within contractual and legal constraints.

**ENT-LIFE-002** — Legal hold prevents automated deletion of affected records and is auditable.

**ENT-LIFE-003** — XeroFlow can export customer data in documented machine-readable formats.

**ENT-LIFE-004** — Decommissioning follows a recorded workflow covering access removal, export window, live deletion, backups, integration revocation and completion evidence.

**ENT-LIFE-005** — Retention jobs are tenant-bound, idempotent and observable.

**ENT-LIFE-006** — Contract and privacy wording distinguishes live-data deletion from backup-expiry timelines.

### 10.10 Commercial entitlements

**ENT-COM-001** — Entitlements are stored centrally and cached safely in customer cells.

**ENT-COM-002** — Entitlements cover modules, seats, organisations, environments, storage, AI usage, support, residency, retention and integration limits.

**ENT-COM-003** — Expired or suspended contracts follow an explicit read-only, grace-period or access-block policy; they do not cause destructive deletion.

**ENT-COM-004** — Billing-provider webhooks are idempotent and cannot directly grant unauthorised features without validated contract mapping.

**ENT-COM-005** — Enterprise contracts support annual platform fee, implementation fee, committed seats, usage allowances and negotiated add-ons.

## 11. Non-Functional Requirements

### 11.1 Availability and performance

- Initial production SLA target: 99.9% monthly availability, excluding documented exclusions.
- Internal service objective should be stricter than the customer SLA to preserve error budget.
- Tenant routing must not add more than 50 ms p95 at the application edge under normal operation.
- Core authenticated read APIs should target 500 ms p95 excluding third-party provider latency.
- Long-running third-party work must move to observable asynchronous jobs.
- One customer workload must not exhaust another customer's database, queue or AI allowance.

Final contractual values require operational and commercial approval.

### 11.2 Recovery

- Initial target RPO: no more than 15 minutes for primary relational data.
- Initial target RTO: no more than four hours for a single customer cell.
- Restore drills occur at least quarterly and after material backup architecture changes.
- Restoration acceptance verifies data, application health, credentials, queues and customer access—not database connectivity alone.
- The system records last successful backup evidence and last restore-drill outcome per cell.

### 11.3 Security

- TLS is required in transit; supported managed services provide encryption at rest.
- Integration tokens and high-value secrets require application-level envelope encryption or an approved secrets service.
- Production secrets must never have source-code fallback values.
- Least-privilege identities are used for deployment, runtime, support and migration operations.
- Dependency, secret, static-analysis and container scans run in CI where applicable.
- Critical and high vulnerabilities have documented remediation SLAs.
- An independent penetration test is required before general enterprise availability.

### 11.4 Privacy and residency

- Each data category has a recorded processor, region, retention rule and transfer basis.
- Australian deployment must distinguish application/database data location, HTTPS processing location, object storage behavior and provider metadata/log location.
- No residency claim may exceed the written capabilities and contract of each subprocessor.
- Logs minimise personal and customer content and redact secrets by default.

### 11.5 Observability

- Logs, traces, metrics, queue messages and incidents include cell and organisation identifiers where safe.
- Sensitive content and secrets are excluded from telemetry.
- Health covers application, database, integration, queue, scheduled job, identity and audit-export status.
- Alerts are actionable, deduplicated and mapped to an owner and runbook.
- Enterprise-facing status communication must not expose other customers.

### 11.6 Accessibility

- New enterprise administration and onboarding surfaces meet WCAG 2.2 AA.
- Critical identity, provisioning and recovery tasks are keyboard operable and expose clear status/error messaging.

## 12. Customer Experience

### 12.1 Sales-assisted onboarding

1. Qualify customer structure, modules, data region and security requirements.
2. Complete contract, DPA, subprocessors and service schedule.
3. Create enterprise account and provisioning request.
4. Provision and validate the customer cell.
5. Configure domains, SSO, directory sync and administrator access.
6. Configure organisations, policies and integrations.
7. Import approved data through a rehearsed migration.
8. Conduct customer acceptance testing.
9. Approve production cutover and support handover.

### 12.2 Enterprise admin centre

The enterprise admin centre must provide:

- enterprise and organisation hierarchy;
- domains, SSO and directory status;
- users, groups, roles, sessions and service accounts;
- modules and entitlements;
- integrations and credential health;
- audit search and export;
- retention, AI and data-processing policies;
- environment, version and service health;
- usage and contractual limits;
- support access requests and history.

### 12.3 Custom domains

Support XeroFlow subdomains first, for example `customer.xeroflow.io`. Customer vanity domains are an enterprise add-on and require automated ownership validation, certificate lifecycle and routing state.

## 13. Operational Model

### 13.1 Release management

- All cells run signed artifacts from the shared release pipeline.
- A cell records application and schema versions.
- Releases progress through internal, canary and production cohorts.
- Dedicated customers may receive an agreed maintenance window, but cannot permanently pin unsupported versions.
- Migrations are backwards-compatible across the supported rollout window.
- Failed migration or health gates halt promotion automatically.

### 13.2 Support access

- XeroFlow staff do not receive standing access to customer content by default.
- Support access is requested for a defined purpose and scope.
- Customer approval is required where contracted.
- Access expires automatically.
- Every support action is included in the customer audit trail.
- Emergency break-glass access is separately controlled, alerted and reviewed.

### 13.3 Incident response

- Incidents are classified by security, availability, integrity and privacy impact.
- The incident record identifies affected cells; unaffected customers remain undisclosed.
- Customer notification rules align with contract and applicable legal requirements.
- Material incidents produce corrective actions and a customer-appropriate post-incident report.

## 14. Migration Strategy

### 14.1 Phase 0: Decisions and safety baseline

Exit criteria:

- This PRD is approved.
- An ADR records the customer-cell and control-plane decision.
- An ADR records the hosting-runtime decision (Workers with static assets versus Workers for Platforms) and the Pages exit plan (§8.6).
- A design partner has signed at least a letter of intent fixing launch-critical modules, identity requirements, and which partner-negotiable controls (SCIM, SIEM streaming, legal hold) the pilot actually requires.
- Identity provider, infrastructure-as-code tool and initial SLA targets are selected.
- Existing production authentication fallback secrets and unauthenticated provisioning risks are remediated.
- The current system inventory is classified as control-plane, cell-local, shared-with-boundary, or prohibited-global.

### 14.2 Phase 1: Cell-ready single-customer platform

Goal: make the existing application a reproducible, configuration-driven customer cell.

Exit criteria:

- The application runs on the runtime chosen in Phase 0; no binding, queue consumer or cron trigger requires dashboard configuration.
- ADME-specific seeds and runtime logic are isolated from system defaults.
- Xero, caches, files, workers, queues, realtime and AI operate within cell context.
- A fresh environment can be built from infrastructure and migration automation.
- Cell smoke tests prove login, core work management, Xero, files and background jobs.
- Backup and restore are demonstrated.

### 14.3 Phase 2: Shared control plane and provisioning

Exit criteria:

- Enterprise accounts and deployment cells are registered centrally.
- Provisioning is idempotent, observable and reversible before activation.
- Cell health and schema versions are visible centrally.
- Hostname and environment routing are automated.
- Operator actions are audited.

### 14.4 Phase 3: Enterprise identity and administration

Existing controls reduce this phase's scope: session revocation and hashed session tokens at rest already exist (migration 191), and DB-driven custom roles are live (`server/utils/roleResolver.ts`). The genuinely new work is SSO/SCIM brokerage, enterprise/organisation role tiering, and the admin centre — session administration is an extension, not a build-from-scratch.

Exit criteria:

- SSO, domain verification and session administration pass integration tests.
- SCIM/directory sync passes integration tests where the design partner contract requires it; otherwise it is scheduled before general availability with manual membership administration in the pilot.
- Enterprise and organisation hierarchy is implemented.
- Role and permission isolation is tested.
- Enterprise admin centre supports the launch workflows.

### 14.5 Phase 4: Audit, governance and commercial controls

Exit criteria:

- Unified audit events cover all launch-critical actions.
- Customer audit export is operational; SIEM streaming is operational where the design partner contract requires it, otherwise scheduled before general availability.
- Retention, AI and support-access policies are enforced; legal hold is enforced where the design partner contract requires it, otherwise scheduled before general availability.
- Entitlements and usage are observable and contract-safe.

Partner-negotiable items (SCIM, SIEM streaming, legal hold) deferred from the pilot remain launch-acceptance requirements for general availability (§19); deferral moves them later, it does not remove them.

### 14.6 Phase 5: Design-partner pilot

The design partner is selected and committed in Phase 0 (assumption 12); this phase converts the letter of intent into a full pilot contract and executes the pilot.

Exit criteria:

- One non-ADME enterprise design partner operates in an isolated production cell.
- No unresolved severity-one or severity-two isolation finding remains.
- Restore, deprovisioning, integration revocation and incident exercises pass.
- Customer security review and acceptance testing are complete.
- Operational load and unit economics are measured.

### 14.7 Phase 6: General enterprise availability

Exit criteria:

- Independent penetration test issues are resolved or explicitly risk-accepted.
- SLA, DPA, subprocessors, support and security documentation are approved.
- Provisioning and upgrades have succeeded repeatedly without manual database editing.
- At least two production cell upgrades have passed cohort rollout and rollback gates.
- On-call, status communication and incident processes are active.

### 14.8 Future: Shared regional edition

Shared regional cells require a separate approved PRD/ADR amendment and must not weaken dedicated enterprise guarantees.

## 15. Testing Strategy

### 15.1 Required test layers

- Unit tests for tenant key construction, policy evaluation, entitlement checks and audit schemas.
- Integration tests for database routing, identity events, OAuth callbacks, webhooks and provisioning steps.
- Contract tests between control plane, cells and workers.
- Cross-tenant adversarial tests using valid identifiers from another organisation.
- End-to-end tests for SSO, SCIM removal, support access, export and decommissioning.
- Infrastructure tests for cell resource separation and policy configuration.
- Migration tests against representative production-scale schemas.
- Recovery exercises from point-in-time and backup artifacts.
- Load tests for large enterprises and noisy-neighbour behavior.
- Security tests for IDOR, privilege escalation, token replay, webhook forgery and log leakage.

### 15.2 Mandatory isolation assertions

For every tenant-owned resource type, automated tests must prove:

- enterprise A cannot list enterprise B records;
- direct use of enterprise B's valid object ID is denied;
- writes cannot reference a foreign enterprise object;
- cache warming by A cannot affect B's response;
- a file URL from A cannot be used by B;
- a queue or webhook missing tenant context is rejected;
- vector search and AI memory never return foreign results;
- support access outside grant scope is denied;
- suspension or deprovisioning invalidates existing access.

### 15.3 Repository commands

Current baseline commands:

```bash
pnpm install
pnpm run typecheck
pnpm exec vitest run
npm run build
```

Enterprise implementation must add targeted commands for:

- cell provisioning validation;
- cross-tenant isolation suite;
- migration compatibility;
- recovery drill verification;
- SSO/SCIM contract fixtures;
- infrastructure policy checks.

## 16. Project Structure Direction

Proposed documentation and implementation boundaries:

```text
docs/prd/                         product requirements
docs/decisions/                   accepted architecture decisions
docs/security/                    threat models and security controls
docs/runbooks/                    provisioning, release, recovery, incidents
server/platform/control-plane/    account, deployment and entitlement logic
server/platform/tenant-context/   verified runtime context and boundaries
server/platform/audit/            canonical audit event contract
server/platform/identity/         SSO, directory and membership adapters
server/platform/provisioning/     provisioning workflow contracts
workers/                          cell-aware async/realtime execution
test/enterprise/                  isolation and enterprise contract tests
infra/                            infrastructure-as-code modules and policies
```

Exact paths require approval during technical planning; this PRD does not authorise a large mechanical repository move.

## 17. Engineering Conventions

Enterprise platform code must:

- use explicit names such as `enterpriseAccountId`, `organizationId` and `xeroTenantId`;
- avoid the ambiguous unqualified term `tenantId` in new interfaces;
- represent authenticated identity, active membership and resource ownership separately;
- use structured errors that do not disclose foreign-resource existence;
- use versioned event and message schemas;
- propagate correlation and idempotency identifiers;
- redact credentials and customer content from logs;
- avoid global mutable runtime state for customer-scoped values;
- fail closed when customer context or policy is missing.

Illustrative contract:

```ts
interface EnterpriseRequestContext {
  requestId: string
  enterpriseAccountId: string
  organizationId: string
  actor: {
    type: 'user' | 'service_account' | 'worker' | 'support'
    id: string
  }
  cellId: string
}
```

## 18. Delivery Boundaries

### Always

- Update this PRD before changing approved enterprise scope.
- Add tests before changing an isolation boundary.
- Keep migrations backward-compatible during cohort rollout.
- Record security-sensitive decisions in an ADR or threat model.
- Preserve unrelated work in the repository.
- Treat customer context as untrusted until membership and routing are verified.

### Ask first

- Add or replace the identity provider.
- Add a billing provider.
- Change database isolation tier.
- Change SLA, RPO, RTO or retention commitments.
- Add a new subprocessor or data region.
- Introduce customer-specific infrastructure exceptions.
- Migrate or delete production customer data.
- Enable support impersonation or break-glass access.

### Never

- Fork application code for a customer.
- Infer organisation from the newest Xero connection.
- Fall back to ADME/default customer context in production.
- Accept unsigned tenant identifiers from queues, webhooks or internal calls.
- Store production secrets in source or application logs.
- Reuse cache, object or realtime keys without cell/organisation ownership.
- Claim compliance or residency not supported by XeroFlow's own controls and contracts.
- Use one customer's content to train or retrieve for another customer.

## 19. Launch Acceptance Criteria

Enterprise general availability requires all of the following:

- [ ] A new cell can be provisioned from approved automation without editing application code or production SQL manually.
- [ ] Cell activation occurs only after migrations, health checks and smoke tests pass.
- [ ] Enterprise SSO works for IdP- and service-provider-initiated flows.
- [ ] Directory deprovisioning revokes access within the agreed target.
- [ ] Enterprise and organisation roles pass privilege-escalation tests.
- [ ] Cross-tenant database, API, cache, file, queue, realtime, vector and AI tests pass.
- [ ] Xero and every launch integration are scoped to the correct organisation.
- [ ] Audit events cover every launch-critical administrative and security action.
- [ ] Customers can export audit events and configure the supported SIEM path.
- [ ] Backup restoration meets the approved RPO/RTO in a recorded exercise.
- [ ] Data export, retention and decommissioning workflows pass rehearsal.
- [ ] Customer support access is approved, scoped, expiring and audited.
- [ ] AI provider and action policies are visible and enforced.
- [ ] No production authentication or encryption secret uses a fallback value.
- [ ] Independent penetration-test launch blockers are resolved.
- [ ] Security overview, architecture diagram, DPA, subprocessors, SLA and support schedule are approved.
- [ ] A design-partner production pilot has completed without an unresolved material isolation issue.
- [ ] Operational owners and runbooks exist for provisioning, deployment, restore, identity, integrations and incidents.

## 20. Success Metrics

### Product and commercial

- Enterprise provisioning lead time from approved order to ready environment.
- Implementation effort per new enterprise.
- Annual contract value and gross margin by isolation tier.
- Enterprise activation and module adoption.
- Renewal, expansion and support-escalation rates.

### Reliability and security

- Availability against SLA by customer cell.
- RPO/RTO drill success rate.
- Cross-tenant isolation test pass rate.
- Mean time to detect and resolve cell incidents.
- Identity deprovisioning latency.
- Percentage of sensitive actions producing valid audit events.
- Vulnerability remediation against policy.

### Operations

- Provisioning success without manual intervention.
- Upgrade success and rollback rate by cohort.
- Cells at supported application/schema version.
- Queue, integration and audit-export delivery health.
- Support access grants automatically expired on time.

## 21. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Dedicated cells create operational overhead | High | Infrastructure as code, central fleet registry, cohort releases and standard runbooks |
| A shared control plane becomes a high-value target | Critical | Minimise customer data, least privilege, separate credentials, audit and security review |
| Existing global assumptions survive cell conversion | Critical | Inventory, fail-closed context, targeted isolation tests and design-partner pilot |
| Identity migration locks out existing users | High | Compatibility period, staged migration, recovery identities and rehearsed rollback |
| Async workers process the wrong organisation | Critical | Signed context, schema validation, idempotency and dead-letter handling |
| Per-cell versions drift | High | Supported-version policy, automated migrations and cohort dashboards |
| Infrastructure provider certification is mistaken for XeroFlow compliance | High | Own control program, evidence collection and independent audit roadmap |
| Residency promise exceeds provider behavior | High | Data-category mapping, contractual review and qualified customer wording |
| Enterprise customisation creates code forks | High | Entitlements, configuration, extension contracts and product governance |
| Dedicated model has poor unit economics | Medium | Measure pilot costs; introduce shared regional cells only after isolation maturity |
| Audit volume exposes sensitive content or creates high cost | Medium | Canonical metadata schema, redaction, retention tiers and streaming |
| Current broad feature set expands launch scope indefinitely | High | Restrict launch-critical modules per design partner and gate additions explicitly |
| Cloudflare Pages limitations block automated provisioning | Critical | Decide the Workers runtime in Phase 0 and complete the migration before the control plane is built (§8.6) |
| Single-operator capacity is overcommitted across concurrent workstreams | High | Baseline the calendar on current capacity, approve hiring or explicitly cut design-partner scope; review at every milestone checkpoint |
| Governance features are built before any customer requires them | Medium | Design-partner LOI in Phase 0 fixes launch scope; SCIM, SIEM and legal hold are contract-gated |

## 22. Open Decisions

Approval of this PRD does not automatically resolve these selections:

1. Which identity platform will provide SSO, directory sync and administration?
2. Which infrastructure-as-code system will provision and update cells?
3. Does a standard dedicated cell use a separate Neon project or a separate database within a managed enterprise project?
4. Which Cloudflare resources are physically dedicated versus logically partitioned in the first release?
5. What are the contracted launch SLA, RPO and RTO values?
6. Which enterprise design partner and launch-critical modules define the pilot?
7. Is the initial custom domain under `xeroflow.io`, or must vanity domains be available in the pilot?
8. Which SIEM destinations are required for the first customer?
9. What audit retention period is included and what is sold as an add-on?
10. Which AI providers and data regions are approved at launch?
11. What security assurance milestone is required before general availability: independent penetration test, SOC 2 Type I, SOC 2 Type II roadmap, ISO 27001 roadmap, or a combination?
12. What commercial minimum and implementation fee make dedicated cells sustainable?
13. Which Workers runtime replaces the Pages deployment: Cloudflare Workers with static assets, or Workers for Platforms with dispatch namespaces?
14. Is the programme staffed toward the recommended team, or formally baselined on the single-operator 12–24 month calendar with reduced design-partner scope?

## 23. Source and Platform Constraints

- PostgreSQL row-level security is the required defence-in-depth mechanism for any future shared cell: <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
- Hyperdrive uses transaction-mode pooling; session configuration cannot be assumed to persist across independent queries: <https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/>
- Cloudflare for SaaS supports customer custom hostnames and certificate lifecycle: <https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/>
- Cloudflare Regional Services supports Australian HTTPS processing, while Customer Metadata Boundary availability differs by region: <https://developers.cloudflare.com/data-localization/region-support/>
- WorkOS documents organisation-bound SSO, directory lifecycle management and audit-log streaming patterns: <https://workos.com/docs/sso/domains>, <https://workos.com/docs/directory-sync>, <https://workos.com/docs/audit-logs/log-streams>
- Neon documents point-in-time restore and security/compliance capabilities; XeroFlow must still validate plan-specific contractual availability: <https://neon.com/docs/introduction/point-in-time-restore>, <https://neon.com/security>
- Cloudflare Workers static assets is the successor deployment model to Pages and supports configuration-driven bindings, queues and cron triggers: <https://developers.cloudflare.com/workers/static-assets/>
- Observed Pages constraints in this repository: queue consumers and several bindings are dashboard-only (the JOBS_QUEUE consumer was previously lost on redeploy and required the `workers/jobs-consumer` bridge), no `scheduled()` handler (companion cron workers such as `workers/pages-cron` exist as a workaround), and `scripts/deploy-pages.mjs` pins a single deploy target by design following a cross-deployment incident (`docs/incidents/2026-07-13-dealer-network-pages-cross-deployment.md`).

## 24. Approval and Next Step

This document is a proposed product specification. It does not authorise production migrations, provider purchases or customer onboarding.

On approval:

1. Create an ADR recording the enterprise-cell/control-plane decision and superseded assumptions.
2. Resolve the open decisions required for Phase 0.
3. Produce a dependency-ordered implementation plan with verification gates.
4. Break Phase 0 and Phase 1 into focused tasks, each touching approximately five files or fewer where practical.
5. Begin implementation only after the technical plan and security boundary are reviewed.
