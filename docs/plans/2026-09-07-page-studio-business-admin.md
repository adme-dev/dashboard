# Business content administration increment

Goal: connect authenticated agency and portal content management to the private
Page Studio content Worker, retaining the standalone visual editor boundary.
Reference implementation: standalone Page Studio `758b701` / `130536a`.

## Contract and boundaries

1. Agency requests require PAGE_STUDIO_VIEW/EDIT. Portal requests require an active
   authenticated client user and site membership. Read-only membership cannot save.
2. Resolve tenant/client from joined site + effective entitlement in Neon. Reject
   inactive sites and subscriptions on every operation. Never accept actor/scope
   from the body. Use fresh database reads for authorization.
3. Trusted server configuration maps exact tenant/client/site to business and one
   preview-environment private service binding. The browser cannot choose a binding,
   business or environment. Missing/ambiguous/mismatched binding fails closed.
4. GET returns a validated revision or an empty state. PUT accepts only bounded
   collections and expectedRevision. The server adds scope and actor; stale writes
   return 409. No production content changes or automatic publication.
5. Client content management edits record data, not page components. Visual preview
   and publication consume an explicitly selected immutable content revision in a
   subsequent step; do not overwrite visual checkpoints by regenerating entire sites.
6. The existing Neon schema is sufficient for site/membership authorization. This
   increment adds no remote database migration or binding provisioning.

## Work

- [x] Add interoperable wire schemas and negative tests.
- [x] Test scope, membership, entitlement, trusted binding and provider responses.
- [x] Implement agency/portal GET and PUT routes, bounded bodies and stable errors.
- [x] Add content admin with save/reload/conflict recovery and explicit setup state.
- [ ] Connect a revision-bound preview through standalone Studio (next increment).
- [x] Verify focused checks, full build, browser and independent review; record the
  existing repository typecheck failure in the [verification report](2026-09-07-page-studio-content-admin-verification.md).
- [x] Commit the verified increment: `2205fa204`.

Next: automate business/resource provisioning and self-service ownership, then
billing, domain/email and operational modules from the versioned product checklist.
Client assets, rate/hold policies, commercial prices and account delivery tests are
external acceptance dependencies; continue independent implementation meanwhile.

## Content screen design

Use the existing XeroFlow typeface and semantic Nuxt UI palette: light background
(#ffffff), dark background (#18181b), muted text (#71717a), light foreground
(#fafafa) and existing primary green (#22c55e), resolved through theme tokens in
code. The screen is a working content catalogue: collection list → entry selector
→ labelled title/description/review fields. One clear save action and persistent
unsaved/conflict state. At narrow widths the collection selector stacks above the
entry editor; constrained field grids use container breakpoints. No promotional
hero, decorative metrics or duplicated visual editor. Existing attributes remain
intact while this first screen edits names, copy and review state.

Security review refinement: agency content access additionally requires the latest
server-owned non-default organisation connection from a fresh DB read. The selected
Xero tenant cookie alone is not a grant. Missing/mismatched associations fail closed.
The current shared-agency policy must be replaced by explicit organisation membership
for multi-agency self-service onboarding; do not grant all stored Xero connections.
