# Social Suite — D2 OAuth (Meta: Facebook + Instagram) Design Spec

**Date:** 2026-06-01
**Status:** Approved (brainstorm) → ready for implementation plan
**Scope chosen:** *Framework + Meta (FB+IG) first.* *Full activation on connect.*

## 1. Goal

Wire per-network OAuth so an operator can **connect a Meta Page from a client's Accounts page** and thereby make the already-built Social Suite go LIVE for that Page — **publishing + engagement inbox (comments/reviews) + reply automation**, in one step. Build a reusable OAuth framework so LinkedIn / TikTok / YouTube / Google Business are framework-ready follow-ups, but only Meta is fully wired in this slice.

This closes the single remaining gate (D2 OAuth) that keeps Slice 1 publishing, Slice 2a inbox, and Slice 2b automation dormant.

## 2. Why Meta first

- The dashboard already has `META_APP_ID` / `META_APP_SECRET` and token-exchange helpers in `server/utils/metaClient.ts` (`getMetaAuthUrl`, `exchangeMetaCode`, `exchangeForLongLivedToken`).
- The sibling app `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` has a complete, production Meta connect → callback → page-selection → save → webhook-subscribe flow to **port-and-adapt** (`server/api/admin/social/connect/facebook.get.ts`, `callback/facebook.get.ts`, `connect/facebook/complete.post.ts`, and the Instagram equivalents).
- The publishing providers (`facebook.ts`, `instagram.ts`) and the inbox providers (`fetchInbox`/`reply` added in 2a) already consume the Page token — nothing downstream changes.
- Comments + reviews work on the **lighter Page tokens** (no Meta App Review). Only DMs/mentions need review (deferred to Slice 2d).

## 3. What this is NOT (scope cuts)

- **No new database migration.** `social_accounts` (migration 144) already has `client_id, platform, platform_account_id, account_name, access_token, refresh_token, token_expires_at, is_active, last_error, metadata JSONB, UNIQUE(platform, platform_account_id)`. Everything D2 needs (webhook-subscribed flag, IG linkage, page category) lives in `metadata`.
- **No LinkedIn / TikTok / YouTube / Google Business wiring** — only the reusable framework + a registry so they slot in later. Each needs its own operator app registration + (for posting) platform review.
- **No DMs / mentions** — Slice 2d, App-Review-gated.
- **No Meta token auto-refresh** — Meta long-lived tokens (~60 days) have no refresh endpoint by design. Near-expiry surfaces on the accounts page as "reconnect needed"; the operator re-runs connect. (Google, a later network, *does* use `refresh_token` — the framework leaves room for it.)

## 4. The connect flow (port-and-adapt)

Initiated from a client's Accounts page (`/agency/social/publishing/accounts`), so the target `client_id` is known up front and embedded in signed state.

```
[Connect Meta]  GET /api/agency/social/publishing/accounts/connect/meta?clientId=X
  → requireAuth + Creative; build Graph OAuth URL with the D2 scopes + the D2 redirect URI
  → 302 to facebook.com/dialog/oauth?...&state=<signed>

Facebook → GET /api/agency/social/publishing/accounts/callback/meta?code&state
  → verify signed state (HMAC + expiry) → exchangeMetaCode → exchangeForLongLivedToken (~60d user token)
  → list managed Pages (each with its Page access token + linked IG business account, if any)
  → 0 Pages → redirect to accounts page with ?social_error=no_pages
  → 1 Page  → finalize immediately (same code path as complete)
  → >1 Page → 302 back to accounts page in "select" mode with a fresh signed payload
              (carries clientId + the page list + the long-lived user token)

[Select page(s)]  POST /api/agency/social/publishing/accounts/complete
  → verify signed payload → for each selected pageId:
      • derive/confirm the Page access token
      • upsert a `facebook` social_accounts row (client-scoped)
      • if the Page has a linked IG business account → upsert an `instagram` row (same Page token)
      • subscribe the Page to the `feed` webhook field (comments) → set metadata.webhook_subscribed
  → return the saved accounts; UI refreshes the list
```

### 4.1 Signed state / payload (replaces the ad-flow cookie)

A pure, testable signer in `server/utils/socialOAuth/state.ts`:
- `signState(data, secret) → "<base64url(json)>.<hmacSHA256hex>"`
- `verifyState(token, secret, maxAgeMs) → data | null` (null on bad signature, malformed, or expired)
- `data = { clientId, userId, platform, nonce, ts }` for the connect leg; the select leg reuses the same signer with `{ clientId, userId, platform, ts, pages: [{id,name,igId?}], userToken }`.
- Secret: `SOCIAL_OAUTH_STATE_SECRET` (fallback to `META_APP_SECRET` so it works once the Meta app is configured). HMAC-signed state is chosen over a cookie because it survives the page-selection round-trip and embeds `clientId` without server session storage.

## 5. Scopes + token model

**Scopes** (Pages + IG comments/publish; no App Review): `pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement, pages_manage_metadata, instagram_basic, instagram_content_publish, instagram_manage_comments, business_management`.

(D2 builds its **own** auth-URL with these scopes + the D2 redirect URI — it does **not** reuse the ad-spend `getMetaAuthUrl`, whose scopes/redirect/token-destination are for `social_connections`.)

**Token model:** code → short-lived user token → long-lived user token (~60d) → per-Page **Page access token** (what providers use). Stored in `social_accounts.access_token`; `token_expires_at` = now + ~60d (carried from the long-lived user token); `refresh_token` left NULL (Meta has none). The IG row reuses the same Page token.

