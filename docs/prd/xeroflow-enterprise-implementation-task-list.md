# XeroFlow Enterprise Platform — In-Depth Implementation Task List

**Status:** Proposed — requires engineering and product approval before implementation  
**Date:** 22 July 2026  
**Revision:** v0.2 — added ENT-0008/ENT-0009 (hosting-runtime decision, design-partner commitment) and ENT-1018 (Pages→Workers migration); re-baselined the calendar on current single-operator capacity; marked SCIM, SIEM streaming and legal hold as partner-negotiable pilot scope; recorded existing identity assets in Phase 3. Task count is now 70.  
**Source PRD:** [XeroFlow Enterprise Platform PRD](./xeroflow-enterprise-platform-prd.md) (v0.2)  
**Primary delivery target:** One non-ADME enterprise design partner in an isolated production cell  
**Secondary delivery target:** Repeatable, supportable enterprise general availability (GA)

## 1. Purpose

This document converts the enterprise PRD into an ordered, implementation-grade backlog. It assumes XeroFlow will use:

- one shared codebase and release process;
- a small shared control plane;
- an isolated customer cell for each initial enterprise customer;
- a dedicated database and tenant-bound infrastructure per enterprise cell;
- configuration and entitlements instead of customer-specific code branches;
- sales-assisted onboarding before self-service enterprise provisioning;
- a hosting runtime capable of API-driven per-cell provisioning (Cloudflare Workers with static assets or Workers for Platforms), migrated from the current single Cloudflare Pages project before the control plane is built (PRD §8.6);
- a committed design partner (letter of intent at minimum) before Phase 1 investment, so Phases 3 and 4 build only contracted scope.

This is a programme plan, not a commitment to deliver every task simultaneously. Tasks should be moved into delivery sprints only after their dependencies and acceptance criteria are understood.

## 2. Delivery Estimate and Staffing Assumptions

### 2.1 Indicative calendar

| Milestone | Indicative elapsed time | Outcome |
|---|---:|---|
| M0 — Decisions and safety baseline | 2–3 weeks | Architecture approved; immediate security gaps closed |
| M1 — Reproducible customer cell | 8–12 weeks | Existing product runs as a configuration-driven isolated cell |
| M2 — Control plane and provisioning | 6–8 weeks | A second cell can be provisioned and operated repeatably |
| M3 — Enterprise identity and administration | 8–12 weeks | SSO, SCIM, RBAC, hierarchy and admin workflows operate end to end |
| M4 — Governance and commercial controls | 6–10 weeks | Audit, retention, AI policy, support access and entitlements are enforceable |
| M5 — Design-partner pilot | 6–8 weeks | One external enterprise customer operates in production |
| M6 — Enterprise GA hardening | 8–12 weeks | Repeatable upgrades, operational maturity and independent assurance |

The ranges are not intended to be added sequentially. Several workstreams can overlap after contracts and boundaries are stable.

Two delivery scenarios are recognised:

| Scenario | Design-partner release | Enterprise GA | Conditions |
|---|---|---|---|
| **Staffed** (recommended team in §2.2 is hired) | ~4–6 months | ~8–12 months | Team hired and dedicated; parallel workstreams per §7 |
| **Current capacity** (one operator with AI-assisted engineering, shared with agency operations and other product workstreams) | ~12–24 months, with a materially narrower design-partner module set | Beyond 24 months | No hiring; partner-negotiable items (SCIM, SIEM streaming, legal hold) deferred unless contracted |

**The current-capacity scenario is the planning baseline until hiring is approved** (PRD assumption 11, open decision 14). Quoting the staffed calendar without the staffing is the single most likely way this programme fails. Milestone checkpoints must restate which scenario is in effect.

### 2.2 Recommended core team

| Capability | Suggested allocation | Primary responsibility |
|---|---:|---|
| Platform/backend engineering | 2–3 full-time | Tenant context, data model, control plane, provisioning and integrations |
| Product/frontend engineering | 1 full-time | Enterprise administration, operator workflows and accessibility |
| Platform/SRE | 0.5–1 full-time | Infrastructure automation, delivery, observability, backup and incident readiness |
| Security/identity engineering | 0.25–0.5 full-time | SSO, SCIM, threat modelling, testing and assurance |
| Product owner | 0.5–1 full-time | Design partner, scope, contract decisions and acceptance |
| QA/automation | 0.5 full-time or shared | Isolation, migration, end-to-end and regression suites |

This table is the hiring target, not the present state. Current actual staffing is one operator with AI-assisted engineering across all roles; that reality is what the current-capacity scenario in §2.1 prices in. With one or two engineers, the same direction remains achievable, but the likely duration becomes 12–24 months and the design-partner scope must be narrower.

### 2.3 Estimation key

- **S:** Up to roughly 3 engineering days.
- **M:** Roughly 3–8 engineering days.
- **L:** Roughly 1–3 engineering weeks and must be delivered through smaller pull requests.
- **Confidence — High:** Existing patterns and boundaries are understood.
- **Confidence — Medium:** Some discovery or provider integration is required.
- **Confidence — Low:** Material unknowns can change the implementation or estimate.

Estimates include implementation and automated tests, but exclude procurement delays, customer scheduling and external penetration-test lead time.

## 3. Programme Guardrails

- No enterprise customer receives a source-code fork.
- A Xero tenant identifier is never treated as the XeroFlow organisation identifier.
- No tenant-owned lookup may fall back to the newest, first or default record.
- Partially provisioned cells receive no customer traffic.
- Production secrets have no source-code or weak environment fallback.
- Database, cache, object, queue, realtime and AI ownership are all explicit.
- Backwards-compatible database migrations are required during cohort rollouts.
- A task affecting an isolation boundary is incomplete without a negative cross-tenant test.
- Enterprise claims about SLA, security or residency require evidence and approved wording.
- Shared-database multi-tenancy is outside this plan and requires a separate approved decision.

## 4. Critical Dependency Path

```text
Architecture decisions, design-partner commitment and inventory
        |
        v
Tenant context contract + identity/data model
        |
        v
Cell-bound APIs, workers, storage and integrations
        |
        v
Workers runtime migration (Pages exit)
        |
        v
Reproducible infrastructure + migration + restore
        |
        v
Control-plane provisioning and cell routing
        |
        +--------------------+
        |                    |
        v                    v
Enterprise IAM/RBAC     Audit/governance/entitlements
        |                    |
        +----------+---------+
                   v
          Design-partner pilot
                   |
                   v
        Assurance and enterprise GA
```

## 5. Definition of Done for Every Engineering Task

- [ ] Acceptance criteria are demonstrated in the target environment.
- [ ] Unit, integration or end-to-end tests cover the changed behavior and failure path.
- [ ] Tenant-owned behavior includes a negative cross-tenant assertion where applicable.
- [ ] `pnpm run typecheck`, relevant Vitest suites and `npm run build` pass.
- [ ] Logs contain correlation and safe tenant context but no credentials or sensitive payloads.
- [ ] Operational behavior, configuration and rollback are documented.
- [ ] Database changes are backwards-compatible across the supported rollout window.
- [ ] Security-sensitive changes receive peer review from an engineer other than the author.

---

# Phase 0 — Decisions, Inventory and Safety Baseline

## ENT-0001 — Approve the isolated-cell architecture decision

**Outcome:** Convert the PRD decision into an ADR covering shared control plane, isolated customer cells, dedicated databases, shared artifacts and the explicit deferral of shared-database tenancy.

**Acceptance criteria:**

- [ ] ADR records context, decision, rejected alternatives and consequences.
- [ ] Product, engineering, operations and security owners approve it.
- [ ] The older multi-tenancy PRD is marked consistently as superseded where it conflicts.

**Verification:** Documentation review against the PRD and architecture diagram.  
**Dependencies:** None.  
**Owner / size / confidence:** Architecture lead / S / High.  
**Likely files:** `docs/decisions/`, `docs/prd/`.

## ENT-0002 — Build the enterprise isolation inventory

**Outcome:** Catalogue every database table, API route, worker, Durable Object, queue, KV key, R2 object, cache, Vectorize namespace, OAuth connection, webhook and scheduled job that carries customer data.

**Acceptance criteria:**

- [ ] Each item is classified as control-plane, cell-local, explicitly tenant-bound shared resource or prohibited global state.
- [ ] Each item has a current owner, target owner key and migration disposition.
- [ ] Hard-coded ADME values and implicit first/default/newest-record queries are recorded as P0 defects.

**Verification:** Repository searches and owner review cover `server/`, `workers/`, `app/`, migrations and Cloudflare configuration.  
**Dependencies:** ENT-0001.  
**Owner / size / confidence:** Platform lead / L / Medium.  
**Likely files:** `docs/audits/`, `server/`, `workers/`, `wrangler*.json*`.

## ENT-0003 — Define canonical tenant vocabulary and context contract

**Outcome:** Establish typed definitions for enterprise account, organisation, workspace, deployment cell, user, membership, actor and correlation context.

**Acceptance criteria:**

