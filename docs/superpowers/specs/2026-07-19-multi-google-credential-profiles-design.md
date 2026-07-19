# Multi-Google Credential Profiles

## Status

Approved for implementation by the application owner and privacy approver on 2026-07-19.

## Objective

Allow one XeroFlow agency to connect multiple Google login identities concurrently, discover each identity's manager and child ad accounts, and select a safe credential source for every existing `social_connections` account without losing client mappings or spend history.

## Assumptions

- XeroFlow is currently one agency tenancy; no agency/tenant key exists on `team_members` or `social_connections`.
- Existing Google Ads scopes remain unchanged. This release will not request Google profile/email identity scopes.
- Existing `social_connections` IDs, client mappings, spend records, and APIs remain backward compatible.
- When two credential profiles can access the same customer, the most recently completed authorization becomes that account's active credential. All profile/account memberships remain recorded for audit and later failover.
- Existing Google rows without a profile continue using their legacy token columns until explicitly reauthorized.
- New profile credentials are encrypted with AES-256-GCM using the existing server-side token encryption key and are never returned to clients or written to logs.

## Trust Boundaries and Abuse Cases

- OAuth query parameters are untrusted. State is a high-entropy, server-persisted, hashed, user-bound, one-time value with a ten-minute expiry.
- Concurrent browser attempts must not overwrite each other's state.
- A signed-in user cannot consume another user's OAuth attempt.
- Replayed, expired, missing, or malformed state is rejected before code exchange.
- Google errors and token-exchange failures are redirected as generic operator-safe messages; tokens and authorization codes are never logged.
- Database writes are parameterized and executed atomically where profile/account linkage could otherwise be partially recorded.

## Data Model

### `google_credential_profiles`

One row per successful Google login authorization. Stores a display label, encrypted access/refresh tokens and IVs, expiry, scopes, status, connected user, authorization timestamp, and manager metadata.

### `google_oauth_attempts`

Short-lived authorization attempts. Stores only a SHA-256 digest of the browser state, the initiating user, expiry, and one-time consumption timestamp.

### `google_credential_profile_accounts`

Many-to-many discovery/audit link from profiles to existing Google `social_connections`, including the manager customer context used to discover the account.

### `social_connections.google_credential_profile_id`

Nullable active-credential pointer. Existing rows remain null and continue through the legacy token path. New and reauthorized rows point to the most recently completed profile.

## API Contracts

- `GET /api/agency/social/google/connect`
  - Auth required.
  - Creates an independent OAuth attempt and returns `{ url, attemptId }`.
- `GET /api/agency/social/google/callback`
  - Auth required.
  - Atomically consumes state, creates one encrypted profile, upserts discovered accounts without changing their IDs, records memberships, and sets the active profile.
  - Redirect result adds `profile=<uuid>` but preserves current `platform`, `success`, and `accounts` fields.
- `GET /api/agency/social/google/profiles`
  - Auth required.
  - Returns only profile identity/health metadata and account counts. Never returns credential bytes, IVs, OAuth state, or refresh-token presence beyond a boolean health signal.

Errors use existing Nitro `createError` or the OAuth callback redirect contract. Existing connection and account response fields remain additive-compatible.

## UI

- A connected Google platform card exposes **Add Google connection**, separate from **Reconnect**.
- Google connection summaries show the number of credential profiles as well as ad accounts.
- OAuth popup windows use unique names so concurrent authorizations do not reuse one browser context.

## Delivery Slices

1. Add additive schema and migration contract tests.
2. Add state/profile repository utilities with replay, expiry, user-binding, encryption, and legacy-fallback tests.
3. Update connect/callback routes and account discovery manager context.
4. Resolve profile credentials in Google spend/read/write paths, falling back to legacy rows.
5. Add profile read API and agency UI.
6. Run focused tests, type/build/lint checks, dependency audit, migration, deploy guard, production deploy, and live OAuth-entry smoke test.

## Rollback

- UI/API/code can be reverted without dropping additive tables or columns.
- Existing legacy token columns and all existing mappings remain operational.
- The migration includes a documented down section but production rollback should leave additive data in place unless a separately approved data-removal change is scheduled.

## Success Criteria

- Two Google authorization attempts can exist concurrently and complete independently.
- OAuth state cannot be replayed or consumed by another user.
- Multiple Google credential profiles appear in the agency dashboard.
- Overlapping Google customers preserve their original `social_connections.id` and client mappings.
- New profile tokens are stored once, encrypted, and resolved for account operations.
- Legacy Google connections continue syncing without reauthorization.
- Focused tests, production build, migration, deploy guard, deployment, and production smoke checks pass.
