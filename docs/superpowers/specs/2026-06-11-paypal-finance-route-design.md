# PayPal Finance Route Design

Date: 2026-06-11

## Goal

Add PayPal as its own finance integration route in the agency dashboard. The first slice is API readiness and connection administration only: finance users can see PayPal configuration status, retrieve a server-side REST access token health check, and confirm the integration is ready before transaction work is added.

## Context

The agency dashboard already has finance-gated routes such as `/agency/financial-health`, `/agency/expenses`, `/agency/retainers`, and billing. The sidebar builds finance navigation in `app/layouts/agency.vue` when `canAccessFinance` is true. Server routes use Nitro handlers, `requireAuth` / role helpers, `createError`, and DB helpers from `server/utils/db.ts`.

## Approaches Considered

1. Connection/admin route only.
   This creates the REST authentication and health foundation without importing PayPal financial records. It keeps scope small and avoids early assumptions about fees, refunds, disputes, multi-currency handling, and Xero matching.

2. Connection plus transactions.
   This is useful soon, but it needs pagination, date ranges, normalization, and decisions about whether PayPal is a source of truth or a supporting ledger.

3. Connection plus payment/invoice sync.
   This is the highest-value long-term version, but it requires accounting workflow decisions around gross/net amounts, fees, invoice matching, refunds, and reconciliation.

Recommendation: ship approach 1 first, implemented with PayPal REST API client credentials. Do not use the Log in with PayPal / OpenID Connect authorization-code flow for this internal v1 route.

## PayPal R&D Notes

PayPal REST APIs authenticate server-to-server requests by exchanging the app client ID and secret for an OAuth 2.0 access token at `/v1/oauth2/token` with `grant_type=client_credentials`. That is the correct fit for an internal agency API readiness route.

Log in with PayPal is a separate OpenID Connect user-consent flow. It returns authorization codes and refresh tokens for user profile access, requires Return URL configuration, and live apps require PayPal review. It is not needed for the first internal finance route.

The Transaction Search API is useful for a later phase, but it has its own query limits and partner/on-behalf-of constraints. Transaction import remains out of scope for v1.

Official docs checked:

- PayPal REST authentication: https://developer.paypal.com/api/rest/authentication/
- Log in with PayPal integration: https://developer.paypal.com/docs/log-in-with-paypal/integrate/
- PayPal Transaction Search API: https://developer.paypal.com/docs/api/transaction-search/v1/

## User Experience

Add a `/agency/paypal` page under the Finance sidebar group with `role-finance` middleware.

The page shows:

- Connection status: not configured, not connected, connected, expired, or error.
- Environment mode: sandbox or live.
- REST app ID / token metadata when available.
- Token expiry and last checked timestamps.
- Actions: test API call and clear cached token/connection metadata.

The page does not include credential entry forms. PayPal client ID and secret come from environment variables.

## Server API

Add routes under `/api/agency/paypal`:

- `GET /status`: returns configuration, connection, and health summary.
- `POST /test`: exchanges configured credentials for a PayPal REST access token, stores token metadata, and records the result.
- `POST /clear`: clears cached token/connection metadata without changing environment credentials.

All routes require authenticated finance/admin access. Write routes also require write access so read-only roles cannot alter connection metadata.

## Data Storage

Create a small `paypal_connections` table:

- `id`
- `tenant_id`
- `environment`
- `app_id`
- `access_token`
- `token_expires_at`
- `scopes`
- `status`
- `last_checked_at`
- `last_error`
- `connected_by`
- `created_at`
- `updated_at`

Tokens are stored server-side only. No token values are returned to the frontend. The stored token is a short-lived REST access token obtained with the client credentials grant, not a user refresh token.

## Runtime Config

Add documented environment variables:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENVIRONMENT` with `sandbox` or `live`

## Error Handling

Status returns a non-throwing state for missing configuration so the UI can explain what is needed. API calls throw structured Nitro errors and never expose secrets.

## Tests

Add focused Vitest coverage for:

- status response when credentials are missing
- test requiring PayPal configuration
- test storing token metadata without returning token values
- clear requiring finance/write access
- token values are not returned by status

## Out of Scope

- Transaction import
- Payment reconciliation
- Xero matching
- Log in with PayPal / OpenID Connect user consent
- Webhook ingestion
- Multi-tenant PayPal account selection beyond the existing default tenant pattern
