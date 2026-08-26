# ADR-009: Activate God mode on execution intent, not owner identity

## Status

Accepted

## Date

2026-08-26

## Context

The first God mode application boundary treated fresh active-owner authority as
proof that every request was a God mode execution. Middleware wrote an audit
attempt and demanded a registered mutation coordinator for every owner POST,
PUT, PATCH and DELETE before the route handler ran.

That conflated two different facts:

- the actor is eligible to use God mode; and
- this particular request intends to bypass an application control.

The result was a growing route registry, mandatory idempotency plumbing on
ordinary UI calls, an audit-store dependency on normal reads, and production
503s on unrelated endpoints such as AI conversation creation and Insights
action-plan generation. Adding each missing endpoint to the registry fixed one
symptom while preserving the mistaken activation boundary.

## Decision

Fresh active-owner authority remains necessary but is no longer sufficient to
activate God mode.

God mode now activates through one of these execution signals:

1. a runtime-branded, exact-request MCP/internal delegation already owned by the
   Task 5 execution ledger;
2. a dedicated God mode tool executor; or
3. centralized application code reaching a denied permission, feature, budget,
   rate-limit or other reviewed control and explicitly requesting a bypass.

Application activation is lazy. The centralized bypass helper first verifies
fresh owner authority, then persists the immutable attempt, and for a mutation
prepares the one exact registered coordinator before returning permission to
bypass. An unregistered actual mutation bypass still fails closed. A normal
owner request that does not request a bypass receives its configured role
permissions and creates no God mode route state.

Mutation-family registration is therefore an admission control after activation,
not a declaration that every matching human UI request is autonomous.

## Alternatives considered

### Keep eager middleware and register every mutation

Rejected. This creates permanent coupling between ordinary product development
and the autonomous execution ledger, expands the 503 blast radius, and makes
the registry an inventory of HTTP verbs rather than privileged execution.

### Accept a browser header or request parameter as execution intent

Rejected. Caller-controlled markers are not trustworthy provenance and would
reintroduce ambiguous UI state, CSRF concerns and accidental elevation.

### Disable application God mode and keep only MCP execution

Rejected. Reviewed application controls and the in-app AI tool loop still need
a safe owner bypass path. Lazy activation preserves that capability without
elevating unrelated traffic.

## Consequences

- Ordinary owner UI traffic no longer depends on the God mode audit store,
  mutation-family coverage or idempotency headers.
- Configured custom-role and read-only policy is preserved until centralized
  code actually requests a bypass.
- Trusted MCP/direct execution retains replay protection, immutable attempts,
  exact-route coordination and terminal audit guarantees.
- A real uncoordinated mutation bypass still returns 503 by design.
- Code that bypasses controls outside the centralized helpers remains invalid;
  it must be routed through the reviewed boundary rather than gaining a new
  caller-controlled flag.
