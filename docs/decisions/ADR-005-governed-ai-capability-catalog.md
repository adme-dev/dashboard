# ADR-005: Use an append-only governed AI capability catalog

## Status

Accepted

## Date

2026-07-21

## Context

XeroFlow already has one agency assistant loop with role-filtered tools, persona narrowing, personal tool disables, model assignment policy, proposal/confirmation boundaries, and production audit telemetry. Department and individual assistants must reuse those controls while adding ownership, immutable versions, evaluations, release gates, budgets, and suspension.

Building a second permission system inside the catalog would create conflicting authority. Treating source-code personas as the full catalog would make releases and historical evaluation evidence difficult to explain or reproduce. Allowing mutable capability definitions would let a previously passing evaluation appear to cover materially different prompts, tools, or models.

## Decision

Use PostgreSQL as the catalog and evaluation control plane with these boundaries:

- Logical pack, capability, and evaluation-suite identities belong to exactly one existing department and one accountable team-member owner.
- Material specifications are append-only versions. New behavior creates a new version rather than editing an evaluated version.
- Pack composition and tool bindings are department-scoped and become sealed once evaluation or release evidence exists.
- Tool bindings express only `read`, `draft`, or `propose`. Execution remains in the existing application action gateway and its confirmation/revalidation controls.
- `required_permission_group` is a narrowing requirement. Runtime composition must intersect catalog bindings with existing RBAC and client/tenant scope; it must never union permissions from the catalog.
- Evaluation evidence binds exact suite, pack/capability, model, prompt digest, and toolset digest identities. A material identity change invalidates reuse.
- Release state is separate from immutable material versions. Draft is the default; pilot/active require version-bound evaluation evidence; suspension is reversible.
- Evaluation fixtures use synthetic data and opaque references. Stored results contain redacted measurements and trace references, not raw prompts, outputs, secrets, or PII.

## Alternatives considered

### Extend source-code personas only

This would preserve a simple runtime but would not provide department ownership, immutable releases, database audit, or reproducible evaluation evidence. Rejected as insufficient for governed company rollout.

### Make the catalog the permission source of truth

This could centralise configuration, but it would duplicate established RBAC and create an elevation path when catalog and application permissions drift. Rejected. The catalog may only narrow existing authority.

### Store mutable JSON capability documents

This would reduce table count but weaken relational department isolation, historical explanation, and material-version evaluation gates. Rejected for production governance.

### Deploy one autonomous Cloudflare Agent per employee

This would multiply state, cost, identity, and operational complexity before the capability/evaluation foundation exists. Rejected as the default. Selective durable agents and Workflows remain appropriate later for processes that genuinely require waits, retries, or scheduled state.

## Consequences

- The schema is more explicit and contains several version/evidence tables.
- Department-scoped composite foreign keys and append-only triggers make unsafe cross-binding and historical rewriting harder.
- Runtime catalog composition, governance APIs, UI, and the deterministic evaluation runner remain separate incremental tasks.
- Activating a capability requires evidence for the exact material version; changing tools, prompts, models, or suite version requires a new run.
- Existing assistants continue unchanged until the read/composition service is deliberately integrated behind a safe release gate.