- [ ] The contract defines trusted sources for `cellId`, `enterpriseId`, `organizationId`, `actorId` and `correlationId`.
- [ ] Browser-supplied tenant identifiers are never trusted without membership and resource-policy evaluation.
- [ ] Naming rules cover TypeScript, SQL, URLs, queues, storage and telemetry.

**Verification:** Contract reviewed against one API request, one queue message, one file operation and one scheduled job.  
**Dependencies:** ENT-0002.  
**Owner / size / confidence:** Platform lead / M / Medium.  
**Likely files:** `docs/specs/`, `app/types/`, `server/utils/`.

## ENT-0004 — Select identity, infrastructure and secrets providers

**Outcome:** Decide the enterprise identity broker, infrastructure-as-code tool, secret/encryption mechanism and control-plane datastore.

**Acceptance criteria:**

- [ ] SAML/OIDC, SCIM, directory groups, audit hooks, regional needs and pricing are compared.
- [ ] IaC supports repeatable Cloudflare and Neon resource creation with drift detection.
- [ ] Key ownership, rotation, break-glass access and local-development behavior are documented.

**Verification:** Approved ADRs and a time-boxed provider proof of concept for the highest-risk integration.  
**Dependencies:** ENT-0001.  
**Owner / size / confidence:** Architecture and security leads / M / Low.  
**Likely files:** `docs/decisions/`, `docs/research/`.

## ENT-0005 — Approve enterprise service objectives

**Outcome:** Confirm internal SLOs and proposed contractual targets for availability, latency, RPO, RTO, support and vulnerability remediation.

**Acceptance criteria:**

- [ ] Every metric has a measurement source, calculation and accountable owner.
- [ ] Customer SLA wording remains weaker than the internal SLO/error-budget target.
- [ ] RPO of 15 minutes and RTO of four hours are either accepted or explicitly replaced.

**Verification:** Product, operations and commercial sign-off.  
**Dependencies:** ENT-0001.  
**Owner / size / confidence:** Product and SRE leads / S / Medium.  
**Likely files:** `docs/specs/`, `docs/runbooks/`.

## ENT-0006 — Remove unsafe authentication and secret fallbacks

**Outcome:** Make missing production authentication, encryption or integration secrets fail closed.

**Acceptance criteria:**

- [ ] Production startup/deployment fails when required secrets are absent.
- [ ] No committed default can sign sessions, callbacks, jobs or support grants.
- [ ] Secret values are redacted from errors, structured logs and health endpoints.

**Verification:** Automated configuration tests plus a deployment check with deliberately missing test secrets.  
**Dependencies:** ENT-0002.  
**Owner / size / confidence:** Security engineer / M / Medium.  
**Likely files:** `server/api/auth/`, `server/middleware/`, `server/plugins/`, `scripts/`, deployment configuration.

## ENT-0007 — Establish enterprise CI quality gates

**Outcome:** Create a required pipeline for type checking, tests, build, migration validation, secret scanning, dependency scanning and deployment-policy checks.

**Acceptance criteria:**

- [ ] Required checks block protected-branch promotion.
- [ ] Isolation and migration suites can be selected independently for fast feedback.
- [ ] Artifacts and dependency manifests are retained for release evidence.

**Verification:** A deliberately failing fixture blocks a test pull request; a clean change produces a traceable artifact.  
**Dependencies:** ENT-0001.  
**Owner / size / confidence:** SRE / M / High.  
**Likely files:** `.github/workflows/`, `package.json`, `scripts/`, `test/config/`.

## ENT-0008 — Decide the cell hosting runtime and plan the Pages exit

**Outcome:** Record an ADR choosing Cloudflare Workers with static assets or Workers for Platforms as the cell runtime, replacing the single Cloudflare Pages project, and produce the migration plan.

**Acceptance criteria:**

- [ ] The ADR documents the Pages limitations that block automated provisioning: dashboard-only queue-consumer/binding configuration (the JOBS_QUEUE consumer was previously lost on redeploy), no `scheduled()` handler (companion cron workers exist as a workaround), and single-target deploy tooling (`scripts/deploy-pages.mjs`).
- [ ] The chosen runtime demonstrably supports API/configuration-driven creation of deployments, bindings, secrets, queues, Durable Objects and cron triggers per cell.
- [ ] The migration plan covers the Nitro preset change, build output, routing, environment configuration, companion-worker absorption or retention, deploy-guard generalisation and rollback.

**Verification:** Approved ADR plus a time-boxed spike deploying the existing build artifact to the chosen runtime in a non-production account or zone.  
**Dependencies:** ENT-0001.  
**Owner / size / confidence:** SRE/platform lead / M / Medium.  
**Likely files:** `docs/decisions/`, `nuxt.config.ts`, `wrangler.toml`, `scripts/deploy-pages.mjs`.

## ENT-0009 — Secure a design-partner commitment that defines launch scope

**Outcome:** Obtain at least a signed letter of intent from one design partner before Phase 1 investment begins, fixing launch-critical modules, identity requirements and pilot expectations so later phases build only contracted scope.

**Acceptance criteria:**

- [ ] The partner's required modules, integrations, identity provider, SSO/SCIM expectations, region and data-migration volume are documented.
- [ ] Requirements the first release will not support are listed and acknowledged by the partner.
- [ ] SCIM (ENT-3005), SIEM streaming (ENT-4004) and legal hold (within ENT-4006) are each individually marked required-for-pilot or deferred-to-GA based on the partner's actual requirements.

**Verification:** Signed LOI or equivalent commitment reviewed at the M0 checkpoint; the launch module set is written into the isolation inventory scope (ENT-0002).  
**Dependencies:** ENT-0001, ENT-0005.  
**Owner / size / confidence:** Product/commercial / M / Low.  
**Likely files:** customer-restricted commercial documentation; launch-scope annex referenced by `docs/prd/`.

### Checkpoint M0 — Architecture and safety approval

- [ ] ENT-0001 through ENT-0009 are complete.
- [ ] Unknown inventory items have an owner and deadline.
- [ ] No known production fallback secret remains.
- [ ] The hosting-runtime ADR is approved and the Pages exit is planned and spiked.
- [ ] A design-partner LOI fixes the launch module set and the required/deferred status of each partner-negotiable control.
- [ ] Leadership accepts the design-partner scope, team, budget and delivery scenario (§2.1: staffed or current-capacity).
- [ ] Decision: proceed to cell conversion or revise the PRD.

---

# Phase 1 — Make the Existing Product a Reproducible Customer Cell

## ENT-1001 — Add compatibility-first enterprise and organisation schema

**Outcome:** Introduce enterprise accounts, organisations, workspaces, users and memberships without destructively renaming `team_members` or breaking existing production paths.

**Acceptance criteria:**

- [ ] New entities use stable UUIDs, status fields, timestamps and explicit ownership foreign keys.
- [ ] Existing ADME records are mapped through a reversible compatibility migration.
- [ ] New tenant-owned foreign keys cannot reference objects outside their organisation.

**Verification:** Migration up/down or compensating-path test against a production-shaped snapshot; foreign-key isolation tests.  
**Dependencies:** ENT-0003.  
**Owner / size / confidence:** Backend engineer / L / Medium.  
**Likely files:** `server/database/migrations/`, `server/database/schema.sql`, database tests.

## ENT-1002 — Implement trusted request tenant context

**Outcome:** Resolve cell, organisation, actor and correlation context once at the authenticated request boundary.

**Acceptance criteria:**

- [ ] Context derives from trusted hostname/session/membership mappings.
- [ ] Missing, suspended or conflicting context returns a non-disclosing denial.
- [ ] Downstream handlers receive a typed immutable context instead of re-querying a default organisation.

**Verification:** Middleware unit tests and API integration tests for valid, missing, suspended and foreign contexts.  
**Dependencies:** ENT-0003, ENT-1001.  
**Owner / size / confidence:** Backend engineer / M / Medium.  
**Likely files:** `server/middleware/`, `server/utils/`, `app/types/`, `test/server/middleware/`.

## ENT-1003 — Implement the central authorisation policy layer

**Outcome:** Replace scattered role checks with resource-aware policy evaluation.

**Acceptance criteria:**

- [ ] Policy input covers enterprise, organisation, principal type, role, permission and resource ownership.
- [ ] Denials are non-disclosing and security-relevant denials emit a safe event.
- [ ] Financial, HR, credentials, AI administration and destructive actions use separate permissions.

**Verification:** Policy-table unit tests for every launch role and foreign-object access.  
**Dependencies:** ENT-1001, ENT-1002.  
**Owner / size / confidence:** Backend/security engineer / L / Medium.  
**Likely files:** `server/utils/`, `server/middleware/`, `server/api/admin/roles/`, `test/server/`.

## ENT-1004 — Convert one core work-management slice end to end

**Outcome:** Prove the tenant pattern on one representative vertical slice such as boards, projects and tasks before broad migration.

**Acceptance criteria:**

- [ ] List, create, read, update and delete paths require organisation context and policy checks.
- [ ] Database joins, notifications and frontend navigation preserve context.
- [ ] Valid identifiers from a second organisation cannot be read or mutated.

