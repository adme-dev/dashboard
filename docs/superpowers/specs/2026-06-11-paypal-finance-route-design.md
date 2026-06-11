# PayPal Finance Route Design

Date: 2026-06-11

## Goal

Add PayPal as its own finance integration route in the agency dashboard. The first slice is connection administration only: finance users can see PayPal API readiness, connect or reconnect the account, disconnect it, and run a lightweight API health check.

## Context

The agency dashboard already has finance-gated routes such as `/agency/financial-health`, `/agency/expenses`, `/agency/retainers`, and billing. The sidebar builds finance navigation in `app/layouts/agency.vue` when `canAccessFinance` is true. Server routes use Nitro handlers, `requireAuth` / role helpers, `createError`, and DB helpers from `server/utils/db.ts`.

## Approaches Considered

1. Connection/admin route only.
   This creates the OAuth and health foundation without importing PayPal financial records. It keeps scope small and avoids early assumptions about fees, refunds, disputes, multi-currency handling, and Xero matching.

2. Connection plus transactions.
   This is useful soon, but it needs pagination, date ranges, normalization, and decisions about whether PayPal is a source of truth or a supporting ledger.

3. Connection plus payment/invoice sync.
   This is the highest-value long-term version, but it requires accounting workflow decisions around gross/net amounts, fees, invoice matching, refunds, and reconciliation.

Recommendation: ship approach 1 first.

## User Experience

Add a `/agency/paypal` page under the Finance sidebar group with `role-finance` middleware.

The page shows:

- Connection status: not configured, not connected, connected, expired, or error.
- Environment mode: sandbox or live.
- Connected account identity when available.
- Token expiry and last checked timestamps.
- Actions: connect/reconnect, disconnect, and test API call.

The page does not include credential entry forms. PayPal client ID and secret come from environment variables.

## Server API

Add routes under `/api/agency/paypal`:

- `GET /status`: returns configuration, connection, and health summary.
- `GET /connect`: creates CSRF state and returns the PayPal OAuth URL.
- `GET /callback`: validates state, exchanges the authorization code, stores token metadata, and redirects back to `/agency/paypal`.
- `POST /disconnect`: deletes or disables the stored PayPal connection.
- `POST /test`: performs a lightweight PayPal identity or token validation call and records the result.

All routes require authenticated finance/admin access. Write routes also require write access so read-only roles cannot alter the connection.

## Data Storage

Create a small `paypal_connections` table:

- `id`
- `tenant_id`
- `environment`
- `merchant_id`
- `account_name`
- `access_token`
- `refresh_token`
- `token_expires_at`
- `scopes`
- `status`
- `last_checked_at`
- `last_error`
- `connected_by`
- `created_at`
- `updated_at`

Tokens are stored server-side only. No token values are returned to the frontend.

## Runtime Config

Add documented environment variables:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENVIRONMENT` with `sandbox` or `live`
- `PAYPAL_REDIRECT_URI`, defaulting to the current request origin plus `/api/agency/paypal/callback` when omitted

## Error Handling

Status returns a non-throwing state for missing configuration so the UI can explain what is needed. OAuth callback errors redirect back with a short error code. API calls throw structured Nitro errors and never expose secrets.

## Tests

Add focused Vitest coverage for:

- status response when credentials are missing
- connect requiring PayPal configuration
- OAuth URL generation includes state and configured environment
- disconnect requires finance/write access
- token values are not returned by status

## Out of Scope

- Transaction import
- Payment reconciliation
- Xero matching
- Webhook ingestion
- Multi-tenant PayPal account selection beyond the existing default tenant pattern
