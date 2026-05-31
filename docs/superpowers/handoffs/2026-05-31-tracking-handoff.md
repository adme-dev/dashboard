# Tracking Feature — Session Handoff (2026-05-31)

First-party site tracking + per-client website analytics for XeroFlow Agency. This doc captures everything needed to resume.

## Shipped & MERGED to `main`
| What | PR | Squash |
|---|---|---|
| **Slice 1** — JS tag (`public/track.js`, `window.xf`) + public ingestion `POST /api/public/track` + provisioning API/UI (`/agency/tracking`) + retention cron. Migration 125 (`tracking_sites`, `tracking_events`). | #21 | `db845c0` |
| **Slice 2** — per-client website analytics: 4 client-scoped endpoints under `server/api/agency/tracking/analytics/[clientId]/` + 7 `TrackingAnalytics*` components + drill-down page + client "Website" tab. Migration 126 (`agency_clients.reporting_timezone`). Closed the analytics-endpoint IDOR via `requireClientTrackingAccess`. | #25 | `4a7389f` |
| **Consent-in-body** — tag forwards raw `_xf_consent` cookie in the batch; endpoint prefers it over the unreadable cross-origin cookie. | #27 | `c8c605f` |

**Tests:** 46 tracking unit tests green (`test/server/utils/tracking/`, `test/public/track-tag.test.ts`). Endpoint + TZ-window aggregation logic proven against real Neon via throwaway tsx scripts (the local `pnpm dev` EMFILE-crashes with concurrent sessions — see [[subagent-driven-execution-notes]]).

## Architecture (one-paragraph)
A vanilla-JS tag on external dealer sites POSTs batched behavioural events cross-origin to `/api/public/track?k=<writeKey>`. The endpoint resolves the tenant by **write key** (we don't host the dealer sites), soft-checks Origin, snapshots consent (now from the forwarded body value), validates with Zod (`track-schema.ts`), and inserts into `tracking_events` (dedup on `(site_id, event_id)`). Agency staff provision sites at `/agency/tracking` and view per-client analytics (drill-down + client "Website" tab) backed by on-the-fly SQL aggregation over `tracking_events`, day-bucketed in the client's `reporting_timezone`. Access is `requireClientTrackingAccess` (management roles see all; media_buyer/account_manager scoped via `client_team_assignments`; `user.id === team_members.id`).

Key modules: `server/utils/tracking/{track-schema,consent,normalize,pii-hash,site-config,event-insert,write-key,analytics-access,analytics-sql,analytics-range,analytics-window}.ts`.

## NOT yet live — go-live checklist (needs prod authority + dealer access)
1. **Deploy** `pnpm deploy:production` — from a clean checkout, NOT mid-multi-session (concurrent `main` sessions can get their WIP shipped — hard lesson in [[subagent-driven-execution-notes]]).
2. Set **`TRACKING_IP_SALT`** in CF Pages prod env (IP-hash pepper).
3. Post-deploy **curl** `/api/public/track` — the Nitro HTTP-layer proof EMFILE blocked locally (Claude can run this once deployed).
4. **Browser eyeball** — `/agency/tracking` (provisioning + analytics drill-down) and the client "Website" tab. Never rendered locally (EMFILE).
5. **GTM install** on the 3 dealer sites: kia.gws (raw/GTM, MPA), kevindennisvw + ferntreegully (GTM, SPA). Confirm 200 beacons + climbing 24h counts.

## Remaining code follow-ups (no deploy needed)
- ~~**Provisioning-CRUD IDOR**~~ — **DONE this branch (`feat/tracking-provisioning-idor`):** list scopes to `client_team_assignments` clients for scoped roles; create/patch/snippet gate via `requireClientTrackingAccess`/`requireSiteTrackingAccess`; rotate-key left management-only (no scoped exposure). Helpers `accessibleClientIds` + `requireSiteTrackingAccess` added to `analytics-access.ts`.
- **Hard Origin gate + per-key rate limiting** on the public beacon — currently soft (log-only) by design. ⚠️ Do NOT flip the hard 403 until allowlists are proven on live sites (premature flip = silent beacon drops at go-live). Rate limiting needs a CF state-store decision (KV `CACHE` binding vs Durable Object vs CF native rate-limit binding) — decide deliberately.
- ~~non-UUID `clientId`/`siteId` → 500~~ — **DONE (PR #29):** `isUuid` guard in the access helpers → 400 across all tracking endpoints.
- Minor (open): stale consent category lists in the tag's `isEventAllowed` (only bite once an explicit cookie exists); `dead_click` patches `history.pushState` per click → can race the SPA pushState patch; tiny client-name endpoint for media_buyers so the drill-down header isn't "Client".

## Deploy state (as of this handoff)
Slices 1–2 + consent (#27, `c8c605f`) are LIVE in prod (agency-dashboard-6cm.pages.dev). PRs #28 (provisioning IDOR) + #29 (UUID guard) merged to `origin/main` AFTER that deploy → **redeploy to ship them.** Still pending operationally: set `TRACKING_IP_SALT`, curl proof, browser eyeball, GTM smoke.

## Future slices (bigger, not scoped)
Conversion fan-out (Meta CAPI / Google Ads — keys off the now-accurate consent snapshot), raw-PII/leads wiring, 360/personas. Slice scope notes live in `docs/superpowers/specs/2026-05-31-tracking-*.md`.

## Environment gotchas (this repo, multi-session)
- **Always work in an isolated `git worktree` branched off the `origin/main` SHA** (not the branch ref). The shared checkout gets branch-switched by concurrent sessions; commits/deploys from it land on/ship the wrong tree. Local `main` is also far ahead of `origin/main` (unpushed strays) — branch off `origin/main`.
- Bootstrap a worktree: symlink `node_modules` + `.env`, run `pnpm exec nuxi prepare` (vitest + `~~/` alias need `.nuxt/`).
- `pnpm dev` EMFILE-crashes with concurrent dev servers — verify endpoints via `tsx --tsconfig .nuxt/tsconfig.server.json` against Neon instead of curl.
- Push needs the `adme-dev` gh account (`gh auth setup-git`); merge PRs via `gh pr merge --squash` (GitHub-side, doesn't touch the local checkout).
