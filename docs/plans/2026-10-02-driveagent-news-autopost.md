# DriveAgent published-news auto-posting

Authorized by Paul on 2 October after the rolling queue proposal. Extend the existing client Queue and Facebook dispatcher; do not replace the dealer Auto Feed or manually approved calendar.

## Design

One client-scoped rule selects a connected Facebook account and a fixed, owned DriveAgent published-news source. Modes: paused, review drafts, automatic scheduling. Deterministic copy uses the published headline and standfirst, source date and image disclosure; no new AI research or factual rewriting. Only published, non-archive stories with a same-origin image are eligible. Intake and planned posting age are limited to 72 hours. Scheduling considers enabled slots explicitly marked news, their timezone/capacity, occupied posts and a rolling seven-day horizon. Existing posts are deduplicated by canonical article URL as well as durable import receipts.

Transactions lock the client and rule for each bounded import. Receipts, post and approval-policy audit are committed together. Overlapping polls cannot create duplicate posts. Pausing cancels pending automatic posts; dispatch also checks the current rule mode. Cancelled receipts prevent resurrection. Source failures leave existing calendar intact and show a recoverable status. Poll every 15 minutes through the existing companion cron; last check, outcomes and upcoming generated posts are visible in Queue.

UI follows the existing Nuxt UI design: compact settings above slot management, labelled full-width controls, semantic colors, table/list of recent imported stories, action links to Planner and Approvals. No new typeface or visual theme.

## Slices and acceptance

1. Pure source/eligibility and slot planner: malformed, archive, future, stale, missing-image, duplicate, sponsor-slot, capacity and DST tests fail first, then pass. No new dependency.
2. Additive rule/receipt migration and transactional replenishment: fresh reads, account/client isolation, atomic idempotency, existing calendar preserved, pause and cancellation guards. API access and concurrency tests.
3. Queue controls and cron integration: save mode/account, check now, error/empty states and recent receipts. Marketing pages explain the opt-in feature. Browser verify desktop/mobile and client switching.
4. Run focused regression, lint, typecheck and guarded production build/deploy. Apply migration automatically. Enable only DriveAgent; verify live generated scheduling, repeated-poll dedupe, recurring cron and established QR navigation. Preserve source, deployment and rollback receipts in runbook.

## Rollback

Pause the client rule to stop replenishment and cancel only its pending automatic posts. An in-flight provider call can finish. Existing manual posts/sponsors remain unchanged. Database schema and receipts are additive and retained. Restore prior verified Pages artifact only if application regression requires it.
