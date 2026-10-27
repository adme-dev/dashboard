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
| Organic | Community Management API (Development tier → Standard tier) | Page discovery, posts, comments, share/follower statistics | `LINKEDIN_ORGANIC_CLIENT_SECRET` |
| Ads | Advertising API | `r_ads`, `r_ads_reporting` spend sync | `LINKEDIN_CLIENT_SECRET` |

Created 2026-10-26: "XeroFlow Page Publishing" (app 264187076, client ID
`86f03s18de7z8p`) and "XeroFlow Ads Reporting" (app 264175233, client ID
`86j76jtfd3bdbf`). Client IDs are public and built into
`server/utils/socialOAuth/env.ts`; `LINKEDIN_ORGANIC_CLIENT_ID` /
`LINKEDIN_CLIENT_ID` still override them but cost a text binding each.

Both apps must be associated with the ADME Advertising Company Page
(linkedin.com/company/adme-advertising), verified by a Page super admin.
Products cannot be requested until that verification is approved.

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
to exactly what the app shows, then redeploy. This extra binding does not fit the
conditional staff-enrollment plan below: it would require 151/150 slots. Obtain a new
capacity decision rather than requesting ungranted scopes or removing unrelated bindings.

Ads requests `r_ads r_ads_reporting`.

## 4. Cloudflare Pages secrets (`agency-dashboard`, Production)

Cloudflare Pages allows **150 text bindings** (plain vars + secrets) per
environment. The names-only observation on 27 October 2026 found 102 secret names,
43 production variables and four expected generated bindings: **149 total**. Those
102 include both public LinkedIn IDs but neither matching LinkedIn secret nor
`MCP_MARKETING_STAFF_GRANTS`; the old assumption “100 existing + 2 new secrets” is stale.
The source test models this snapshot, not live provisioning evidence.

Adding all three missing bindings without removals would require **152/150**. The
conditional minimum plan removes only `LINKEDIN_CLIENT_ID` and
`LINKEDIN_ORGANIC_CLIENT_ID`, then adds the two matching client secrets and eventual
staff grant: **43 + (102 - 2 + 3) + 4 = 150**, zero spare slots. Before removing
an ID, the release operator must privately verify its stored public value equals
the built-in ID above and that request/background runtime resolvers use the same
intended app pair, with no conflicting runtime/process/cache overrides. If either
ID differs, preserve it and obtain another capacity plan. Do not replace an app
merely to fit the budget. The two real secrets must come from their exact apps;
the recorded local configuration did not contain them. Nothing here provisions them.

Task 5 code completion adds no binding while TikTok remains unavailable. Adding
its creator credential pair later would require at least **152/150** after this
plan. `LINKEDIN_ORGANIC_SCOPES` would require **151/150**. Neither is authorized by
this capacity model. No unrelated secret removal is approved.

Recount production secret names and the actual flattened build variables before
release; include generated text names without double-counting overlaps. Going over
fails deployment with `Too many text bindings`. See
`test/config/pagesProductionTextBindings.test.ts` and
[staff enrollment](marketing-staff-mcp.md). Configuration-name presence is not
provider grant, app verification, OAuth, publishing or reporting acceptance.

```bash
pbpaste | npx wrangler pages secret put LINKEDIN_ORGANIC_CLIENT_SECRET --project-name agency-dashboard
pbpaste | npx wrangler pages secret put LINKEDIN_CLIENT_SECRET         --project-name agency-dashboard
```

Copy each app's Primary Client Secret (Auth tab) to the clipboard first.
Secrets apply to the next deployment, so redeploy afterwards.

`SOCIAL_OAUTH_STATE_SECRET` (or a fallback such as `META_APP_SECRET`) must
already be set; the `CACHE` KV binding is needed for multi-Page selection.

## 5. Connect

1. Reconcile the reviewed candidate onto current `origin/main`, pass `pnpm deploy:check`, then deploy with `pnpm deploy:production`. Record source commit, target `agency-dashboard` and deployment ID.
2. Agency → Social → Publishing → Accounts → pick the ADME client → **Connect LinkedIn**.
   The person clicking must be an **ADMINISTRATOR** of the Page.
3. If they admin several Pages, choose ADME Advertising on the selection screen.
4. Ads: Agency → Social → LinkedIn → Connect, then assign the ad account to the client.

## 6. Smoke test (first live run)

- Publish a text post to the Page; confirm it appears as **ADME Advertising** (not a person) and the stored post id is a `urn:li:share:`/`urn:li:ugcPost:` URN.
- Publish with a first comment; confirm the comment is authored by the Page.
- Comment on the post from a personal profile; run inbox sync; reply from the inbox; confirm the reply is nested and authored by the Page.
- Run metrics sync; confirm follower count and post impressions populate (a 403 here means `rw_organization_admin` isn't granted — see §3).
- Video: use one reviewed short video. The adapter reads the encoded Videos API URN after finalize, at most six times (one-second intervals, five-second read timeout), and calls Posts only after `AVAILABLE`. A processing/readiness failure creates no post; an ambiguous Posts response stays held and must never be blindly retried.
- Ads: run spend sync; confirm rows attribute to the right client and any failure shows as a failure, not `synced: 0`.

## Not verifiable without live credentials

- Exact scope names granted to the app (handled by `LINKEDIN_ORGANIC_SCOPES`).
- Actual hosted video processing, `AVAILABLE` receipt and the subsequent Posts receipt/read-back; local polling fixtures do not establish these.
- Comment ordering on very busy posts: inbox reads up to 2×50 comments per post across the latest 10 posts.
