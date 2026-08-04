# Owner-Wide AI Release Access

**Date:** 2026-08-04
**Status:** Approved design
**Scope:** Employee AI assistant governed-catalog access

## Problem

XeroFlow owners are documented and implemented as company-wide platform authorities. The assistant already gives `owner` and `admin` identities company-wide department scope, but governed releases apply a second pilot-membership check. As a result, an active owner can see every organizational department while still being denied an evaluation-approved pilot release unless a separate `ai_release_pilot_members` row exists.

That behavior conflicts with the product rule confirmed by the owner: active owners should inherit access to everything available across the company.

This change must not turn ownership into a release-governance bypass. Draft, failed-evaluation, suspended, and retired releases remain non-executable.

## Decision

An authenticated, active team member whose server-derived role is exactly `owner` automatically receives every governed AI release that is otherwise eligible for runtime use:

- `pilot` releases with a completed, passing evaluation;
- `active` releases with a completed, passing evaluation.

The owner does not need an explicit department membership or pilot-membership record.

The override does not apply to:

- `admin` or any lower role;
- inactive team members;
- `draft` releases;
- releases whose evaluation is missing, incomplete, or failed;
- `suspended` or `retired` releases;
- globally disabled assistant runtime modes.

## Architecture

### Server-derived authority

Owner inheritance is calculated only from the authenticated server identity. No browser-provided role, email address, query parameter, or request body may affect the decision.

The catalog-composition boundary will receive an explicit owner-access boolean or equivalent typed server-derived authority. SQL will admit a pilot-scoped release when either:

1. the actor is an active owner; or
2. the actor has an existing, valid, non-revoked pilot membership and current department membership.

Evaluation and release-state predicates remain independent mandatory conditions. Owner inheritance only replaces the pilot-membership predicate.

### Department scope

`loadAssistantDepartmentScope()` already grants owners all active organizational departments. That behavior remains unchanged. The implementation will keep department discovery and release eligibility as separate responsibilities:

- department scope answers where the actor may look;
- release eligibility answers which governed releases may execute.

### Runtime modes

The existing modes remain authoritative:

- `legacy`: governed releases do not replace legacy composition;
- `pilot`: eligible pilot and active releases may compose;
- `enforced`: governed composition applies according to the existing enforcement policy.

Owner inheritance does not enable `AI_TOOLS_ENABLED`, change `AI_GOVERNED_CATALOG_MODE`, deploy code, or transition any release.

### Explainability

Assistant explainability must distinguish owner inheritance from department or explicit pilot membership. When a release is present because of this rule, the response should identify the access basis as company-owner inheritance using a stable machine-readable value and clear user-facing copy.

No synthetic department membership or pilot audit row will be created.

## Data Flow

1. Authentication resolves the active team member and server-side role.
2. Department scope returns every active organizational department for an owner.
3. Catalog loading receives the actor identifier and server-derived owner authority.
4. Release queries retain state and passing-evaluation filters.
5. Pilot membership is satisfied by owner inheritance or the existing explicit membership path.
6. Catalog composition applies permissions, access modes, personal tool settings, persona narrowing, and budgets as it does today.
7. Explainability records the actual access basis.

## Security and Failure Behavior

- Missing, malformed, or unrecognized roles fail to ordinary membership behavior.
- An inactive owner receives no owner inheritance.
- Email matching is never used as authorization.
- Owner inheritance does not expose unreleased instructions or tools.
- Existing tool permission checks, confirmation requirements, read/draft/propose modes, budgets, and invocation logging remain enforced.
- Existing pilot membership audit history remains unchanged and continues to govern non-owner pilots.

## Testing

The implementation requires regression coverage for:

1. an active owner receiving an evaluation-approved pilot release in a department where they have no membership;
2. an active owner receiving an evaluation-approved active release company-wide;
3. an inactive owner being denied inheritance;
4. an admin without explicit pilot membership being denied a pilot release;
5. an ordinary valid pilot member retaining access;
6. draft, failed-evaluation, suspended, and retired releases remaining unavailable to owners;
7. malformed or browser-supplied role data not granting owner access;
8. explainability reporting the owner-inheritance basis;
9. existing catalog-composition, personal-assistant, API, and full AI suites remaining green.

## Rollout

The policy change will ship dormant while production remains in legacy/off mode. Activation still requires:

1. passing governed evaluations;
2. eligible pilot release transitions;
3. a Cloudflare Pages build below the protected Worker-size budget;
4. deployment through the guarded `pnpm deploy:*` workflow;
5. production `AI_TOOLS_ENABLED=true` and `AI_GOVERNED_CATALOG_MODE=pilot`;
6. post-deploy verification using an active owner and a non-owner control account.

## Non-Goals

- Giving owners access to drafts or failed evaluations.
- Treating admins as owners.
- Granting customer-portal AI or write automation globally.
- Creating department memberships for owners.
- Automatically transitioning releases or changing production flags.
- Weakening the Worker-size release budget.

## Success Criteria

An active owner can use every evaluation-approved pilot or active employee-assistant release across the organisation without explicit department or pilot membership, while every existing release, evaluation, runtime, tool, and audit safety boundary remains enforced.
