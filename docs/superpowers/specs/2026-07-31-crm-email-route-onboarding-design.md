# CRM Inbound Email Route Onboarding Design

**Date:** 2026-07-31  
**Status:** Approved design, ready for implementation planning  
**Parent PRD:** `docs/prd/crm-conversations-email-gateway-prd.md`  
**Scope:** Phase E5 agency configuration and health, and Phase E6 portal permissions and onboarding

## 1. Outcome

An agency operator can provision a client-specific CRM inbound email address
without SQL. A client CRM administrator can copy the newly issued address and
use it in a website, marketplace, forwarding rule, or external platform that
cannot send webhooks. Messages sent to the address continue through the
production Cloudflare Email Routing → Worker → Queue → Nitro → CRM pipeline.

The address is a bearer capability. XeroFlow returns it only when it is created
or rotated and never stores or returns the plaintext route token afterward.

## 2. Product Placement

### 2.1 Agency

CRM inbound-address management belongs in `/agency/leads` under the existing
**Email addresses** tab. This is already the operational surface for client
selection, email lead endpoints, address lifecycle, health, history, and
recovery.

Add a distinct **CRM inbox** section before the existing universal lead-email
endpoints. It must explain that CRM inbox messages create or continue a
canonical CRM conversation, while the existing `leads.xeroflow.io` endpoints
enter the general Leads ingestion and routing system.

Agency operators can:

- create the first CRM inbox address;
- copy an address only from the one-time issuance result;
- rotate an active address;
- revoke an active address;
- see safe status, creation time, and last received time.

### 2.2 Client portal

CRM inbound onboarding belongs in `/portal/crm` → **Data Sources**. Add an
**Inbound email** source card before inventory and product sources.

All portal users with CRM view access may see safe status and setup guidance.
Only the primary contact or a user with `canAdminCrm` may create, rotate, or
revoke an address. The interface must not use `canInviteUsers` as a proxy for
CRM administration.

The portal never exposes Cloudflare configuration, Queue state, DLQ controls,
R2 keys, raw MIME, route hashes, signing versions, signing secrets, or internal
exceptions.

## 3. Route Model

This slice manages only `lead_inbox` rows in `crm_email_routes`.
`conversation_reply` routes remain system-managed and are not listed or
mutable through these onboarding APIs.

One client may have one active `lead_inbox` route at a time. Historical revoked
routes remain stored for audit and incident investigation.

Add the following safe lifecycle data:

- `label` — operator-facing name, default `CRM inbox`;
- `updated_at`;
- `revoked_by`;
- `revoked_actor_type`;
- `revoked_reason`;
- `replaced_by_route_id`.

Add a partial unique index that permits at most one active, unrevoked
`lead_inbox` route per client.

Add an append-only `crm_email_route_audits` table. Audit actions are
`created`, `rotated`, and `revoked`; actors are `team_member`,
`client_user`, or `system`. Audit payloads contain only safe lifecycle
metadata. They must never contain an issued address, token, route hash,
signing secret, raw email content, or object-storage key.

## 4. Signing and Address Issuance

Address format:

```text
lead+<signed-route-token>@<server-owned-domain>
```

The API reads:

- `CRM_EMAIL_REPLY_SECRETS` — the versioned JSON verification keyring already
  shared by Pages and the email Worker;
- `CRM_EMAIL_REPLY_CURRENT_VERSION` — the explicit key version used for new
  routes;
- `CRM_EMAIL_LEAD_ROUTE_DOMAIN` — the canonical server-owned recipient domain.

The current version must exist in the keyring. The API must fail closed when
any issuance configuration is missing, malformed, inconsistent, or unsafe.
It must never infer the current version from the maximum keyring entry.

The client cannot submit a domain, version, route kind, client identity, or
actor identity. These values are derived from server configuration and the
authenticated session.

`createCrmEmailReplyToken()` remains the sole token generator. Only the token
hash is inserted into `crm_email_routes`.

## 5. Lifecycle Semantics

### 5.1 Create

1. Authorize the actor.
2. Confirm that CRM and CRM email conversations are enabled for the client.
3. Lock the client or relevant route scope transactionally.
4. Reject an existing active lead-inbox route with `409`.
5. Generate the token and insert only its hash.
6. Append a safe `created` audit row.
7. Return the complete issued address once with `addressShownOnce: true`.

### 5.2 Rotate

Rotation is one transaction:

1. Resolve and lock the active route in the authenticated tenant.
2. Generate and insert the replacement route.
3. Revoke the old route immediately.
4. Link the old row to the replacement using `replaced_by_route_id`.
5. Append a safe `rotated` audit row.
6. Return the replacement address once.

There is no grace period in this slice. An address stops accepting mail as soon
as rotation commits. The UI must warn the operator to update every forwarding
source immediately.

### 5.3 Revoke

Revocation is a soft revoke:

- set `is_active = false`;
- set `revoked_at`, actor fields, reason, and `updated_at`;
- append a safe `revoked` audit row;
- return success when the route is already revoked, without revealing
  cross-tenant existence.

Revoked routes are never physically deleted.

## 6. API Contracts

### 6.1 Agency

