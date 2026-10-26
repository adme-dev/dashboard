# LinkedIn activation runbook

Connects a LinkedIn Company Page (organic publishing, inbox, analytics) and,
separately, LinkedIn Ads spend reporting. Code is complete on REST version
`202610` (`server/utils/linkedinApiVersion.ts`); everything below is operator
setup. LinkedIn versions sunset after ~12 months and sunset headers are
rejected outright, so bump that constant at least yearly.

## 1. LinkedIn developer apps (two apps)

LinkedIn only grants **Community Management API** to a *new* app that has no
other products, so use two apps:

| App | Product | Used for | Env vars |
| --- | --- | --- | --- |
| Organic | Community Management API (Development tier → Standard tier) | Page discovery, posts, comments, share/follower statistics | `LINKEDIN_ORGANIC_CLIENT_ID`, `LINKEDIN_ORGANIC_CLIENT_SECRET` |
| Ads | Advertising API | `r_ads`, `r_ads_reporting` spend sync | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |

Both apps must be associated with the ADME Advertising Company Page
(linkedin.com/company/adme-advertising), verified by a Page super admin.

Development tier limits: 500 requests/app/day, 100/member/day. Inbox sync uses
up to ~21 calls per account per run — request Standard tier (screencast of each
use case) before connecting many Pages.

## 2. Redirect URLs (app → Auth tab)

- Organic: `https://app.xeroflow.io/api/agency/social/publishing/accounts/callback/linkedin`
- Ads: `https://app.xeroflow.io/api/agency/social/linkedin/callback`

Add the preview origin too if you'll test on preview.

## 3. Scopes

Organic requests, by default:
`rw_organization_admin r_organization_social w_organization_social r_organization_social_feed w_organization_social_feed`

Requesting a scope the app isn't granted fails the whole consent screen
(`unauthorized_scope_error`). Compare with the app's **Auth → OAuth 2.0 scopes**
list; if it differs, set `LINKEDIN_ORGANIC_SCOPES` (space- or comma-separated)
to exactly what the app shows. No redeploy needed — it's read per request.

Ads requests `r_ads r_ads_reporting`.

## 4. Cloudflare Pages secrets (`agency-dashboard`, Production)

```bash
npx wrangler pages secret put LINKEDIN_ORGANIC_CLIENT_ID     --project-name agency-dashboard
npx wrangler pages secret put LINKEDIN_ORGANIC_CLIENT_SECRET --project-name agency-dashboard
npx wrangler pages secret put LINKEDIN_CLIENT_ID             --project-name agency-dashboard
npx wrangler pages secret put LINKEDIN_CLIENT_SECRET         --project-name agency-dashboard
# optional
npx wrangler pages secret put LINKEDIN_ORGANIC_SCOPES        --project-name agency-dashboard
```

`SOCIAL_OAUTH_STATE_SECRET` (or a fallback such as `META_APP_SECRET`) must
already be set; the `CACHE` KV binding is needed for multi-Page selection.

## 5. Connect

1. Deploy (`pnpm deploy:production`, from `origin/main` only).
2. Agency → Social → Publishing → Accounts → pick the ADME client → **Connect LinkedIn**.
   The person clicking must be an **ADMINISTRATOR** of the Page.
3. If they admin several Pages, choose ADME Advertising on the selection screen.
4. Ads: Agency → Social → LinkedIn → Connect, then assign the ad account to the client.

## 6. Smoke test (first live run)

- Publish a text post to the Page; confirm it appears as **ADME Advertising** (not a person) and the stored post id is a `urn:li:share:`/`urn:li:ugcPost:` URN.
- Publish with a first comment; confirm the comment is authored by the Page.
- Comment on the post from a personal profile; run inbox sync; reply from the inbox; confirm the reply is nested and authored by the Page.
- Run metrics sync; confirm follower count and post impressions populate (a 403 here means `rw_organization_admin` isn't granted — see §3).
- Video: post a short video. LinkedIn processes video asynchronously; if the post call fails right after upload, retry after processing completes.
- Ads: run spend sync; confirm rows attribute to the right client and any failure shows as a failure, not `synced: 0`.

## Not verifiable without live credentials

- Exact scope names granted to the app (handled by `LINKEDIN_ORGANIC_SCOPES`).
- Video post immediately after `finalizeUpload` (no `AVAILABLE` polling yet).
- Comment ordering on very busy posts: inbox reads up to 2×50 comments per post across the latest 10 posts.