**Verification:** Unit, API and browser-level tests using two organisations.  
**Dependencies:** ENT-1002, ENT-1003.  
**Owner / size / confidence:** Full-stack engineer / L / Medium.  
**Likely files:** `server/api/agency/boards/`, `server/api/agency/projects/`, `server/api/agency/tasks/`, `app/pages/`, `test/`.

## ENT-1005 — Migrate remaining launch-critical API domains

**Outcome:** Apply the proven tenant pattern to every API domain required by the design partner.

**Acceptance criteria:**

- [ ] The inventory maps each launch route to an explicit policy and ownership key.
- [ ] No launch-critical query selects an unscoped first/newest/default tenant record.
- [ ] Each converted domain has a representative cross-tenant read and write test.

**Verification:** Static inventory check plus domain integration suites.  
**Dependencies:** ENT-1004.  
**Owner / size / confidence:** Backend team / L per domain / Low.  
**Likely files:** `server/api/agency/`, `server/api/crm/`, `server/api/email/`, `server/api/portal/`, `test/server/api/`.

## ENT-1006 — Tenant-bind Xero and OAuth integrations

**Outcome:** Key every Xero connection by XeroFlow organisation plus provider tenant, with safe OAuth state and revocation.

**Acceptance criteria:**

- [ ] OAuth state binds organisation, initiating actor, callback, expiry and single-use nonce.
- [ ] Token lookup requires both organisation and Xero tenant identifiers.
- [ ] Revocation, refresh or cache invalidation for one organisation cannot affect another.

**Verification:** Two-organisation OAuth callback, replay, refresh and revocation tests.  
**Dependencies:** ENT-1001 through ENT-1003.  
**Owner / size / confidence:** Integration engineer / L / Medium.  
**Likely files:** `server/api/xero/`, Xero utilities, migrations, integration tests.

## ENT-1007 — Tenant-bind files and object storage

**Outcome:** Make every object key and signed URL cell/organisation aware.

**Acceptance criteria:**

- [ ] Object keys begin with an approved ownership prefix or use a dedicated bucket.
- [ ] Signing validates ownership and uses a short configured expiry.
- [ ] Legacy keys have a migration/read-compatibility plan and cannot bypass the new check.

**Verification:** Foreign-object signing and retrieval tests; bucket/prefix inventory comparison.  
**Dependencies:** ENT-1002, ENT-1003.  
**Owner / size / confidence:** Backend engineer / M / Medium.  
**Likely files:** `server/api/storage/`, `server/api/_uploads/`, storage utilities, tests.

## ENT-1008 — Tenant-bind cache and KV operations

**Outcome:** Namespace cache keys and invalidation by cell and organisation.

**Acceptance criteria:**

- [ ] A shared key constructor rejects absent tenant context for tenant-owned data.
- [ ] Invalidation cannot use an unbounded prefix spanning customer cells.
- [ ] Cache warming for one organisation cannot change another organisation's response.

**Verification:** Unit tests for key construction and two-tenant integration tests for warm/invalidate behavior.  
**Dependencies:** ENT-1002.  
**Owner / size / confidence:** Backend engineer / M / Medium.  
**Likely files:** `server/utils/`, API cache call sites, worker cache call sites, tests.

## ENT-1009 — Define and enforce tenant-bound job envelopes

**Outcome:** Standardise all queue and workflow messages around immutable ownership, actor, correlation and idempotency metadata.

**Acceptance criteria:**

- [ ] Producers use a versioned schema and consumers validate it before payload processing.
- [ ] Missing or mismatched context is rejected to a redacted dead-letter path.
- [ ] Retries are idempotent and never infer a tenant from payload content or defaults.

**Verification:** Producer/consumer contract tests, poison-message tests and duplicate-delivery tests.  
**Dependencies:** ENT-0003, ENT-1002.  
**Owner / size / confidence:** Platform engineer / L / Low.  
**Likely files:** `workers/`, `server/utils/agencyWorkflows/`, workflow tests.

## ENT-1010 — Tenant-bind realtime and Durable Object identities

**Outcome:** Include the cell/organisation boundary in room and object identity.

**Acceptance criteria:**

- [ ] Room names are built through one canonical function.
- [ ] Connection authentication confirms membership before joining.
- [ ] Identical inner resource IDs in two organisations resolve to different objects and event streams.

**Verification:** Two-tenant WebSocket/room tests for join, publish and history access.  
**Dependencies:** ENT-1002, ENT-1003.  
**Owner / size / confidence:** Platform engineer / L / Medium.  
**Likely files:** `server/durable-objects/`, `server/api/ws/`, room workers, `test/workers/`.

## ENT-1011 — Tenant-bind AI memory, retrieval and usage

**Outcome:** Ensure prompts, conversations, embeddings, tools, memory and metering remain inside the organisation boundary.

**Acceptance criteria:**

- [ ] Every retrieval query and memory write requires a verified namespace.
- [ ] AI tool execution receives signed actor and organisation context and rechecks policy.
- [ ] Usage events exclude unnecessary prompt content and identify provider/model/feature.

**Verification:** Canary documents prove zero cross-tenant retrieval; tool tests reject forged or absent context.  
**Dependencies:** ENT-1002, ENT-1003.  
**Owner / size / confidence:** AI/platform engineer / L / Low.  
**Likely files:** `server/utils/ai/`, `server/api/ai/`, AI workers, `evals/`, `test/ai/`.

## ENT-1012 — Separate system defaults from ADME customer data

**Outcome:** Remove ADME-specific seeds, credentials, branding, mappings and runtime assumptions from deployable defaults.

**Acceptance criteria:**

- [ ] A fresh database contains only documented system templates and roles.
- [ ] Customer examples use synthetic fixtures rather than copied production data.
- [ ] Branding and feature differences come from cell configuration or entitlements.

**Verification:** Fresh-environment scan contains no ADME identifiers or credentials; smoke tests pass with synthetic data.  
**Dependencies:** ENT-0002, ENT-1001.  
**Owner / size / confidence:** Backend/product engineer / L / Low.  
**Likely files:** `server/database/`, seed scripts, configuration, fixtures.

## ENT-1013 — Create a versioned customer-cell infrastructure template

**Outcome:** Represent application deployment, database, Hyperdrive, R2, KV, queues, Durable Objects, Vectorize, secrets and monitoring as repeatable infrastructure.

**Acceptance criteria:**

- [ ] Plan and apply are deterministic for a named cell and region.
- [ ] Resource names, tags and policies include the cell identifier.
- [ ] Drift is detectable and destructive changes require explicit approval.

**Verification:** Create two non-production cells, compare manifests and prove resource separation.  
**Dependencies:** ENT-0004, ENT-0007, ENT-1018 (the template targets the migrated Workers runtime, not Pages).  
**Owner / size / confidence:** SRE/platform engineer / L / Low.  
**Likely files:** new `infrastructure/`, `wrangler*.json*`, deployment scripts.

## ENT-1014 — Build backwards-compatible schema deployment and version reporting

**Outcome:** Apply migrations safely to independently deployed cells and report application/schema compatibility.

**Acceptance criteria:**

- [ ] Migration runs are locked, idempotent, recorded and resumable after failure.
- [ ] Expand/migrate/contract rules support mixed application versions during cohorts.
- [ ] Health reports current schema and application artifact versions.

**Verification:** Re-run, interrupted-run and old-app/new-schema compatibility tests on a production-shaped database.  
**Dependencies:** ENT-1001, ENT-1013.  
**Owner / size / confidence:** Database/platform engineer / L / Medium.  
**Likely files:** `server/database/migrations/`, `scripts/`, health endpoints, CI.

## ENT-1015 — Create the cell smoke and isolation suite

**Outcome:** Provide one command that proves a cell is safe before traffic activation.

**Acceptance criteria:**

- [ ] Suite covers login, work management, Xero, files, queue/background work, realtime and AI paths selected for launch.
- [ ] It runs with two synthetic organisations and includes foreign-ID attempts.
- [ ] Results are machine-readable and retained against the cell/version.

**Verification:** Suite detects an intentionally introduced unscoped fixture and blocks activation.  
**Dependencies:** ENT-1004 through ENT-1011.  
**Owner / size / confidence:** QA/platform engineer / L / Medium.  
**Likely files:** `test/enterprise/`, `scripts/`, `package.json`, CI.

## ENT-1016 — Implement backup evidence and a complete restore runbook

**Outcome:** Demonstrate recovery of an entire customer cell, not only database connectivity.

**Acceptance criteria:**

- [ ] Backup evidence and retention are visible per database and required object data.
- [ ] Restore validates users, data, credentials, queues, storage, application health and access.
- [ ] A timed exercise meets the approved RPO/RTO or records a funded remediation plan.

**Verification:** Restore a non-production cell from point-in-time backup and execute ENT-1015.  
**Dependencies:** ENT-1013, ENT-1014, ENT-1015.  
**Owner / size / confidence:** SRE / L / Low.  
**Likely files:** `docs/runbooks/`, infrastructure code, recovery scripts, evidence records.