```text
GET    /api/crm/email-routes?client_id=<uuid>
POST   /api/crm/email-routes
POST   /api/crm/email-routes/:id/rotate
DELETE /api/crm/email-routes/:id
```

Agency endpoints require `PERMISSIONS.CLIENTS`. The selected client must be
validated within the service transaction.

### 6.2 Portal

```text
GET    /api/client-portal/crm/email-routes
POST   /api/client-portal/crm/email-routes
POST   /api/client-portal/crm/email-routes/:id/rotate
DELETE /api/client-portal/crm/email-routes/:id
```

Portal endpoints derive `clientId` exclusively from
`requireClientCrmAccess()`. GET requires `view`; mutations explicitly require
`admin`.

Absent and cross-tenant route identifiers return the same `404`.

### 6.3 Safe DTOs

```ts
type CrmEmailRouteStatus = 'active' | 'never_used' | 'revoked' | 'expired'

interface CrmEmailRouteSummary {
  id: string
  label: string
  kind: 'lead_inbox'
  clientId?: string
  recipientDomain: string
  status: CrmEmailRouteStatus
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  canRotate: boolean
  canRevoke: boolean
  addressAvailable: false
}

interface IssuedCrmEmailRoute {
  route: CrmEmailRouteSummary
  issuedAddress: string
  addressShownOnce: true
}
```

Normal list and detail responses never include `issuedAddress`,
`routeTokenHash`, the raw route token, the signing version, or secrets.

Every response that can contain a one-time address uses:

```text
Cache-Control: private, no-store
```

## 7. UI Composition

Use Nuxt UI v4 components exclusively.

The shared presentation is a deliberate onboarding panel, not another generic
dashboard grid:

- clear heading and one-sentence distinction from general Leads ingestion;
- state badge;
- safe metadata in `grid grid-cols-1 gap-4 sm:grid-cols-2`;
- address reveal in a readonly monospaced `UInput`;
- icon-only ghost `UButton` with
  `aria-label="Copy CRM inbox address"`;
- selectable address text when clipboard access fails;
- concise three-step instructions for configuring a forwarding source.

Lifecycle mutation confirmation uses `UModal`. Any labelled creation form uses
`UFormField`, `UInput`, and an `@container` form with
`grid grid-cols-1 gap-4 @lg:grid-cols-2`.

States:

- **Not configured:** agency/admin receives `Create CRM inbox`; other portal
  users see contact-admin guidance.
- **Address issued:** one-time address, copy action, and a warning that it
  cannot be shown again.
- **Awaiting first email:** active status and `No messages received yet`.
- **Ready:** active status and last received timestamp.
- **Revoked:** no copy action, safe lifecycle metadata, and creation guidance.
- **Error:** retryable load error that preserves the rest of Data Sources.

The address row must remain usable at 320 px: the input is `min-w-0`, the copy
button is `shrink-0`, and supporting actions stack on small screens.

## 8. Security and Reliability Invariants

- Full inbound addresses are bearer capabilities.
- Plaintext tokens and addresses are never persisted.
- Addresses never appear in query strings, analytics, logs, audits, exception
  messages, Graph Wiki, or test snapshots committed with real values.
- Portal tenant identity always comes from the session.
- Client-controlled input cannot choose domain, key version, actor, route kind,
  or client.
- One active lead-inbox route is enforced in Postgres, not only application
  code.
- Create and rotate are transactionally safe under concurrency.
- The inbound consumer revalidates active route state before mutating CRM.
- Old signing keys remain configured until all routes on that version have
  been rotated or revoked and the inbound Queue has drained.
- The existing 128-bit opaque route key is the documented implementation;
  references that claim 192 bits must be corrected.

## 9. Verification

Automated coverage must prove:

- issuance configuration fails closed;
- current signing version is explicit and present in the keyring;
- one-time address appears only in create/rotate responses;
- list responses and audit rows exclude token-bearing data;
- one-active-route uniqueness holds under concurrent create attempts;
- rotation revokes the old route and creates the new route atomically;
- repeated revoke is idempotent;
- agency permissions and client assignment boundaries hold;
- portal view/admin boundaries hold;
- cross-tenant IDs behave like absent IDs;
- UI empty, issued, active, revoked, error, clipboard-success, and
  clipboard-failure states;
- production migration applies cleanly;
- a production smoke email reaches the expected client CRM conversation;
- synthetic smoke data is removed or soft-deleted without purging the DLQ.

## 10. Documentation and Rollout

- Update the parent PRD Phase E task ledger.
- Update the CRM inbound-email runbook with provisioning, rotation, signing-key
  rollover, verification, and rollback.
- Update the relevant public feature pages so CRM email ingestion is visible
  externally.
- Update Graph Wiki after the implementation and production proof. Graph
  memories must contain architecture and outcome metadata only, never issued
  addresses or secrets.
- Apply the additive migration to production before deploying code.
- Deploy through `pnpm deploy:production` only after `pnpm deploy:check`.

## 11. Deferred

- Persistently redisplaying issued addresses.
- Rotation grace periods.
- Client access to replay, DLQ, raw MIME, R2, or Worker diagnostics.
- Multiple simultaneously active CRM inbox routes per client.
- Per-route AI extraction rules.
- Self-service custom inbound domains.
