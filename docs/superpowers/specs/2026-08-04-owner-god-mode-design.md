# Owner God Mode — Design Specification

**Date:** 2026-08-04  
**Status:** Approved design  
**Scope:** XeroFlow Agency application and its MCP surface

## Goal

Every authenticated, active company owner receives always-on God mode. God mode bypasses application-level governance and exposes every registered application and MCP capability, including direct writes. It does not bypass authenticated identity, tenant/client isolation, or immutable audit logging.

The product label is **God mode**. Authority is derived from the database role `owner`, never from an email address, browser claim, request body, or unsigned header. Paul and Clara receive God mode only when their exact database accounts are active owners; future active owners receive it automatically.

## Chosen activation model

God mode is always on for every active owner. There is no user toggle, named email allowlist, synthetic department membership, or pilot enrollment.

The application displays a persistent **God mode active** indicator to owners. An infrastructure emergency control can disable God mode globally during an incident without modifying owner accounts.

## Non-bypassable boundaries

God mode never bypasses:

1. **Authentication** — every application and MCP operation must resolve a real authenticated user.
2. **Active owner authority** — the server must freshly confirm `team_members.is_active = TRUE` and `team_members.user_role = 'owner'` for the authenticated user on every request.
3. **Tenant/client isolation** — reads and writes remain constrained to the authenticated organization and the explicitly resolved client/entity target.
4. **Immutable audit logging** — every God-mode attempt and outcome is recorded without credentials, tokens, prompts, or sensitive payload bodies.

Client-supplied role values, email addresses, `godMode` booleans, cookies, query parameters, request-body fields, and unsigned MCP headers are never authority.

## Bypass contract

After the non-bypassable boundaries pass, God mode bypasses all application governance, including:

- governed-catalog runtime mode;
- pack and capability release state, including draft, pilot, active, suspended, and retired;
- evaluation status, evaluation result, UAT evidence, pilot membership, and rollout readiness;
- RBAC roles, custom-role permissions, permission groups, capability permission ceilings, and read-only restrictions;
- feature flags and suite flags controlling application capabilities;
- personal tool disables, persona narrowing, department membership, and manager membership requirements;
- token, cost, latency, budget, usage, and application rate-limit ceilings;
- proposal-only execution, confirmation cards, rich financial acknowledgement, and second-step confirmation requirements;
- MCP read/write scopes and MCP suite-specific enablement flags;
- suspension and policy denials emitted by normal assistant and MCP governance.

God mode cannot make a missing external dependency exist. Missing provider credentials, an unavailable upstream service, invalid target data, a database constraint failure, or an unregistered/unimplemented tool remains an operational failure and is audited as such.

## Server authority

A small central module exposes a typed `GodModeAuthority` result and resolver. The resolver:

1. accepts only the authenticated server user ID;
2. queries the database for the current active role;
3. checks the infrastructure emergency control;
4. stores the validated result in trusted H3 request context for reuse within that request;
5. never accepts a caller-supplied role or email as input.

The authority shape contains only server-derived identifiers and booleans required downstream. It does not expose credentials or private configuration to the client.

Common authorization, permission, feature-gate, assistant-catalog, budget, confirmation, and MCP helpers consume this authority. Direct one-off gates discovered during implementation must be inventoried and routed through the same helper so God mode has one explainable source of truth.

## Application behavior

For an active owner:

- platform permission resolution returns every registered application permission;
- role-protected owner/admin endpoints admit the owner;
- application feature gates treat registered capabilities as enabled;
- AI assistant composition admits all registered tools and all available catalog material regardless of release/evaluation state;
- personal settings may still be displayed and edited but do not remove God-mode tools;
- write-capable assistant calls execute directly rather than creating a pending confirmation;
- budget, rate, and usage gates record that they were bypassed and do not block execution.

For admins, members, project managers, client users, inactive owners, and unverified identities, existing governed behavior is unchanged.

The client-safe assistant authority response uses a stable machine value `god_mode` and user-facing copy **God mode active**. Existing governed `company_owner` behavior remains available only if product code still needs to describe non-God-mode owner inheritance during emergency disablement.

## MCP behavior

MCP retains its existing service-to-service secret and authenticated user assertion. The exchange flow adds a short-lived, signed God-mode claim only after resolving the authenticated user and freshly verifying active owner authority.

Each MCP tool-list and tool-call request:

1. validates the service secret and signed assertion;
2. rejects expired, forged, replayed, cross-user, or malformed assertions;
3. revalidates the user as an active owner in the database;
4. resolves tenant/client scope from trusted server data;
5. writes the mandatory God-mode attempt audit event;
6. discovers or executes the requested registered tool;
7. writes the terminal audit outcome.

God-mode tool discovery returns the union of every registered MCP suite:

- core reads;
- generation;
- general writes;
- finance and money-moving actions;
- marketing and social publishing;
- banners and creative production;
- video and media generation;
- administration and any future registered suite.

Future tools are included by default when they enter the authoritative registry. God mode does not expose source code that has no registered executable tool.

God-mode writes use direct execution projections. Existing proposal aliases may remain for compatibility, but a God-mode call must not require a second `confirm_action` or acknowledgement call. The execution layer still validates target identifiers, tenant ownership, input schemas, and database constraints.

## Audit model

