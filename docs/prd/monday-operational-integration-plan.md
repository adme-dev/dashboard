# Operational Monday Integration Plan

## Goal

Keep Monday and the platform’s operational dashboard aligned across tasks, comments, files, assignments, and inactivity signals.

## Phase 1 — Full landing

- [x] Board/item/subitem migration foundation.
- [x] Task provenance mappings.
- [x] Comment/update mapping foundation.
- [x] File download and local attachment foundation.
- [x] Cross-session idempotency safeguards.
- [x] Run one authenticated board smoke import and verify local landing.

## Phase 2 — Webhooks

- [x] Add webhook endpoint for item/status/assignment/update/file events.
- [x] Verify Monday signed JWT using `MONDAY_SIGNING_SECRET`.
- [x] Handle Monday challenge/verification requests.
- [x] Persist event ID and reject duplicates.
- [x] Queue reconciliation rather than doing large work in the request.
- [x] Add idempotent OAuth-app webhook registration for approved boards.
- [x] Complete the one-time owner OAuth consent and run registration in production.

## Phase 3 — Reconciliation and health

- [x] Scheduled scope-bound incremental reconciliation for missed webhooks.
- [x] Detect renamed, archived, deleted, reassigned, and stale records.
- [x] Compare Monday `updated_at` and authenticated webhook receipt timestamps with local task timestamps; excluded comment/update content is not treated as HR evidence.
- [x] Detect overdue, blocked, or inactive mapped work.

## Phase 4 — Dashboard and notifications

- [x] Add operational alerts for no-update thresholds.
- [x] Add owner/assignee inactivity and blocker notifications.
- [x] Link every alert to the Monday item and local task.
- [x] Show sync health, webhook queue/failures, and work alerts.

## Authentication gates

The user will provide or confirm:

- Production webhook URL.
- Monday app signing secret (`MONDAY_SIGNING_SECRET`).
- Monday webhook subscription configuration/permissions.
- Production test board and permitted smoke-test window.

Never place the signing secret or API token in source control, logs, or dashboard payloads.

## Production webhook setup

1. Set `MONDAY_SIGNING_SECRET` in the Cloudflare/Worker secret store.
2. Configure the Monday app webhook URL as `https://<production-host>/api/webhooks/monday`.
3. Send a Monday challenge request and confirm the same challenge is returned.
4. Enable item update, status, assignment, update/comment, and asset events for the approved operational boards.
5. Configure the scheduled worker/cron to call `/api/cron/monday-webhooks` with `x-cron-secret`.
6. Verify the webhook event appears once in `monday_webhook_events`, is processed, and updates the mapped task.
7. Repeat the same event and confirm the event ID is ignored as a duplicate.

### Smoke command

```bash
MONDAY_WEBHOOK_URL=https://<production-host>/api/webhooks/monday \
MONDAY_SIGNING_SECRET="$MONDAY_SIGNING_SECRET" \
MONDAY_SMOKE_BOARD_ID=<board-id> \
MONDAY_SMOKE_ITEM_ID=<item-id> \
node scripts/test-monday-webhook.mjs
```

Expected output includes a successful challenge check, two accepted webhook
responses with the same event ID, and a final duplicate-event confirmation.

## Acceptance criteria

- A changed Monday item updates the correct local task exactly once.
- A Monday update becomes one local activity exactly once.
- A Monday asset becomes one local attachment with durable storage.
- Missed webhook events are repaired by scheduled reconciliation.
- Inactivity appears as a dashboard alert with source provenance.
- Invalid webhook signatures are rejected.
