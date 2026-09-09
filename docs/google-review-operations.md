# Google review operations

## Behaviour

Google reviews use the existing Social > Engagement > Reviews inbox and the same connected Business Profile locations as publishing. The companion `social-inbox-cron` Worker polls every five minutes; it is deployed separately from Pages. Account ordering rotates through stale connections when a request budget is reached. Each Google poll checks the newest page and advances one historical page. Interrupted pages retain their cursor for retry.

Per-client rules created by `scripts/configure-google-review-automation.mjs`:

- 4–5 stars: personalised thank-you, confidence at least 0.9, at most 10 automatic replies per client rule per hour. Risky or uncertain responses require approval.
- 1–3 stars: staff approval only, urgent inbox priority, dedicated email alert for newly received unanswered reviews.
- Reviews from before rule activation, older than 24 hours, or already answered are never automatically replied to. Historical imports remain visible to staff without an email flood.
- Before an automatic Google reply, the provider re-reads the review and rejects it if it has been answered, changed, or is no longer safe and positive.
- Queue message uniqueness prevents concurrent automation sends. Google owner replies use a stable message identity so imports and manual edits do not duplicate outbound messages.

`SOCIAL_AUTOMATION_ENABLED=true` activates only matching configured rules. `SOCIAL_REVIEW_ALERT_EMAILS` explicitly opts named recipients into review-only notifications; initially `paul@adme.net.au`. Failed deliveries remain pending for retry. Resend receives a per-review idempotency key. General notification settings are not changed.

## Deployment and activation

1. Work from the current production commit in an isolated worktree. Keep the worktree's `node_modules/.cache` private as well as `.nuxt` and `dist`. Preserve any newer production deployment made by another session.
2. Run relevant social tests and `pnpm deploy:check`, then `pnpm deploy:production`. The project must remain `agency-dashboard`.
3. With production `DATABASE_URL` loaded, run `node scripts/configure-google-review-automation.mjs` to inspect the exact client/rule scope, then rerun with `--apply`. Repeated runs preserve existing rules and do not create duplicates.
4. Set the companion Worker's `CRON_SECRET` to the existing Pages secret. Deploy only that Worker using `pnpm deploy:workers social-inbox-cron`.
5. Confirm `mybusiness.googleapis.com` remains enabled on the approved production project documented in `social-publishing-api-setup.md`, and run a manual review sync. Confirm Google review rows exist, each review channel has a recent successful sync, and the actual Reviews screen shows them.
6. Verify a newly received 4–5 star review is replied to once, an already answered review is not changed, and a newly received 1–3 star review creates an urgent item and a delivered alert without a public automatic reply. Do not manufacture customer reviews to test production.

The application uses Cloudflare request/cached bindings for its runtime gates and cron authentication. Manual refresh passes the same resolved secret as the scheduled Worker.

## Facebook permission gap

The existing Facebook imports are separate from Google. Accounts returning error 283 require `pages_read_user_content`. Request Advanced Access from Meta if not approved, then set `SOCIAL_USER_CONTENT_ENABLED=true` and reconnect the affected accounts. The permission remains gated so an unapproved scope cannot break existing OAuth connections.

## Rollback

Set `SOCIAL_AUTOMATION_ENABLED=false` to stop automatic drafts/sends. Remove `SOCIAL_REVIEW_ALERT_EMAILS` to pause review emails while retaining pending alerts. Disable the companion Worker's cron to stop polling. No schema migrations are required for these changes.

## Release evidence — 2026-09-09

- Pages app commit: `0f35ccd09`; deployment `3ec493fc.agency-dashboard-6cm.pages.dev` on production branch `main`. Sync errors remain visible while the connected-location count and retry action stay available.
- Preserved the previously deployed measurement capability fix `60f217138` by building directly on its commit.
- 722 relevant tests passed. Production build and guarded deployment passed. Repository-wide typecheck still reports existing errors; it is not a clean typecheck baseline.
- `social-inbox-cron` deployed with `*/5 * * * *`; existing Pages `CRON_SECRET` installed securely. An empty-client authenticated production probe returned HTTP 200 without importing or replying. The first observed scheduled invocation also returned HTTP 200 with no Worker exceptions; it synced two accounts and processed five automation candidates before its request budget expired. Candidate processing is not evidence of five public replies.
- Eleven misplaced Google locations reassigned from Geelong GWM Haval to their corresponding existing client groups. Twelve active Google locations now span eight clients. `repair-google-review-clients.mjs` refuses unexpected mappings or linked history, locks posts/accounts during the repair, and stores prior client metadata for auditing.
- Sixteen Google-only rules activated: one approval rule and one guarded autopilot rule for each of eight clients.
- Google activation is resolved. The existing project `gen-lang-client-0818792107` (`14351276985`) has the approved Account Management quota of 300/minute. Advertising enabled the legacy reviews API using a temporary, time-limited Service Usage Admin grant; that grant was removed after activation. Paul remains the project owner. Production credentials and stored OAuth connections were preserved.
- Read-only `reviews.list` requests returned HTTP 200 for all twelve connected locations. Two locations have no reviews. Actual Google reviews and existing owner replies are visible in the production Reviews screen; screenshot `/private/tmp/xeroflow-google-reviews-live-slack.png` records this, not newly generated public replies.
- The first storage audit found 356 Google reviews, zero duplicate conversations, and all 26 unanswered 1–3-star reviews marked urgent. Every connected location had a recent successful review sync with no account or review error. Historical backfill continues through retained cursors.
- A separate Advertising project (`wise-trainer-382200`) could enable the private API but had zero Account Management quota and returned 404 from reviews. Its temporary verification OAuth client and local credential files were removed, and its legacy API was restored to disabled. No new access application was required.
- Public automatic reply delivery and a new negative-review email still need observation on a naturally arriving eligible review. Imported historical reviews are deliberately protected from automatic responses and alert floods.

Other sessions must include this release's commits before their next production deployment. The shared working checkout was not switched or reset.
