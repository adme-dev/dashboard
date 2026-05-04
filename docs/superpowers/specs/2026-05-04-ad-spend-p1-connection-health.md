# P1 — Connection Health Surface

**Status:** Firm
**Roadmap:** [Ad Spend Roadmap](2026-05-04-ad-spend-roadmap.md)
**Target:** This week (2026-05 W19)
**Date:** 2026-05-04

## Problem

On 2026-05-04, 113 active Meta connections were discovered to have expired tokens (expiry: 2026-04-25, no refresh tokens — Meta's long-lived OAuth doesn't issue them). Sync calls fired silently failed with 401s. The Ad Spend page showed Google-only data with no indication anything was wrong. Time was spent investigating "missing Meta data" before discovering the cause was an invisible auth state.

The Bank Charged card on the spend page also displayed "Connect Xero to see bank charges" when Xero WAS connected but no transactions matched — misleading copy.

## Goal

When an ad-platform connection is broken (expired token, stale sync, error), the operator sees it on the spend page within seconds and can act on it from the connections page in ≤2 clicks.

## User stories

- As a media buyer, when I open `/agency/social/spend` I see at a glance which platforms have healthy data
- As an account manager, when I see "Meta: 113 expired" I click through to the connections page and can re-OAuth without hunting for the right button
- As an operator, I no longer wonder "is the data missing or just zero?" — the Bank Charged card distinguishes those states

## Acceptance criteria

1. Compact horizontal "Connection Health" strip at top of `/agency/social/spend`, one pill per connected platform
2. Each pill shows platform name and aggregate health badge: `healthy ✓` / `expired ⚠️` / `expiring soon ⚠️` / `stale sync ⚠️`. When >0 connections in the worst state, show count (e.g., `Meta: 113 expired`)
3. Clicking a pill navigates to `/agency/social#<platform>` (anchor scrolls to platform section)
4. Each connection card on `/agency/social` displays:
   - Last successful sync timestamp ("Synced 2 hours ago" / "Never synced")
   - Token-expiry countdown when applicable ("Expires in 3 days" / "Expired 9 days ago"; no badge when >30d out OR token has refresh)
   - "Reconnect" CTA when broken (replaces "Sync" button)
   - "Sync now" CTA when healthy
5. Bank Charged card on spend page distinguishes 4 states (currently distinguishes 2):
   - `not connected` → "-" + "Connect Xero to see bank charges" (existing)
   - `connected, no transactions this period` → "$0" + "No bank charges matched this period" (new)
   - `loading` → spinner (existing)
   - `connected with data` → currency + discrepancy chip (existing)
6. Stale-data badge on each spend-table row where the underlying connection's `last_synced_at` is >24h old. Tooltip shows exact timestamp.

## Data model

None. Reads existing `social_connections.token_expires_at`, `social_connections.refresh_token`, and the existing `(SELECT MAX(synced_at) FROM media_spend WHERE connection_id = ...)` aggregate.

Health classification (computed in `server/api/agency/social/connections.get.ts` and the new health-summary endpoint):

```
- healthy: status = 'active'
           AND (refresh_token IS NOT NULL OR token_expires_at > NOW + 7 days)
           AND last_synced_at > NOW - 24h
- expiring_soon: token_expires_at BETWEEN NOW AND NOW + 7 days
                 AND refresh_token IS NULL  (Google's tokens auto-refresh — skip)
- expired: status = 'active' AND token_expires_at < NOW
- stale_sync: token healthy but (last_synced_at > NOW - 24h is false) OR last_synced_at IS NULL
- error: status != 'active'
```

## API surface

1. **Extend `GET /api/agency/social/connections`** — add per-row fields:
   - `health: 'healthy' | 'expiring_soon' | 'expired' | 'stale_sync' | 'never_synced' | 'error'`
   - `daysUntilExpiry: number | null` (negative when expired)
2. **New `GET /api/agency/social/connections/health-summary`** — returns per-platform aggregate counts:
   ```ts
   {
     [platform: string]: {
       total: number
       healthy: number
       expiring_soon: number
       expired: number
       stale_sync: number
       never_synced: number
       error: number
       worst_status: 'healthy' | 'expiring_soon' | 'expired' | 'stale_sync' | 'never_synced' | 'error'
     }
   }
   ```
   Cached 60s in KV (key: `spend:health-summary:${orgId}`)

## UI components

**New:**
- `app/components/social/ConnectionHealthStrip.vue` — horizontal pills bar, fetches health-summary on mount
- `app/components/social/ConnectionHealthBadge.vue` — single pill primitive (consumed by strip + connection cards)

**Edited:**
- `app/pages/agency/social/spend.vue` — mount `ConnectionHealthStrip` between Period Picker and Summary Cards. Fix Bank Charged card copy. Add stale badge to table row.
- `app/pages/agency/social/index.vue` — add timestamp/expiry/CTA to each connection card.
- `app/components/social/SocialSpendVarianceTable.vue` — add stale-data badge cell.

## Out of scope

- Automatic Meta token refresh attempt (long-lived tokens have no refresh grant; would require storing user OAuth session)
- Email/Slack alerts on token expiry — handled by P3
- Cron-based health monitoring (page already triggers a fetch on mount; no need for background job at this stage)
- Custom health thresholds per platform (hardcoded 7-day-warning, 24h-stale)

## Test plan

- Manual: visit spend page with current Meta state (113 expired) — strip shows `Meta: 113 expired ⚠️`
- Manual: click Meta pill → lands on `/agency/social` with Meta section visible
- Manual: trigger Xero connection break (stale token) → Bank Charged card shows "No bank charges matched this period" not "Connect Xero..."
- Manual: trigger one Google sync → after success, that account's stale badge disappears within next refresh
- Code: `pnpm exec vue-tsc --noEmit` clean

## Risks

- The Connection Health strip adds one network call to spend page mount. Mitigated by KV cache (60s) + parallel with existing `loadSpend()` and `loadBankCharges()`.
- "Expiring soon" classification might be noisy for Google (tokens expire every hour but auto-refresh). Mitigation: classification skips `expiring_soon` when `refresh_token IS NOT NULL`.
