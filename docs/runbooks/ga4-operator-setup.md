# GA4 Funnel — Operator Setup Runbook

One-time setup to make the GA4 funnel feature work in production. The code is
already shipped on `main` (migration 121, OAuth endpoints, sync, funnel UI).
These steps configure Google Cloud, the deployment env, and the cron — none of
them touch the codebase.

**Owner:** paul@adme.net.au
**Prereq:** you already have a working **Google Ads** OAuth connection, so the
Google Cloud project + OAuth client already exist. GA4 reuses the **same**
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — do not create a new client.

---

## What the code expects (the contract these steps satisfy)

| Thing | Value |
|---|---|
| OAuth scopes requested | `openid email https://www.googleapis.com/auth/analytics.readonly` |
| Callback (redirect URI) path | `/api/agency/social/ga4/callback` |
| Redirect URI env override | `GA4_REDIRECT_URI` (defaults to the path above) |
| Client ID / secret | reuses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| Google APIs called | Analytics **Data** API (`analyticsdata`) + Analytics **Admin** API (`analyticsadmin`) |
| Cron endpoint | `POST /api/cron/ga4-sync`, header `x-cron-secret: $CRON_SECRET` |

---

## Step 1 — Enable the two Analytics APIs

Google Cloud Console → make sure the **same project** as your Google Ads OAuth
client is selected (top-left project picker).

1. Go to **APIs & Services → Library**.
2. Search **"Google Analytics Data API"** → open it → **Enable**.
3. Search **"Google Analytics Admin API"** → open it → **Enable**.

> Why both: the **Data API** pulls the daily channel metrics (`runReport`); the
> **Admin API** lists a Google account's GA4 properties for the in-app picker
> (`accountSummaries`). Without Admin API, the property dropdown is empty.

---

## Step 2 — Add the callback redirect URI to the OAuth client

APIs & Services → **Credentials** → under **OAuth 2.0 Client IDs**, open the
**Web application** client you already use for Google Ads.

Under **Authorized redirect URIs**, click **+ ADD URI** and add — for **each**
environment you run:

- Production: `https://<your-prod-host>/api/agency/social/ga4/callback`
- Preview (optional): `https://<your-preview-host>/api/agency/social/ga4/callback`
- Local dev (optional): `http://localhost:3000/api/agency/social/ga4/callback`

Click **Save**.

> The app derives the redirect URI from the **incoming request host** at runtime
> (so localhost/preview/prod each use their own), but Google still requires every
> exact URI to be pre-registered here or the consent screen returns
> `redirect_uri_mismatch`.

---

## Step 3 — Add the GA4 scope to the OAuth consent screen

APIs & Services → **OAuth consent screen** → **Edit App** → **Scopes** →
**Add or remove scopes**.

1. Filter for `analytics.readonly` and tick
   `.../auth/analytics.readonly` (listed as "Google Analytics API … View your
   Google Analytics data"). `openid` and `email` are usually already present.
2. **Update** → **Save and continue**.

**User type matters:**

- **Internal** (app restricted to your Google Workspace org) → no Google
  verification needed; staff can connect immediately.
- **External + Testing** → add each staff Google account that will connect under
  **Audience → Test users**. They'll see an "unverified app" warning they can
  click through. Fine for an internal tool.
- **External + In production** → `analytics.readonly` is a **sensitive** scope;
  it works but shows the unverified warning until you complete Google's app
  verification. Not required for internal use.

---

## Step 4 — Confirm the deployment env vars

Cloudflare Pages → `agency-dashboard` → Settings → Environment Variables
(Production). These should already exist from the Google Ads integration — just
confirm:

- `GOOGLE_CLIENT_ID` ✅ (reused)
- `GOOGLE_CLIENT_SECRET` ✅ (reused)
- `CRON_SECRET` ✅ (reused by the cron in Step 6)
- `GA4_REDIRECT_URI` — **optional.** Leave unset to use the default path
  `/api/agency/social/ga4/callback`. Only set it if you need a non-default
  absolute callback URL.

No redeploy is needed unless you add/change a variable.

---

## Step 5 — Connect a GA4 account and map properties (in the app)

1. Sign in to the dashboard as agency staff → **Agency → Social** (`/agency/social`).
2. In the **Google Analytics 4** card, click **Connect Google Analytics**.
3. Complete the Google OAuth popup with an account that has access to your
   clients' GA4 properties (Viewer is enough).
4. Back in the card, each visible GA4 **property** appears with a **Map to
   client…** dropdown. Pick the client, click **Save**. Repeat per property.
   (One property → one client.)
5. Click **Sync now** to pull the last 90 days immediately (runs in the
   background).

---

## Step 6 — Add the daily cron trigger

Cloudflare Pages → `agency-dashboard` → Settings → **Triggers → Cron**:

- **Schedule:** `0 * * * *` (hourly is fine — the sync is idempotent and just
  refreshes a rolling 14-day window; GA4 reprocesses data for ~48h).
- **Target:** `POST /api/cron/ga4-sync`
- **Header:** `x-cron-secret: <value of CRON_SECRET>`

---

## Step 7 — Verify it's working

1. **Data landed** — after a sync, check the DB:
   ```bash
   export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
   psql "$DATABASE_URL" -c "SELECT client_id, channel_group, COUNT(*), MAX(metric_date) \
     FROM ga4_daily_channel GROUP BY 1,2 ORDER BY 1,2;"
   ```
   Expect rows per channel (Paid Search, Paid Social, Organic Search, Direct, …).
2. **Client report** — open the client portal → **Analytics**. A **"Website &
   Funnel"** section appears for any client with a mapped GA4 property (it stays
   hidden for clients without one — existing spend report is unaffected).
3. **Funnel sanity** — paid channels show spend + sessions + GA4 key events +
   captured leads side by side. GA4 key events and Leads won't match exactly
   (on-site signal vs captured ground truth) — that's expected and labelled.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `redirect_uri_mismatch` on connect | The exact callback URL for this host isn't in the OAuth client's Authorized redirect URIs (Step 2). |
| Property dropdown empty after connecting | Analytics **Admin** API not enabled (Step 1), or the Google account has no GA4 property access. |
| "Website & Funnel" section missing for a client | No property mapped to that client (Step 5), or no GA4 rows synced yet (run **Sync now** / wait for cron). |
| Connect popup shows "unverified app" | Expected for External+Testing/Production with a sensitive scope (Step 3). Add the user as a Test user, or use Internal user type. |
| Cron returns 401 | `x-cron-secret` header missing or doesn't match `CRON_SECRET` (Step 6). |

---

## Deferred v1 follow-ups (not blocking)

- Connection `needs_reauth` status tracking (callback currently flips straight to
  `active`; an expired refresh token surfaces only in `syncGa4` errors today).
- Agency-side UI for the already-built internal endpoint
  `GET /api/agency/analytics/funnel`.
- Campaign/UTM-grain attribution (v1 is channel-level only).

See the design + plan for context:
`docs/superpowers/specs/2026-05-30-ga4-funnel-integration-design.md`,
`docs/superpowers/plans/2026-05-30-ga4-funnel-integration.md`.