**Per-row data:**
| column | facebook row | instagram row |
|---|---|---|
| `platform` | `facebook` | `instagram` |
| `platform_account_id` | Page id | IG business account id |
| `account_name` | Page name | IG username (or Page name) |
| `access_token` | Page token | same Page token |
| `token_expires_at` | ~60d | ~60d |
| `metadata` | `{ webhook_subscribed, page_category, linked_ig_id? }` | `{ via_page_id, webhook_subscribed }` |

## 6. Full activation (webhooks)

After saving a Page, call the Graph API `POST /{page-id}/subscribed_apps` with `subscribed_fields=feed` using the Page token (`pages_manage_metadata`) to push comment events to the **already-built** app webhook receiver `/api/webhooks/social/meta` (2a). On success set `metadata.webhook_subscribed=true`; on failure set `social_accounts.last_error` (publishing still works; inbox falls back to the poll cron). Reviews come via the poll cron (`sync-social-inbox`) regardless.

This is what makes inbox + automation live, not just publishing — per the "Full activation on connect" decision.

## 7. One Page → one client (confirmed)

`UNIQUE(platform, platform_account_id)` means a Page connects to exactly **one** client. The `complete` upsert: if the Page already belongs to **this** client → update (re-auth refreshes the token). If it belongs to **another** client → return a clear `409` "This Page is already connected to <client name>." (no silent reassignment). This matches agency reality (a Page belongs to one client).

## 8. UI

`app/pages/agency/social/publishing/accounts.vue` (currently: disabled Connect button + "operator-activated" alert):
- Enable **Connect** per platform → `window.location` to the connect endpoint with the selected `clientId`. Meta is enabled; the other 5 stay disabled with a "coming soon — needs app registration" tooltip.
- **Page-selection modal** (`UModal`) shown when the callback returns `?social_select=<signed>` — lists Pages with checkboxes → POST `complete`.
- Surface `token_expires_at` ("reconnect in N days") + `webhook_subscribed` + `last_error` via the existing `ConnectionHealthStrip` / `SocialPlatformCard`.
- Handle `?social_error=…` / `?social_connected=N` query flags with a toast.
- Disconnect uses the existing delete endpoint; also best-effort unsubscribes the webhook.

Apply the `frontend-design` skill to the modal + any new form controls (Nuxt UI v4, `UFormField`, no raw elements).

## 9. Security

- `requireAuth` + Creative permission on connect / complete / disconnect (consistent with the publishing endpoints).
- HMAC-signed state, verified with expiry on callback + complete; reject tampered/expired.
- `clientId` embedded in signed state and enforced on every write (client-scoped, no IDOR).
- Page tokens never returned by any read API (the accounts GET already omits tokens).
- Only Graph API hosts are ever called (no user-supplied URLs → no SSRF).
- The Meta webhook receiver already HMAC-verifies with `META_APP_SECRET` and checks `META_WEBHOOK_VERIFY_TOKEN` (2a) — unchanged.

## 10. File structure

```
server/utils/socialOAuth/
  state.ts          # pure signState/verifyState (+ tests)
  meta.ts           # buildMetaAuthUrl(scopes,redirect,state); listManagedPages(userToken);
                    # subscribePageWebhook(pageId,pageToken); mapPageToAccountRows(page) (pure mapper)
  store.ts          # upsertSocialAccount(db, row) with the one-page-one-client 409 rule (DB-injected)
server/api/agency/social/publishing/accounts/
  connect/meta.get.ts
  callback/meta.get.ts
  complete.post.ts
  # ([id].delete.ts already exists — extend to best-effort webhook unsubscribe)
app/pages/agency/social/publishing/accounts.vue   # enable connect + selection modal + health (modify)
app/components/social/SocialPlatformCard.vue       # connect button state per platform (modify)
test/social/oauthState.test.ts                     # signer round-trip, tamper, expiry
test/social/oauthMetaMap.test.ts                   # page→account-row mapping, IG linkage
test/social/oauthStore.test.ts                     # upsert: same-client update vs other-client 409 (fake db)
```

`meta.ts` network calls (auth-URL build, page list, webhook subscribe) take an injected `fetch` so they're unit-testable with fakes — mirroring the 2a/2b DB-injected/pure-function testability. The pure mappers (`mapPageToAccountRows`, `state.ts`) need no fakes.

## 11. Testing

- **Unit (pure/injected):** state sign/verify (round-trip, bad signature, expiry); `mapPageToAccountRows` (FB-only, FB+linked-IG, missing fields); `upsertSocialAccount` (insert, same-client re-auth update, other-client → 409); `listManagedPages` + `subscribePageWebhook` with a fake fetch (happy path + Graph error → `last_error`).
- **No live OAuth in tests** — the real round-trip needs the operator's Meta app + a browser; that's the post-merge operator verification, documented in the release notes.
- Target **0 new type errors**; mirror Slice 1/2 vitest approach.

## 12. Operator activation (post-merge, documented — not code)

1. In the Meta app: add the scopes in §5; add redirect URI `https://<host>/api/agency/social/publishing/accounts/callback/meta`; configure the Pages webhook (callback `/api/webhooks/social/meta`, field `feed`, verify token = `META_WEBHOOK_VERIFY_TOKEN`).
2. Set env on CF Pages: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, and (optional) `SOCIAL_OAUTH_STATE_SECRET`.
3. From a client's Accounts page → Connect Meta → authorize → select Page(s). Publishing + inbox + automation are then live for those Pages. (Automation still also needs `SOCIAL_AUTOMATION_ENABLED` flipped — separate, deliberate gate.)

## 13. Out of scope / follow-ups

- LinkedIn / TikTok / YouTube / Google Business connect flows (framework-ready; each needs operator app registration + review).
- DMs + mentions (Slice 2d; Meta App Review).
- Google token auto-refresh path (lands when Google networks are wired; framework already separates "refresh" as a per-network concern).
- Sharing one Page across multiple clients (explicitly rejected — one Page → one client).