## ENT-1017 — Establish tenant-safe observability

**Outcome:** Make application, database, worker, integration and job health diagnosable per cell and organisation.

**Acceptance criteria:**

- [ ] Structured telemetry includes safe cell, organisation, actor and correlation fields where applicable.
- [ ] Redaction tests prevent credentials, OAuth tokens, prompts and customer payloads entering logs.
- [ ] Alerts identify impact, owner and runbook without revealing other customers.

**Verification:** Synthetic failure is traceable across request and job boundaries; redaction canaries are absent from telemetry.  
**Dependencies:** ENT-0003, ENT-1009, ENT-1013.  
**Owner / size / confidence:** SRE/platform engineer / L / Medium.  
**Likely files:** `server/plugins/`, `server/utils/ai/observe/`, workers, `docs/runbooks/`, observability tests.

## ENT-1018 — Migrate the application deployment from Cloudflare Pages to the chosen Workers runtime

> Sequenced before ENT-1013 despite its identifier: the infrastructure template must target the migrated runtime.

**Outcome:** Run the existing application on the runtime selected in ENT-0008 so every cell resource can be provisioned through APIs and versioned configuration, with no dashboard steps.

**Acceptance criteria:**

- [ ] The production build serves through the new runtime with feature parity: routing, static assets, bindings, environment configuration, Durable Objects, queues and crons.
- [ ] Queue consumers, cron triggers and bindings are declared in versioned configuration; a redeploy cannot silently drop them.
- [ ] Companion cron workers (e.g. `workers/pages-cron`, `workers/jobs-consumer`) are absorbed into the runtime's native `scheduled()`/queue handlers or explicitly retained with documented reasons.
- [ ] Deploy tooling replaces the single-project guard in `scripts/deploy-pages.mjs` with cell-aware target validation that preserves the wrong-target protection it was built for (see `docs/incidents/2026-07-13-dealer-network-pages-cross-deployment.md`).
- [ ] ADME production cuts over with a rehearsed rollback path.

**Verification:** Production cutover with rollback plan; existing smoke and Vitest suites pass; a scheduled path and a queue-consuming path execute end to end without any dashboard configuration.  
**Dependencies:** ENT-0007, ENT-0008.  
**Owner / size / confidence:** SRE/platform engineer / L / Medium.  
**Likely files:** `nuxt.config.ts` (Nitro preset), `wrangler.toml`, `scripts/`, `.github/workflows/`, `workers/`.

### Checkpoint M1 — Cell-ready platform

- [ ] The application runs on the chosen Workers runtime; no binding, queue consumer or cron trigger requires dashboard configuration.
- [ ] A fresh synthetic cell is created entirely from versioned automation.
- [ ] No manual database editing or copied production secret is required.
- [ ] Cell smoke and cross-tenant tests pass.
- [ ] Backup restoration meets the approved recovery target.
- [ ] ADME continues operating through the compatibility path.
- [ ] Decision: begin control-plane build or remediate cell gaps.

---

# Phase 2 — Control Plane and Automated Provisioning

## ENT-2001 — Define the control-plane API and data model

**Outcome:** Model enterprise contracts, deployment cells, provisioning operations, versions, health, entitlements and operator audit references.

**Acceptance criteria:**

- [ ] Control-plane records contain operational metadata, not normal customer business content.
- [ ] APIs are versioned, authenticated and idempotency-aware.
- [ ] Cell credentials are references to a secrets service, not plaintext database fields.

**Verification:** Schema review, API contract tests and threat model.  
**Dependencies:** ENT-0001, ENT-0004, ENT-0005.  
**Owner / size / confidence:** Platform engineer / L / Medium.  
**Likely files:** new control-plane module/service, migrations, `docs/specs/`, contract tests.

## ENT-2002 — Build the provisioning state machine

**Outcome:** Represent requested, validating, provisioning, testing, ready, active, failed, suspended and decommissioning states with safe retries.

**Acceptance criteria:**

- [ ] Every transition names its actor, preconditions, retry policy and compensation behavior.
- [ ] Repeating an operation with the same idempotency key does not duplicate resources.
- [ ] Failed/partial cells cannot become routable through an out-of-order event.

**Verification:** State-machine unit tests cover all legal and illegal transitions, retry and timeout paths.  
**Dependencies:** ENT-2001.  
**Owner / size / confidence:** Platform engineer / M / Medium.  
**Likely files:** control-plane service, workflow worker, tests.

## ENT-2003 — Automate resource creation, migration and seeding

**Outcome:** Execute the infrastructure template, configure secrets, apply migrations and install approved system templates from one provisioning request.

**Acceptance criteria:**

- [ ] Each step records start, completion, artifact version, output reference and safe error.
- [ ] Retry resumes from verified state rather than blindly repeating destructive operations.
- [ ] Fresh cells contain no customer-specific data and pass configuration validation.

**Verification:** Provision two cells, interrupt one mid-run, resume it and compare final declared/actual resources.  
**Dependencies:** ENT-1012 through ENT-1014, ENT-2002.  
**Owner / size / confidence:** SRE/platform engineer / L / Low.  
**Likely files:** infrastructure code, provisioning workflows, deployment scripts, tests.

## ENT-2004 — Automate hostname validation, routing and activation

**Outcome:** Map an approved XeroFlow subdomain to a healthy cell and prevent routing before activation gates pass.

**Acceptance criteria:**

- [ ] Hostname uniqueness and ownership are validated.
- [ ] Routing resolves to immutable cell identity and rejects unknown/suspended hosts.
- [ ] Activation requires successful migrations, smoke tests and health registration.

**Verification:** Unknown, duplicate, failed, suspended and active hostname tests at the edge.  
**Dependencies:** ENT-1015, ENT-2002, ENT-2003.  
**Owner / size / confidence:** Platform/SRE engineer / L / Medium.  
**Likely files:** edge routing, Cloudflare configuration, control-plane APIs, tests.

## ENT-2005 — Build cell health and version registry

**Outcome:** Give operators one view of artifact version, schema version, health, backup evidence and integration degradation per cell.

**Acceptance criteria:**

- [ ] Health signals are authenticated, signed or otherwise resistant to spoofing.
- [ ] Stale/unknown status is visibly distinct from healthy status.
- [ ] Customer-sensitive logs and records remain in the cell, linked by safe correlation metadata.

**Verification:** Simulated stale heartbeat, schema mismatch and integration failure appear correctly.  
**Dependencies:** ENT-1014, ENT-1017, ENT-2001.  
**Owner / size / confidence:** Platform engineer / M / Medium.  
**Likely files:** cell health endpoint, control-plane service, operator UI, tests.

## ENT-2006 — Implement suspend, reactivate and decommission workflows

**Outcome:** Safely manage cell lifecycle without turning contract suspension into destructive deletion.

**Acceptance criteria:**

- [ ] Suspension behavior follows approved read-only/grace/block policy and revokes prohibited access.
- [ ] Reactivation is authorised, auditable and health-gated.
- [ ] Decommissioning requires approvals, export window and delayed irreversible steps.

**Verification:** End-to-end state tests plus cancellation before the irreversible boundary.  
**Dependencies:** ENT-2002, ENT-2004.  
**Owner / size / confidence:** Platform engineer / L / Medium.  
**Likely files:** control-plane workflows, routing, auth/session hooks, tests.

## ENT-2007 — Build the minimum operator console

**Outcome:** Allow authorised XeroFlow staff to request cells, inspect progress, activate, suspend and view health without direct database edits.

**Acceptance criteria:**

- [ ] Separate operator roles govern create, activate, suspend and decommission actions.
- [ ] High-risk operations require reauthentication and explicit confirmation.
- [ ] Every view and mutation produces an operator audit event.

**Verification:** Role matrix tests, accessibility check and end-to-end provisioning walkthrough.  
**Dependencies:** ENT-2001 through ENT-2006.  
**Owner / size / confidence:** Full-stack engineer / L / Medium.  
**Likely files:** operator pages/components, control-plane APIs, middleware, tests.

## ENT-2008 — Implement release cohorts and rollback gates

**Outcome:** Promote signed artifacts through internal, canary and customer cohorts without permanent customer forks.

**Acceptance criteria:**

- [ ] Promotion requires build provenance, migration compatibility, smoke tests and health thresholds.
- [ ] Failed gates halt later cohorts automatically.
- [ ] Roll-forward/rollback procedure states what is safe after each migration stage.

**Verification:** Rehearsed canary release with an injected health failure blocks promotion and follows the runbook.  
**Dependencies:** ENT-1014, ENT-1015, ENT-2005.  
**Owner / size / confidence:** SRE / L / Low.  
**Likely files:** `.github/workflows/`, deployment scripts, control-plane release data, `docs/runbooks/`.

### Checkpoint M2 — Repeatable second-cell creation

