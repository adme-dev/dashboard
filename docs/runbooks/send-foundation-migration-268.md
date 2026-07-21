# Send foundation migration 268

This runbook covers `268_send_foundation.sql`, the dormant canonical schema for workspace and verified-public Send. The migration does not enable routes, send email, modify R2, or expose public creation.

Do not apply this migration to a shared database without explicit approval.

## Forward-fix is the default

The Send tables are canonical lifecycle and security evidence. If a defect is found after data exists, ship an additive forward migration that preserves transfer, upload, recipient, and event evidence. Record the exact failing constraint or query and validate the correction in an isolated database first.

Before applying, confirm that `268` is still the next free conventional migration identifier and that `projects(client_id, id)`, `agency_clients(id)`, and `team_members(id)` have the expected types. Applying the migration twice should be harmless, but the second run is still part of isolated verification before shared use.

## Before activation

If the migration has been applied but no Send route or worker has been enabled and every Send table is empty, rollback may remove the new triggers, functions, tables, and `uq_projects_client_id_id` index in reverse dependency order. Take a schema snapshot first. Prefer a forward fix when there is any doubt that another feature uses the composite project index.

## After activation

Do not drop canonical rows to recover from an application defect. Disable Send entry points and workers, preserve private R2 objects, capture counts by transfer status, and deploy an additive repair. Reconcile database rows against object metadata only through the approved reconciliation tooling; R2 existence is not access authority.

Do not drop `send_events`, even during rollback after activation. It is append-only security and delivery evidence. Do not rewrite or delete event rows; record correcting events.

## Dormant rollback order

Only before activation, after confirming all six tables contain zero rows:

1. Drop Send triggers.
2. Drop `prevent_send_event_mutation()`, `protect_send_transfer_identity_and_policy()`, and `set_send_updated_at()`.
3. Drop `send_events`, `send_upload_intents`, `send_recipients`, `send_files`, `send_transfers`, then `send_public_senders`.
4. Drop `uq_projects_client_id_id` only if no other schema depends on it.

This is intentionally a manual, reviewed rollback. No automatic destructive rollback is bundled with the migration.
