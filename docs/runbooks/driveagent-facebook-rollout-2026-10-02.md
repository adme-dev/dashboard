# DriveAgent News: first XeroFlow → Facebook rollout

Client: `bc8a15a8-f523-4a75-a8f4-a501649bb71d`. Facebook account: `2b0d3667-d4c7-47d5-b685-58934dfdc5a3`, Page asset `1391237540730945`. Public Page: https://www.facebook.com/profile.php?id=61595089886357.

Authorized by Paul on 2 October 2026: create the proposed welcome post, daily news schedule and three sponsor posts per week, and fix rollout bugs. Organic publishing only; no paid campaign or new network connection in this release.

## Implementation order and acceptance

1. Audit live client/account, publisher, approval workflow, dispatcher, news import and metrics collection. Preserve unrelated work; start fixes from freshly fetched origin/main. Verify target account before every publish.
2. Create one welcome post through XeroFlow, approve using the existing workflow, publish once, record provider ID/permalink and verify the Facebook page. Stop duplicate retries if outcome is uncertain. A saved token alone is not proof of publishing.
3. Create recurring Melbourne-time slots: daily news 09:00 and 17:30; Monday/Wednesday/Friday sponsor 12:30. Populate a bounded first week with distinct verified DriveAgent articles and one post for each Northern Motor Group, Northern Nissan ARIYA and Northern Kia EV4. Clearly mark sponsor content and avoid unverified pricing/availability. Keep dated news fresh; future slots alone do not create content.
4. Verify posts in Calendar/Planner/Queue, approved scheduled status, explicit client/account scope, UTM links, future timestamps and Australian daylight-saving transition on 4 October. Verify a real scheduled dispatch, not only a manual publish.
5. Fix demonstrated faults with focused regression tests. Check safe provider error handling, duplicate avoidance, approval integrity, feed link preservation and failure visibility. Improve cron operation/observability where evidence requires it. Review changes before commit; deploy only current reviewed source via guarded scripts, recording release metadata.
6. Record final published IDs, scheduled IDs/times, active slot counts, provider/metrics limitations, deployment references and pause/cancel instructions. Never report missing metrics as real zero audience reach or scheduled slots as automated content creation.

## Rollback

Pause only this client's new recurring slots and cancel its still-scheduled rollout posts through the application. Published content requires a separate explicit removal decision. Preserve audit history, source records, existing clients, credentials and sponsor bookings.

## Evidence / execution

- Base `origin/main`: `8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e`; isolated worktree `/private/tmp/xeroflow-driveagent-facebook-rollout`, branch `feat/driveagent-facebook-rollout-20261002`.
- Live Pages artifact at audit: `ec3a61cf-d866-4960-8cb1-e4f2f4d4a1d6`, same base commit.
- Existing `social-dispatch-cron`: every two minutes, secret binding present. Metrics companion `social-metrics-cron` not found; check consolidated cron before adding another collector.
- Execution receipts to be appended after verification.

## First-week configuration verified

- Reused welcome post `33845709-e21b-45dd-bae1-4a9b8d60549b`, approved and scheduled 2 October 2026 16:12 AEST. Image: `https://driveagent.news/publication/social/driveagent-facebook-launch-20261002.jpg` (1200 × 630 JPEG). Provider publication receipt remains pending.
- Seventeen distinct first-week posts are approved/scheduled, covering fourteen news articles and three clearly labelled sponsors. Exact content/timestamps: `driveagent-facebook-first-week.json`. First F1 story is due 2 October 17:30 AEST; sponsor posts are Monday/Wednesday/Friday 12:30 AEDT. Calendar timestamps were verified across the 4 October daylight-saving transition.
- Seventeen enabled recurring Facebook slots use `Australia/Melbourne`: daily 09:00/17:30 and Monday/Wednesday/Friday 12:30. Slots provide capacity, not automatic content generation; their contentKind metadata is not enforced by queue fill, so first-week posts use explicit reviewed timestamps.
- Live Chrome checks: Calendar contains all 18 rollout posts; Planner shows 18 scheduled, zero drafts/pending approvals, one connected account; Queue shows 17 enabled slots and no unscheduled entries. Client is DriveAgent News on each screen. Established QR Codes navigation loads six codes and a code detail with design/downloads, destination, scan analytics and history. No QR state changed. Evidence in website workspace `output/facebook-rollout-20261002/`.

## Demonstrated scheduler fault and fix

The first real due tick exposed a pre-existing UUID/text SQL mismatch in the atomic publishing claim: `client_id` is UUID but optional parameter `$2` was first cast as text. Before any provider attempt, Pages returned 500 and the welcome remained scheduled with `publish_attempts=0`. A read-only PostgreSQL EXPLAIN reproduced `operator does not exist: uuid = text`; changing the parameter cast to UUID parsed successfully against the same live schema without executing an update.

Source `e4eaa3c26f80718336e7dfeb48916b64a301271c` corrects this cast while retaining the status, attempt-limit, scheduled-time and client predicates. Regression test failed before the fix; 56 focused tests pass after it, including approval integrity, idempotent manual/cron claims, workflow fallback, provider tracked-link behavior, fresh approval/calendar reads and queue placement. Changed-file ESLint and diff checks pass. Full typecheck still has two unrelated baseline errors in shared QR declarations and email contracts. Guarded build/release started after a fresh fetch confirmed origin/main `8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e` is an ancestor.

## Tracking and network limits

Website clicks are stamped with UTM parameters, including photo/video captions. Organic metrics collector cron is absent; GA4 and Meta CAPI are not yet configured for this client. Missing analytics are not verified zero reach. Instagram/TikTok are not connected in this Facebook rollout.

## Integration ledger

The isolated source branch `feat/driveagent-facebook-rollout-20261002` is based on current main and contains three application fixes: `a08277498` approval/caption handling, `05d2cb98c` fresh post/approval/calendar reads, and `e4eaa3c26` UUID claim typing. It remains unmerged and must be preserved for reviewed integration; do not deploy the shared dirty dashboard workspace or treat old branches as future release bases. Deployment/provider receipts are appended when verified.

## Verified application deployment

Cloudflare Pages production `agency-dashboard`: deployment `c27cbd16-bdf3-4f11-b130-ce2ab3915e5c`, immutable URL `https://c27cbd16.agency-dashboard-6cm.pages.dev`, exact source `e4eaa3c26f80718336e7dfeb48916b64a301271c`. API readback at 06:26:36 UTC reports success and canonical production. Guarded full Nuxt build and deployment succeeded; current main remained `8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e`. No post was manually retried during release.