- [ ] An operator provisions a second synthetic cell without direct provider-console or database edits.
- [ ] Failed provisioning is recoverable and never receives customer traffic.
- [ ] Version, health and backup evidence are centrally visible.
- [ ] Suspension and a cohort upgrade are successfully rehearsed.
- [ ] Decision: begin enterprise identity integration and customer-facing administration.

---

# Phase 3 — Enterprise Identity, Authorisation and Administration

## ENT-3001 — Integrate the selected enterprise identity provider

**Outcome:** Establish signed webhook handling and typed service boundaries for SAML/OIDC and directory operations.

**Acceptance criteria:**

- [ ] Provider organisation/connection identifiers map to verified XeroFlow enterprise records.
- [ ] Webhooks verify signatures, timestamp/replay rules and idempotency.
- [ ] Provider outages fail safely and expose actionable health state.

**Verification:** Provider sandbox contract suite including forged, duplicate and delayed events.  
**Dependencies:** ENT-0004, ENT-2001.  
**Owner / size / confidence:** Identity engineer / L / Medium.  
**Likely files:** identity service/utilities, `server/api/webhooks/`, migrations, tests.

## ENT-3002 — Build domain verification and SSO connection setup

**Outcome:** Let enterprise administrators prove domain ownership and configure SAML or OIDC safely.

**Acceptance criteria:**

- [ ] Verification tokens expire, are single-purpose and cannot claim a domain owned elsewhere.
- [ ] Metadata/client configuration is validated before enforcement.
- [ ] At least one tested break-glass administrator remains during SSO enforcement changes.

**Verification:** End-to-end valid, expired, duplicate-domain and misconfigured-IdP cases.  
**Dependencies:** ENT-3001.  
**Owner / size / confidence:** Full-stack/identity engineer / L / Medium.  
**Likely files:** admin APIs/pages, identity utilities, migrations, tests.

## ENT-3003 — Implement SSO login and verified identity binding

**Outcome:** Authenticate managed users without relying on email matching alone.

**Acceptance criteria:**

- [ ] Login binds provider subject, verified connection and enterprise/organisation membership.
- [ ] Ambiguous, disabled or mismatched identities fail closed.
- [ ] Just-in-time creation follows an explicit policy and safe default role.

**Verification:** SSO end-to-end tests for first login, returning login, wrong connection and disabled membership.  
**Dependencies:** ENT-1001 through ENT-1003, ENT-3002.  
**Owner / size / confidence:** Identity/backend engineer / L / Medium.  
**Likely files:** `server/api/auth/`, middleware, identity service, sign-in pages, tests.

## ENT-3004 — Add enterprise session policy and revocation

**Outcome:** Support idle timeout, absolute lifetime, active-session visibility, revocation and SSO-only domains.

**Existing assets:** Session revocation and SHA-256 hashed session tokens at rest already exist (migration `191_session_invalidation.sql`). This task extends them with policy configuration, lifetime enforcement and administrator visibility — it is not a build-from-scratch.

**Acceptance criteria:**

- [ ] Policy changes apply predictably to existing and new sessions.
- [ ] Administrator or directory deprovisioning invalidates access within five minutes.
- [ ] Sensitive changes require recent authentication or IdP step-up where supported.

**Verification:** Time-controlled session tests and end-to-end revoke-all/revoke-one scenarios.  
**Dependencies:** ENT-3003.  
**Owner / size / confidence:** Identity engineer / M / Medium.  
**Likely files:** auth APIs, middleware, session storage, admin UI, tests.

## ENT-3005 — Implement SCIM/directory lifecycle processing

> **Partner-gated (ENT-0009):** required for the pilot only if the design-partner contract requires directory lifecycle management. Otherwise the pilot ships SSO login with manual membership administration, and this task is scheduled before GA.

**Outcome:** Create, update, suspend, reactivate and deprovision managed users idempotently.

**Acceptance criteria:**

- [ ] Events are ordered or reconciled safely when delivered late or repeatedly.
- [ ] Deprovisioning removes sessions and memberships without destroying attributable business history.
- [ ] Directory conflicts and failed events are visible to administrators.

**Verification:** Provider conformance tests plus duplicate, out-of-order and recovery scenarios.  
**Dependencies:** ENT-3001, ENT-3004.  
**Owner / size / confidence:** Identity/backend engineer / L / Low.  
**Likely files:** directory APIs/webhooks, identity service, migrations, admin UI, tests.

## ENT-3006 — Implement group-to-role mapping

**Outcome:** Map IdP/directory groups to organisation roles with safe defaults.

**Acceptance criteria:**

- [ ] Mapping previews show additions, removals and privilege increases before activation.
- [ ] Unmapped users receive the configured safe role or no access.
- [ ] Removal from a privileged group removes the derived permission promptly.

**Verification:** Mapping reconciliation tests and privilege-removal end-to-end test.  
**Dependencies:** ENT-1003, ENT-3005.  
**Owner / size / confidence:** Identity/full-stack engineer / M / Medium.  
**Likely files:** identity service, role APIs, admin UI, tests.

## ENT-3007 — Complete the enterprise RBAC role matrix

**Outcome:** Support enterprise owner/admin, organisation owner/admin, manager, member, viewer, external collaborator and service-account principals.

**Existing assets:** DB-driven custom roles already exist (`server/utils/roleResolver.ts`, 15 base roles plus custom roles, global write-block middleware). The new work is the enterprise/organisation two-tier structure and peer-organisation isolation, layered on the existing resolver rather than replacing it.

**Acceptance criteria:**

- [ ] A versioned permission catalogue defines every launch-critical action.
- [ ] Organisation roles cannot inspect peers without an enterprise-level grant.
- [ ] Custom roles remain organisation-scoped unless explicitly published as an enterprise template.

**Verification:** Generated allow/deny matrix with cross-organisation and privilege-escalation tests.  
**Dependencies:** ENT-1003, ENT-1005.  
**Owner / size / confidence:** Security/backend engineer / L / Medium.  
**Likely files:** role/admin APIs, policy utilities, migrations, tests.

## ENT-3008 — Build enterprise hierarchy and organisation administration

**Outcome:** Give enterprise administrators controlled management of organisations, workspaces, memberships and organisation settings.

**Acceptance criteria:**

- [ ] Contract limits govern organisation creation.
- [ ] Enterprise and organisation administrators see only authorised hierarchy and settings.
- [ ] Branding, locale and timezone changes are validated and audited.

**Verification:** Role-based API and UI tests with two peer organisations; WCAG 2.2 AA review.  
**Dependencies:** ENT-1001, ENT-3007.  
**Owner / size / confidence:** Full-stack engineer / L / Medium.  
**Likely files:** `server/api/admin/`, enterprise admin pages/components, tests.

## ENT-3009 — Implement scoped service accounts

**Outcome:** Support non-human principals with scoped, rotatable and revocable credentials.

**Acceptance criteria:**

- [ ] Credentials are shown once, stored hashed/encrypted as appropriate and expire by policy.
- [ ] Service accounts cannot enter interactive login or inherit human session behavior.
- [ ] Creation, rotation, use and revocation are audited.

**Verification:** Scope, expiry, rotation and interactive-login denial tests.  
**Dependencies:** ENT-1003, ENT-3007.  
**Owner / size / confidence:** Security/backend engineer / M / Medium.  
**Likely files:** auth/admin APIs, migrations, policy utilities, admin UI, tests.

## ENT-3010 — Build identity and access administration views

**Outcome:** Let authorised administrators view users, memberships, groups, roles, sessions, service accounts and connection health.

**Acceptance criteria:**

- [ ] Destructive or privilege-changing actions clearly show scope and consequences.
- [ ] Sensitive changes use reauthentication and audit hooks.
- [ ] Pagination/search cannot leak names or counts from peer organisations.

**Verification:** End-to-end administrator journeys, isolation checks and accessibility audit.  
**Dependencies:** ENT-3004 through ENT-3009.  
**Owner / size / confidence:** Frontend/full-stack engineer / L / Medium.  
**Likely files:** enterprise admin pages/components, admin APIs, tests.

### Checkpoint M3 — Enterprise access lifecycle

- [ ] A test customer configures a verified domain and SSO connection.
- [ ] Directory create, update and deprovision complete end to end where SCIM is pilot-required (ENT-0009); otherwise manual membership administration is demonstrated and SCIM is scheduled before GA.
- [ ] Deprovisioned or administrator-revoked access is invalid within five minutes.
- [ ] The complete role matrix passes positive and negative isolation tests.
- [ ] A customer administrator can complete launch identity tasks without database assistance.

---

# Phase 4 — Audit, Governance, Lifecycle and Commercial Controls

## ENT-4001 — Define the canonical append-only audit event

**Outcome:** Establish a versioned event schema and emission library for product, identity, worker, AI, support and control-plane actions.

**Acceptance criteria:**

- [ ] Schema includes event/received times, enterprise, organisation, actor/type, action, target, outcome, IP, user agent and correlation ID.
- [ ] Metadata uses allowlisted fields and mandatory redaction.
- [ ] Product APIs cannot edit or delete audit events.