Create an append-only `god_mode_audit_events` store protected by a database trigger that rejects update and delete operations.

Each event records bounded metadata:

- event ID and timestamp;
- authenticated actor user ID;
- authenticated session or assertion correlation digest;
- channel (`application` or `mcp`);
- route or tool name;
- event phase (`attempt`, `succeeded`, or `failed`);
- affected tenant/client/entity identifiers when known;
- names of bypassed control classes;
- outcome code and correlation ID;
- emergency-disable state.

Events never store passwords, API keys, access tokens, signed assertions, prompts, responses, message bodies, uploaded file contents, or raw request/response payloads.

An attempt event must persist before execution. If it cannot be stored, execution does not begin. A successful mutation and its terminal success event commit atomically where the existing transaction boundary permits. A failed operation records a bounded failure outcome without leaking provider or database secrets.

## Failure handling

- Database or identity verification failure denies God mode.
- Inactive or downgraded owners lose God mode on the next request.
- Audit persistence failure blocks the God-mode operation; mutations roll back when applicable.
- Invalid or unavailable external providers return an audited operational error.
- Forged, expired, replayed, malformed, or cross-user MCP assertions are rejected.
- Tenant/client mismatches are denied even for God mode and recorded as failed attempts.
- The emergency control returns owners to the pre-existing governed behavior and records the disabled state.

## User experience

Owners see a persistent **God mode active** indicator in the authenticated application shell and My Assistant authority view. The indicator explains that all registered application and MCP capabilities are available while identity, tenant isolation, and auditing remain enforced.

The AI governance page reports God-mode owner coverage separately from governed employee rollout readiness. Draft and failed release status remains visible for governance reporting even though it does not restrict owners.

Public feature documentation describes God mode truthfully and does not imply that ordinary employees bypass governance.

All UI work uses Nuxt UI v4. Any new toggle-like emergency operator interface is out of scope; the emergency control is infrastructure configuration.

## Deployment and activation

God mode becomes active for every verified active owner when the implementation is deployed to production. No per-user database mutation or synthetic membership is required.

Before production deployment:

1. apply the append-only audit migration to the production Neon database;
2. verify Paul and Clara each resolve to exactly one active `owner` account;
3. verify the emergency control is configured and tested in the disabled state in a non-production environment;
4. run the complete test and security matrix;
5. run `pnpm deploy:check`;
6. run the production build and immutable Worker-size check;
7. deploy only with `pnpm deploy:production`;
8. perform authenticated application and MCP smoke tests for both owners;
9. confirm an inactive/non-owner control account receives governed behavior;
10. confirm cross-tenant requests remain denied and audited.

## Worker-size constraint

The verified merged Worker has 18,343 bytes of remaining release budget. The immutable 24,750,000-byte guard must not be raised, bypassed, made configurable, or weakened.

If the implementation exceeds the budget, the MCP God-mode authority and projection layer moves into the existing standalone MCP Worker. Application authority remains centralized and small. Production deployment is blocked until the exact artifact passes the size guard.

## Test strategy

### Unit tests

- active owner, inactive owner, downgraded owner, admin, member, and missing identity;
- caller-supplied role/email/God-mode values cannot grant authority;
- emergency disablement;
- complete bypass-class matrix;
- bounded, credential-free audit serialization;
- MCP assertion signing, expiry, replay, subject, and God-mode claims;
- every registered MCP tool appears in God-mode discovery;
- future registry additions are included by default.

### Integration tests

- draft, failed, suspended, and retired AI material is admitted only for God mode;
- ordinary users retain governed catalog behavior;
- every permission and feature suite is available to an owner;
- application and MCP writes execute without proposal or confirmation stages;
- financial, publishing, banner, generation, video, and administrative actions use direct execution;
- tenant/client mismatch remains denied;
- audit failure prevents execution;
- mutation and success audit commit together where transactional execution is available;
- role downgrade revokes God mode on the next request.

### End-to-end and release verification

- persistent owner UI indicator;
- authenticated application smoke tests for Paul and Clara;
- authenticated MCP discovery and representative read/write calls;
- non-owner and cross-tenant negative controls;
- migration verification and append-only trigger checks;
- full Vitest suite;
- documented inherited typecheck baseline review;
- production Nuxt build and exact Worker-size guard;
- browser battle test across Finance, Marketing, Banners, and AI governance.

## Non-goals

- unauthenticated access;
- cross-tenant access;
- suppressing or mutating audit history;
- granting God mode from an email address alone;
- making missing provider credentials or unimplemented tools work;
- changing ordinary employee rollout governance;
- weakening the Worker release budget.

## Acceptance criteria

The feature is complete only when:

1. every active owner receives always-on God mode from server-verified database authority;
2. Paul and Clara are verified as active owners and pass production application/MCP smoke tests;
3. all registered application and MCP capabilities are discoverable and executable without application governance gates;
4. no non-owner can obtain God mode through client input, email matching, assertion forgery, or stale role state;
5. tenant/client isolation remains enforced;
6. every God-mode attempt and outcome is present in immutable, credential-free audit history;
7. ordinary users retain current governed behavior;
8. all tests, migration checks, deployment guard, and production build pass;
9. the exact Worker artifact remains below 24,750,000 deployed bytes;
10. production deployment and authenticated smoke tests complete successfully.
