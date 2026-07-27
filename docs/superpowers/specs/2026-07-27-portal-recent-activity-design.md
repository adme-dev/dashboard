# Portal Recent Activity Design

## Goal

Move Recent Activity out of the customer portal dashboard and into a dedicated,
full-width page linked directly from the portal sidebar.

## User Experience

- Add a `Recent Activity` item immediately after `Dashboard` in the portal
  sidebar.
- Route the item to `/portal/activity`.
- Remove the Recent Activity card from `/portal`.
- Show the 50 most recent tenant-scoped events in a chronological activity
  feed, with the existing action-specific icons, labels, actor names, and
  relative timestamps.
- Provide standard loading, empty, error, and refresh states using Nuxt UI v4.
- Keep the page full width on all portal breakpoints.

## Architecture

Create `GET /api/portal/activity` as the sole customer-facing activity data
source. It authenticates with `requireClientAuth`, derives the tenant from the
authenticated user, accepts a bounded `limit` from 1 to 100, and performs one
read query. The response does not expose IP addresses, user agents, or agency
staff identifiers.

The page owns activity presentation. Shared activity types and display helpers
move to `app/utils/portalActivity.ts` so the page remains small and testable.
The dashboard no longer queries, merges, types, or renders activity.

## Database Performance

Add a concurrent composite index on
`client_activity_log (client_id, created_at DESC)` so tenant-scoped recent
activity can be served without sorting a tenant's entire history. Keep the
existing single-column indexes for other query shapes.

## Security and Privacy

- Tenant identity comes only from `requireClientAuth`; the request cannot
  supply a client ID.
- Portal response middleware applies `private, no-store` and the portal
  security headers.
- The response includes only activity ID, action, entity references, safe
  details used for labels, creation time, and portal actor name.
- The endpoint uses the stale-tolerant cached read path because activity is
  informational and does not authorize a later mutation.

## Verification

- API tests prove tenant scoping, limit clamping, response redaction, and error
  behavior.
- UI contract tests prove the sidebar route exists, the page is full width,
  and the dashboard no longer contains Recent Activity.
- Dashboard query-budget tests prove the operations section loses one query.
- The portal-focused suite, full repository suite, production build, and worker
  size guard run before shipping.