**Verification:** Schema contract tests, immutability test and secret/canary redaction test.  
**Dependencies:** ENT-0003, ENT-1017, ENT-2001.  
**Owner / size / confidence:** Security/platform engineer / M / Medium.  
**Likely files:** shared audit utility, migrations/storage, event contracts, tests.

## ENT-4002 — Instrument all launch-critical audit actions

**Outcome:** Emit audit events for authentication, membership, permission, export, integration, support, AI and destructive activity.

**Acceptance criteria:**

- [ ] An approved coverage matrix maps every PRD audit requirement to an emitter and test.
- [ ] Failed actions and denied high-risk actions are represented.
- [ ] Temporary export failure cannot silently discard the source event.

**Verification:** Coverage test and sampled end-to-end correlation from UI action to stored event.  
**Dependencies:** ENT-4001 and the relevant feature tasks.  
**Owner / size / confidence:** Backend team / L / Low.  
**Likely files:** `server/api/`, `workers/`, identity/control-plane services, tests.

## ENT-4003 — Build customer audit search and export

**Outcome:** Allow authorised customers to filter and export their own immutable events.

**Acceptance criteria:**

- [ ] Filters cover time, actor, action, target and outcome with bounded pagination.
- [ ] Export is asynchronous, tenant-bound and itself audited.
- [ ] Organisation administrators cannot search peer organisations.

**Verification:** Large dataset, foreign-ID, export expiry and accessibility tests.  
**Dependencies:** ENT-4001, ENT-4002.  
**Owner / size / confidence:** Full-stack engineer / L / Medium.  
**Likely files:** audit APIs, admin pages/components, export worker, tests.

## ENT-4004 — Implement SIEM/audit event streaming

> **Partner-gated (ENT-0009):** required for the pilot only if the design-partner contract requires SIEM delivery. Customer audit search and export (ENT-4003) remain pilot-blocking either way; streaming deferred here is scheduled before GA.

**Outcome:** Deliver customer events to an approved HTTPS/SIEM destination reliably.

**Acceptance criteria:**

- [ ] Destination secrets are protected and test delivery is available.
- [ ] Retries, backoff, dead-letter handling and observable lag are implemented.
- [ ] Delivery is ordered or carries sufficient identifiers for customer-side reconciliation.

**Verification:** Receiver contract tests, outage/recovery exercise and cross-customer destination isolation.  
**Dependencies:** ENT-1009, ENT-4001.  
**Owner / size / confidence:** Platform engineer / L / Medium.  
**Likely files:** audit delivery worker, admin APIs/UI, secrets integration, tests.

## ENT-4005 — Implement time-bound support access

**Outcome:** Replace standing customer-data access with purpose-bound, scoped, approved and expiring grants.

**Acceptance criteria:**

- [ ] Grant records approver, purpose, scope, start and expiry.
- [ ] Runtime policy validates the active grant on every protected support action.
- [ ] Break-glass use alerts security and requires post-use review.

**Verification:** Expiry, out-of-scope, revocation and break-glass tests with customer-visible audit records.  
**Dependencies:** ENT-1003, ENT-3007, ENT-4001.  
**Owner / size / confidence:** Security/full-stack engineer / L / Medium.  
**Likely files:** support-access APIs/UI, policy layer, migrations, tests.

## ENT-4006 — Implement retention schedules and legal hold

> **Partially partner-gated (ENT-0009):** retention schedules are pilot-blocking; the legal-hold capability is required for the pilot only if the design-partner contract requires it, and is otherwise scheduled before GA.

**Outcome:** Enforce supported record-class retention while preventing deletion under legal hold.

**Acceptance criteria:**

- [ ] Policies are versioned, organisation-bound and constrained by contract/legal minimums.
- [ ] Jobs are idempotent, observable and emit evidence of evaluated/deleted/skipped records.
- [ ] Legal hold is permissioned and auditable and overrides automated deletion.

**Verification:** Time-controlled deletion, retry, foreign-tenant and legal-hold tests.  
**Dependencies:** ENT-1009, ENT-4001.  
**Owner / size / confidence:** Backend/privacy engineer / L / Low.  
**Likely files:** lifecycle APIs, scheduled workers, migrations, admin UI, tests.

## ENT-4007 — Build customer data export and deletion evidence

**Outcome:** Export documented machine-readable data and execute the live-data portion of decommissioning with evidence.

**Acceptance criteria:**

- [ ] Export manifest lists formats, counts, checksums, omissions and expiry.
- [ ] Download requires current authorisation and a short-lived URL.
- [ ] Deletion distinguishes live systems from backup-expiry obligations and integration revocation.

**Verification:** Restore/export comparison, expired-link test and full synthetic decommission rehearsal.  
**Dependencies:** ENT-2006, ENT-4001, ENT-4006.  
**Owner / size / confidence:** Backend/SRE engineer / L / Low.  
**Likely files:** export APIs/workers, lifecycle workflows, storage, `docs/runbooks/`, tests.

## ENT-4008 — Implement enterprise AI policy enforcement

**Outcome:** Let enterprise administrators govern AI by organisation, feature, provider, model and approval requirement.

**Acceptance criteria:**

- [ ] Policy is evaluated server-side before model invocation and again before material tool action.
- [ ] Disabled or disallowed provider/region combinations fail closed.
- [ ] Conversations, memory and embeddings follow retention and deletion policy.

**Verification:** Policy matrix, attempted bypass and approval-required tool tests.  
**Dependencies:** ENT-1011, ENT-3008, ENT-4001, ENT-4006.  
**Owner / size / confidence:** AI/security engineer / L / Medium.  
**Likely files:** AI controller/policy utilities, admin APIs/UI, evals, tests.

## ENT-4009 — Build contracts and entitlements model

**Outcome:** Represent modules, seats, organisations, environments, storage, AI, support, residency, retention and integration limits centrally.

**Acceptance criteria:**

- [ ] Contract data and runtime entitlement snapshots have explicit version/effective dates.
- [ ] Cell cache is signed/versioned or fetched through an authenticated contract.
- [ ] Missing/stale entitlement behavior is defined per feature and never silently grants access.

**Verification:** Contract tests for activation, downgrade, expiry, stale cache and forged snapshots.  
**Dependencies:** ENT-2001, ENT-1008.  
**Owner / size / confidence:** Platform/backend engineer / L / Medium.  
**Likely files:** control-plane contract service, cell entitlement utility, migrations, tests.

## ENT-4010 — Enforce usage limits and contract-safe suspension

**Outcome:** Meter usage and apply warning, soft-limit, approval or hard-limit behavior without destroying customer data.

**Acceptance criteria:**

- [ ] Usage dimensions are attributable by cell, organisation, feature and period.
- [ ] Limit behavior is explicit for seats, storage, AI and integrations.
- [ ] Contract expiry follows approved grace/read-only/block behavior and does not trigger deletion.

**Verification:** Boundary, concurrent-update, delayed-meter and suspension/reactivation tests.  
**Dependencies:** ENT-2006, ENT-4009.  
**Owner / size / confidence:** Backend/product engineer / L / Medium.  
**Likely files:** metering service/workers, policy utilities, admin usage UI, tests.

## ENT-4011 — Produce the enterprise security and privacy evidence pack

**Outcome:** Create customer-reviewable documentation aligned with implemented controls.

**Acceptance criteria:**

- [ ] Pack covers architecture, data flow, subprocessors, residency caveats, encryption, access, SDLC, incident response, backup and deletion.
- [ ] Every control claim links to an owner and current evidence.
- [ ] Marketing and contract language does not overstate certification, residency or availability.

**Verification:** Security, privacy, legal and product review using a representative customer questionnaire.  
**Dependencies:** ENT-0005 and implemented controls.  
**Owner / size / confidence:** Security/privacy/product / L / Medium.  
**Likely files:** `docs/security/`, `docs/runbooks/`, customer-facing trust documentation.

### Checkpoint M4 — Governed enterprise operation

- [ ] Launch-critical actions appear in customer-searchable audit history.
- [ ] SIEM delivery survives an outage without silent loss, where pilot-required (ENT-0009); deferred streaming has a GA-dated plan.
- [ ] Support access expires and is fully attributable.
- [ ] Retention, export and synthetic decommissioning pass; legal hold passes where pilot-required, otherwise has a GA-dated plan.
- [ ] Entitlement and AI policies resist client-side bypass.
- [ ] Security/privacy evidence matches actual behavior, including which partner-negotiable controls are deferred and until when.

---

# Phase 5 — Enterprise Design-Partner Pilot

## ENT-5001 — Convert the design-partner commitment into the pilot contract

**Outcome:** Convert the ENT-0009 letter of intent into a full pilot contract for the customer whose requirements fit the first isolated-cell release.

**Acceptance criteria:**

- [ ] Customer structure, modules, region, integrations, identity provider and migration volume still fit the launch boundaries fixed in ENT-0009; any drift is renegotiated or rejected, not absorbed.
- [ ] Success metrics, support model, feedback cadence and pilot exit rights are written.
- [ ] DPA, service schedule, subprocessors and pilot limitations are approved.

