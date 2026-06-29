# Social Publishing API Setup

Last checked: 2026-06-04

This is the setup reminder for `/agency/social/publishing/accounts` OAuth connections.
Those account connections are reused by publishing and by the engagement inbox review sync.

Domain split:

- Agency website: `xeroflow.io`
- App: `app.xeroflow.io`

## Google Business Profile

Current status:

- Cloud project: `my-business-api-271101`
- Project number: `65723781223`
- OAuth app: `ADME Agency Dashboard`
- Production origin: `https://app.xeroflow.io`
- Production callback: `https://app.xeroflow.io/api/agency/social/publishing/accounts/callback/google-business`
- OAuth consent works and requests `https://www.googleapis.com/auth/business.manage`.
- API access is not approved yet. The Account Management API quota is currently `0 QPM`, which Google documents as "project has not yet been approved".

Required Google approval step:

1. Sign in as a Google account that owns or manages a verified, active Google Business Profile.
2. Open `https://support.google.com/business/contact/api_default`.
3. Select `Application For Basic API Access`.
4. Use the project ID and project number above.
5. Confirm the Google Business Profile has been verified and active for 60+ days and has a representative business website.
6. Wait for Google's follow-up approval email.
7. Re-check quotas in Google Cloud. Approval should move Business Profile API quota from `0 QPM` to `300 QPM`.

After approval, enable the full Business Profile API set Google lists in Basic setup:

- Google My Business API
- My Business Account Management API
- My Business Lodging API
- My Business Place Actions API
- My Business Notifications API
- My Business Verifications API
- My Business Business Information API
- My Business Q&A API

Notes:

- The `Google My Business API` v4 service is needed for Local Posts (`mybusiness.googleapis.com/v4/.../localPosts`).
- If the legacy service page fails to load or is not visible, the project is probably still not approved.
- Workspace users can also receive `403 PERMISSION_DENIED` if Google Business Profile Manager is disabled in Google Workspace Admin.
- The dashboard ships this channel dormant. Keep `GOOGLE_BUSINESS_PUBLISHING_ENABLED=false` or unset until Google approves API access and production OAuth secrets are ready. The flag currently gates the Google Business connection, so reviews cannot be connected while it is off.

Production activation:

1. Cloudflare Pages production secrets must include:
   - `GOOGLE_BUSINESS_CLIENT_ID`
   - `GOOGLE_BUSINESS_CLIENT_SECRET`
   - `GOOGLE_BUSINESS_REDIRECT_URI=https://app.xeroflow.io/api/agency/social/publishing/accounts/callback/google-business`
   - `SOCIAL_OAUTH_STATE_SECRET`
2. Set `GOOGLE_BUSINESS_PUBLISHING_ENABLED=true`.
3. Reconnect each Google Business Profile location from `/agency/social/publishing/accounts`.
4. Run a manual inbox refresh from `/agency/social/inbox` and confirm the Google Business review channel reports healthy in the account health drawer.
5. Check `/agency/social/inbox/reviews` for imported reviews.
6. Publish a low-risk local post and confirm it appears in Google Business Profile Manager if local posts are being activated at the same time.

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
