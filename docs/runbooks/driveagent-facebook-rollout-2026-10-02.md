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