**Verification:** Cross-functional go/no-go review with no unresolved assumption hidden in sales notes.  
**Dependencies:** ENT-0009, ENT-0005, M2 scope confidence.  
**Owner / size / confidence:** Product/commercial / M / Medium.

## ENT-5002 — Complete customer discovery and migration mapping

**Outcome:** Map customer organisations, users, roles, data, files, integrations and retention requirements to the target model.

**Acceptance criteria:**

- [ ] Source-to-target mappings, transformations, exclusions and reconciliation rules are approved.
- [ ] Data classification identifies sensitive and regulated fields.
- [ ] Cutover dependencies and rollback boundary are documented.

**Verification:** Customer sign-off on mapping and sample-data reconciliation.  
**Dependencies:** ENT-5001, ENT-1001, ENT-3008.  
**Owner / size / confidence:** Implementation lead / L / Low.  
**Likely files:** customer-restricted implementation plan and migration tooling.

## ENT-5003 — Rehearse migration with sanitised or controlled data

**Outcome:** Prove repeatable import, reconciliation, timing and rollback before production cutover.

**Acceptance criteria:**

- [ ] Migration is idempotent or safely restartable.
- [ ] Counts, financial totals, ownership, files and memberships reconcile within agreed tolerance.
- [ ] Logs and temporary artifacts follow approved data-handling and deletion rules.

**Verification:** At least two rehearsals, including one injected failure and successful restart.  
**Dependencies:** ENT-5002, ENT-1014, ENT-4007.  
**Owner / size / confidence:** Data/backend engineer / L / Low.

## ENT-5004 — Provision and configure the production design-partner cell

**Outcome:** Create the cell through normal automation and configure hostname, SSO, directory, roles, policies, integrations and monitoring.

**Acceptance criteria:**

- [ ] No customer-specific source branch or manual database mutation is used.
- [ ] Smoke, isolation, identity and restore-readiness gates pass before activation.
- [ ] Operator and customer admin handover records are complete.

**Verification:** Control-plane evidence and signed launch checklist.  
**Dependencies:** M2, M3, M4, ENT-5003.  
**Owner / size / confidence:** Implementation lead/SRE / L / Medium.

## ENT-5005 — Run customer UAT and security review

**Outcome:** Obtain evidence that business workflows and customer security requirements are satisfied.

**Acceptance criteria:**

- [ ] UAT covers agreed critical workflows and admin lifecycle operations.
- [ ] Customer security findings have owner, severity, due date and disposition.
- [ ] No unresolved severity-one or severity-two isolation finding remains.

**Verification:** Customer-approved UAT report and security finding register.  
**Dependencies:** ENT-5004.  
**Owner / size / confidence:** Product/QA/security / L / Medium.

## ENT-5006 — Exercise restore, incident, revocation and decommission workflows

**Outcome:** Validate operational promises with the partner configuration before live reliance.

**Acceptance criteria:**

- [ ] Timed restore meets or records variance from RPO/RTO.
- [ ] Identity deprovision, integration revocation and support-access expiry are demonstrated.
- [ ] Incident tabletop produces customer communication and corrective actions.

**Verification:** Signed exercise reports with timestamps and evidence references.  
**Dependencies:** ENT-5004, ENT-1016, ENT-2006, ENT-4005.  
**Owner / size / confidence:** SRE/security/implementation lead / M / Medium.

## ENT-5007 — Operate a measured pilot period

**Outcome:** Run the partner in production long enough to assess reliability, support burden and unit economics.

**Acceptance criteria:**

- [ ] Pilot duration and minimum meaningful usage are agreed before activation.
- [ ] Weekly review covers SLOs, incidents, support hours, provisioning gaps, cost and customer feedback.
- [ ] Workarounds are either removed or explicitly accepted before declaring the platform repeatable.

**Verification:** Pilot scorecard with at least 30 days of representative operation unless governance approves a different period.  
**Dependencies:** ENT-5005, ENT-5006.  
**Owner / size / confidence:** Product/SRE / L elapsed / Medium.

### Checkpoint M5 — Design-partner release decision

- [ ] Customer acceptance criteria are met.
- [ ] No unresolved Sev-1/Sev-2 isolation or security finding remains.
- [ ] SLO, support-load and infrastructure-cost results are understood.
- [ ] All manual operational steps have a removal plan and owner.
- [ ] Decision: extend pilot, onboard a second controlled customer or proceed to GA hardening.

---

# Phase 6 — Enterprise General Availability Hardening

## ENT-6001 — Commission and remediate an independent penetration test

**Outcome:** Test tenant isolation, identity, APIs, support access, OAuth/webhooks, files and control-plane operations independently.

**Acceptance criteria:**

- [ ] Scope includes authenticated cross-tenant attacks and privilege escalation.
- [ ] Critical/high findings are fixed and retested or formally risk-accepted by authorised leadership.
- [ ] Regression tests preserve every remediated isolation finding.

**Verification:** Final assessor report and internal closure register.  
**Dependencies:** Stable M3/M4 feature set, preferably M5 evidence.  
**Owner / size / confidence:** Security lead / external schedule / Medium.

## ENT-6002 — Operationalise SLOs, on-call and customer status communication

**Outcome:** Make availability and incident commitments supportable around the clock at the contracted level.

**Acceptance criteria:**

- [ ] SLO dashboards, error budgets and paging thresholds are live per cell.
- [ ] Every page has an owner, severity rubric, runbook and escalation path.
- [ ] Status communication identifies affected customers without exposing unaffected customers.

**Verification:** Game day from alert through customer update, mitigation and post-incident review.  
**Dependencies:** ENT-0005, ENT-1017, M5 operational data.  
**Owner / size / confidence:** SRE/support lead / L / Medium.

## ENT-6003 — Validate enterprise performance and capacity

**Outcome:** Prove core latency, large-enterprise behavior and resource limits at expected and burst load.

**Acceptance criteria:**

- [ ] Workload model reflects measured pilot traffic and projected largest signed customer.
- [ ] Core reads meet the approved p95 target excluding third-party latency.
- [ ] Limits, queues and autoscaling degrade predictably without data loss.

**Verification:** Repeatable load report with bottlenecks, capacity envelope and remediation owners.  
**Dependencies:** ENT-5007, ENT-4010.  
**Owner / size / confidence:** Performance/SRE engineer / L / Medium.

## ENT-6004 — Establish recurring disaster-recovery assurance

**Outcome:** Turn the first restore into a quarterly, measured control for every production cell.

**Acceptance criteria:**

- [ ] Restore schedule, sampling strategy, evidence retention and failure escalation are approved.
- [ ] New cells cannot reach GA state without valid backup evidence.
- [ ] Material backup changes automatically require a new restore exercise.

**Verification:** Scheduled drill creates control-plane evidence and a failure opens an owned incident/action.  
**Dependencies:** ENT-1016, ENT-2005, ENT-6002.  
**Owner / size / confidence:** SRE / M / High.

## ENT-6005 — Prove repeatable cohort upgrades across production cells

**Outcome:** Demonstrate that shared artifacts and schema migrations can safely upgrade more than one customer.

**Acceptance criteria:**

- [ ] At least two production cohort upgrades pass all automated gates.
- [ ] One rollback or roll-forward rehearsal demonstrates the documented recovery path.
- [ ] Unsupported version pinning and maintenance-window rules are operationally enforced.

**Verification:** Release records for two successful upgrades and the recovery rehearsal.  
**Dependencies:** ENT-2008, at least two controlled production cells.  
**Owner / size / confidence:** SRE/platform lead / L elapsed / Medium.

## ENT-6006 — Finalise commercial, legal and support packaging

**Outcome:** Align sales promises and contracts with the implemented product and operating model.

**Acceptance criteria:**

- [ ] Order form covers implementation fee, platform fee, committed seats, usage, add-ons and limits.
- [ ] SLA, DPA, subprocessors, support schedule, deletion and residency statements are approved.
- [ ] Sales qualification rejects requirements the current edition cannot safely support.

**Verification:** Mock enterprise procurement review and signed internal launch approval.  
**Dependencies:** ENT-4011, M5 cost/support data, ENT-6002.  
**Owner / size / confidence:** Commercial/legal/product / L elapsed / Medium.

## ENT-6007 — Complete the enterprise GA go/no-go review

**Outcome:** Make an evidence-based launch decision rather than treating feature completion as readiness.

**Acceptance criteria:**

- [ ] Product, security, privacy, operations, support, legal and commercial checklists are complete.
- [ ] Remaining risks have named owners, deadlines and authorised acceptance.
- [ ] Rollback, incident command and new-customer capacity are confirmed.

**Verification:** Signed GA decision record linked to evidence for every launch criterion.  
**Dependencies:** ENT-6001 through ENT-6006.  
**Owner / size / confidence:** Executive sponsor and programme lead / S / High.

### Checkpoint M6 — Enterprise GA

