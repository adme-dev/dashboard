# Social Publishing API Setup

Google Business Profile last checked: 2026-09-09

This is the setup reminder for `/agency/social/publishing/accounts` OAuth connections.
Those account connections are reused by publishing and by the engagement inbox review sync.

Domain split:

- Agency website: `xeroflow.io`
- App: `app.xeroflow.io`

## Google Business Profile

Status verified on 2026-09-09:

- The active shared OAuth client belongs to project `gen-lang-client-0818792107`, number `14351276985`.
- The project is owned by `paul@adme.net.au` and has the approved Account Management quota of 300 requests/minute. Twelve active locations are connected.
- The legacy review API was disabled. Paul could not enable it because the Google account lacked access to that private API, despite owning the project.
- `advertising@adme.net.au` could enable the private API. A temporary, time-limited Service Usage Admin grant on the existing project allowed Advertising to enable `mybusiness.googleapis.com`; the grant was then removed. Enable operation: `operations/acat.p2-14351276985-b05fb3d9-b75e-44fd-95a2-c74158659b94`.
- All twelve locations now return HTTP 200 from `reviews.list` through the existing production OAuth connection. Two locations return no reviews. Live imports are verified in the Reviews screen.
- Advertising's separate `wise-trainer-382200` project (`803122782506`) is not approved: Account Management quota is zero, and reviews return 404 `Method not found`, even though the legacy API could be enabled. A temporary verification OAuth client there was removed. API visibility/enablement alone is not proof of project approval.
- The older project `my-business-api-271101` (`65723781223`) is not used. Do not switch to its stale credentials.

The connection does not require enabling local-post publishing. Shared Google OAuth credentials must remain consistent with stored refresh tokens; do not replace them with the older project's credentials.

The current application workflow is linked from https://support.google.com/business/contact/api_default (Application For Basic API Access). Activation and review automation checks are documented in [Google review operations](google-review-operations.md).

Reference links:

- Prerequisites: `https://developers.google.com/my-business/content/prereqs`
- Basic setup: `https://developers.google.com/my-business/content/basic-setup`
- OAuth setup: `https://developers.google.com/my-business/content/implement-oauth`
- Reviews list API: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list`
- Review reply API: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply`
- Local Posts API: `https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create`

## Facebook and Instagram Publishing

Current implementation:

- Route: `/api/agency/social/publishing/accounts/connect/meta?clientId=...`
- Callback: `/api/agency/social/publishing/accounts/callback/meta`
- Storage table: `social_accounts`
- A connected Facebook Page can also create an Instagram account row when the Page has a linked Instagram Business account.
- Page webhook subscription currently uses `feed` by default for comments. Messaging scopes are gated behind `SOCIAL_DM_ENABLED=true` after Meta App Review.

Production prerequisites:

1. Cloudflare Pages production secrets must include:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `SOCIAL_OAUTH_STATE_SECRET` or `META_APP_SECRET`
   - Optional: `SOCIAL_OAUTH_REDIRECT_BASE=https://app.xeroflow.io`
2. Meta App settings must include this Valid OAuth Redirect URI:
   - `https://app.xeroflow.io/api/agency/social/publishing/accounts/callback/meta`
3. The Meta app must have the required publishing scopes available for the signed-in operator:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_manage_engagement`
   - `pages_manage_metadata`
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_comments`
   - `instagram_manage_insights`
   - `business_management`
4. The Facebook user used in OAuth must have access to the Page being connected.
5. For Instagram publishing, the Page must be linked to an Instagram Business account.

Connection flow:

1. Go to `/agency/social/publishing/accounts`.
2. Select the target client.
3. Click `Connect` on Facebook.
4. Complete Meta OAuth.
5. If multiple Pages are returned, choose the Page(s) for that client in the selection modal.
6. Confirm Facebook and, if linked, Instagram rows appear under connected accounts.

Do not post test content to Facebook without confirming the exact Page and copy first.