- [ ] Independent assurance is closed or formally accepted.
- [ ] Two production-cell upgrades have succeeded through cohorts.
- [ ] On-call, status, incident and quarterly restore processes are active.
- [ ] Performance and capacity envelope supports the sales pipeline.
- [ ] Contract language and security evidence match actual controls.
- [ ] Executive go/no-go is recorded.

---

# 6. Cross-Cutting Test Backlog

These assertions are mandatory and should be implemented continuously rather than deferred to the end:

- [ ] Enterprise A cannot list Enterprise B records.
- [ ] A valid object ID from Enterprise B cannot be read by Enterprise A.
- [ ] A write from Enterprise A cannot reference Enterprise B's parent or child object.
- [ ] Organisation administrators cannot infer peer organisation names, counts or activity.
- [ ] Cache warming or invalidation in one organisation cannot affect another.
- [ ] A signed file URL cannot cross organisation scope or survive beyond its intended expiry.
- [ ] Queue messages without trusted tenant context are rejected before payload processing.
- [ ] Duplicate queue and webhook delivery remains idempotent.
- [ ] Forged, expired and replayed OAuth/identity state is rejected.
- [ ] Realtime room names with identical resource IDs remain isolated.
- [ ] Vector search, AI memory and AI tools cannot retrieve or act on foreign data.
- [ ] Entitlement cache tampering cannot grant modules or raise limits.
- [ ] Support grants cannot operate outside scope or after expiry.
- [ ] Suspension and directory deprovisioning invalidate existing access within policy.
- [ ] Logs, traces, errors and dead letters contain no known secret canaries.
- [ ] A failed provisioning or migration cannot become active.
- [ ] Restore produces an operational application, not merely a reachable database.

## 7. Suggested Parallel Workstreams

Parallelism begins only after ENT-0003 contracts are stable.

| Workstream | Can run in parallel with | Coordination boundary |
|---|---|---|
| Runtime migration (ENT-1018) | Cell API migration | Nitro preset, binding names and deploy tooling freeze during cutover |
| Cell API migration | Infrastructure template | Tenant context, resource naming and schema contract |
| Storage/cache isolation | Queue/realtime isolation | Shared tenant key and telemetry fields |
| Control-plane UI | Provisioning engine | Versioned control-plane API |
| SSO/SCIM | RBAC catalogue | Identity-to-membership and role-mapping contract |
| Audit platform | Entitlements | Shared actor, tenant and correlation schema |
| Security evidence | Pilot preparation | Claims must wait for implemented-control evidence |

Database migrations, canonical contracts, provisioning state transitions and production cutovers remain sequentially controlled.

## 8. Programme Risk Register

| Risk | Probability | Impact | Early indicator | Mitigation / owner |
|---|---|---|---|---|
| Cloudflare Pages blocks automated provisioning | Confirmed | Critical | Bindings/queue consumers/crons need dashboard edits; deploy tooling pins one project | Execute ENT-0008 and ENT-1018 before any control-plane work / SRE lead |
| Single-operator capacity overcommitted across workstreams | High | High | Enterprise tasks stall behind agency operations and other product work | Baseline the §2.1 current-capacity calendar; approve hiring or cut design-partner scope; restate scenario at every checkpoint / Product owner |
| Governance built before any customer requires it | Medium | High | SCIM/SIEM/legal-hold work proceeds without a signed partner | ENT-0009 LOI gates Phase 1 investment; partner-gated markers on ENT-3005/ENT-4004/ENT-4006 / Product owner |
| Hidden global/single-agency assumptions | High | Critical | Unscoped queries found late | Complete ENT-0002; migrate representative vertical slice early / Platform lead |
| Existing identity model is harder to separate | High | High | `team_members` dependencies block migration | Compatibility model and phased backfill / Backend lead |
| Worker and AI context is lost asynchronously | Medium | Critical | Jobs infer default tenant | Versioned job envelope and reject-on-missing tests / Platform lead |
| Provider choice delays SSO/SCIM | Medium | High | Procurement or missing feature appears | Time-boxed provider proof of concept in Phase 0 / Identity lead |
| Manual cell provisioning persists | Medium | High | Operator uses provider console/database | Treat repeatable second-cell provisioning as M2 gate / SRE lead |
| Migration across cells becomes unsafe | Medium | Critical | Long locks or mixed-version failures | Expand/migrate/contract and cohort gates / Database lead |
| Enterprise claims exceed evidence | Medium | High | Sales promises unsupported residency/SLA | Evidence-linked security pack and approval / Product/legal |
| Scope expands to all current modules | High | High | Design partner requests unclassified feature | Contract explicit launch module set / Product owner |
| Dedicated-cell cost erodes margin | Medium | Medium | Pilot gross margin below target | Measure per-cell cost; price implementation/platform fees / Commercial lead |
| Operational burden exceeds team capacity | Medium | High | Excess alerts/manual fixes in pilot | Automation budget, actionable alerts and launch capacity gate / SRE lead |
| Shared-database tenancy is introduced prematurely | Low | Critical | Pressure to lower costs before boundaries mature | Separate PRD/ADR and explicit non-goal / Architecture lead |

## 9. Decisions Required Before Sprint Commitment

- [ ] Confirm the first design partner's required module set through a signed LOI (ENT-0009); do not assume the whole current product is launch-critical, and do not begin Phase 1 without the LOI.
- [ ] Choose the Workers runtime that replaces Cloudflare Pages (static assets versus Workers for Platforms) and approve the Pages exit plan (ENT-0008).
- [ ] Decide staffing: hire toward the recommended team, or formally adopt the current-capacity 12–24 month baseline with reduced design-partner scope (§2.1).
- [ ] Approve isolated database/project per enterprise customer versus a different dedicated topology.
- [ ] Select the enterprise identity provider and supported SAML/OIDC/SCIM scope.
- [ ] Select the infrastructure-as-code and secrets/encryption approach.
- [ ] Confirm whether the control plane lives in this repository or a separately deployed service/package.
- [ ] Approve initial availability, RPO, RTO and support targets.
- [ ] Define the first Australian region/residency wording and subprocessor constraints.
- [ ] Approve standard role catalogue and whether custom roles ship in the design-partner release.
- [ ] Define contract suspension, grace-period and read-only behavior.
- [ ] Define which AI providers/features are available to the design partner.
- [ ] Agree pilot success metrics, minimum duration and GA evidence threshold.
- [ ] Confirm budget and named owners for SRE, security and customer implementation work.

## 10. Recommended First Six Delivery Sprints

This is an initial sequencing proposal, assuming two-week sprints and the recommended team. It must be recalibrated after ENT-0002.

### Sprint 1 — Decisions and inventory

- ENT-0001, ENT-0002, ENT-0004, ENT-0005 and the ENT-0008 runtime decision (including its deploy spike).
- Begin ENT-0006, ENT-0007 and the ENT-0009 design-partner outreach.
- Exit with approved boundaries, a ranked isolation defect register and a chosen hosting runtime.

### Sprint 2 — Tenant contract and safe schema

- ENT-0003, ENT-0006, ENT-0007 and the first slice of ENT-1001.
- Continue ENT-0009 until the LOI is signed — Phase 1 investment beyond schema groundwork waits for it.
- Establish two synthetic tenants in automated tests.
- Exit with trusted vocabulary, CI gates and compatibility migration proof.

### Sprint 3 — Request context and authorisation

- ENT-1002 and the first policy catalogue in ENT-1003.
- Begin the core vertical slice ENT-1004.
- Exit with foreign-ID denial proven on the representative domain.

### Sprint 4 — Complete the representative vertical slice

- Complete ENT-1003 and ENT-1004.
- Begin ENT-1006 and ENT-1007.
- Exit with one working browser-to-database tenant-bound workflow.

### Sprint 5 — External state boundaries

- Continue ENT-1006 and ENT-1007.
- Start ENT-1008, ENT-1009 and ENT-1010 using the canonical tenant key/envelope contracts.
- Exit with Xero, storage and at least one asynchronous workflow isolated.

### Sprint 6 — Cell automation foundation

- Start ENT-1018 (Pages→Workers runtime migration), ENT-1012 and ENT-1014; ENT-1013 begins once ENT-1018 lands.
- Continue inventory-driven launch-domain conversion under ENT-1005.
- Re-estimate M1–M5 using measured migration velocity and discovered module scope, and restate the delivery scenario (§2.1).

## 11. Progress Reporting Template

Use this weekly so enterprise progress is visible without equating activity with readiness:

```markdown
## Enterprise programme — Week ending YYYY-MM-DD

- Current milestone:
- Overall confidence: Green / Amber / Red
- Completed task IDs:
- In-progress task IDs:
- Gate evidence produced:
- New isolation/security findings:
- Decisions needed this week:
- Timeline or scope change:
- Top three risks and owners:
- Next checkpoint date:
```

## 12. Final Programme Acceptance

The enterprise programme is not complete merely because tenant identifiers, SSO and an admin screen exist. It is complete for GA only when XeroFlow can repeatedly provision, operate, upgrade, restore, audit, suspend and decommission isolated enterprise cells using shared artifacts—and can demonstrate those controls to a customer security team without relying on undocumented manual intervention.
