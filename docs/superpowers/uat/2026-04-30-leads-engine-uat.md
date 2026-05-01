# Leads Engine — Staging UAT

**Date target:** before Phase 1 ship.
**Environment:** staging (Pages preview branch + staging Cloudflare account).
**Owner:** the executor of this plan.

## Pre-flight

- [ ] All three plans (1a / 1b / 1c) merged to `main`
- [ ] Migration `087-leads-engine.sql` applied to staging Neon
- [ ] `leads-delivery-worker` deployed to staging account
- [ ] `leads-cron` deployed to staging account
- [ ] `LEADS_DELIVERY_QUEUE` producer binding configured on the staging Pages env
- [ ] CF dashboard has the queue consumer wired
- [ ] `INTERNAL_CRON_TOKEN`, `RESEND_API_KEY`, `DATABASE_URL`, `META_LEADGEN_VERIFY_TOKEN` all set on Pages + Worker envs

## Real Google Ads round-trip

- [ ] Pick a test client in staging
- [ ] Settings → Social → Google → Lead webhooks: copy URL + key for that client
- [ ] In a Google Ads test account, create a Lead form asset with a few questions, paste URL + key into "Webhook integration" → click "Send test data"
- [ ] Confirm 200 response in Google Ads
- [ ] Confirm a row appears at `/agency/leads` for the test client within 30 seconds
- [ ] Confirm a notification reaches the assigned AM (or the client's primary AM)
- [ ] Confirm the SSE stream pushed the lead to the open inbox without refresh

## Form Rules editor

- [ ] Switch to the Form Rules tab; the Google test form is listed
- [ ] Click Configure; rule auto-creates
- [ ] Add a `slack` destination pointing at `#staging-leads`; save
- [ ] Add a `webhook` destination pointing at https://webhook.site/<your-token>; save
- [ ] Add an `email` destination addressing `staging-ops@adme.net.au`; save
- [ ] Add a `portal` destination; save
- [ ] Click Test fire — confirm all four destinations show `delivered` (or http_200 for webhook.site)
- [ ] Send another test data event from Google Ads; confirm Slack message arrives within 60s, email within 60s, webhook.site captured the JSON, portal inbox shows the lead for the client

## Filters

- [ ] Edit the Slack destination; add a filter `field_data.budget gt 5000`
- [ ] Send a test lead with budget 1000 → Slack does NOT receive (delivery row `cancelled` or skipped via filter)
- [ ] Send a test lead with budget 10000 → Slack receives

## Delays

- [ ] Add a destination with delay 5 minutes
- [ ] Send a test lead; confirm delivery row in `pending` for ~5 min, then dispatched
- [ ] Disable that destination during the wait; confirm delivery flips to `skipped` reason `destination_disabled` instead of firing

## Manual entry

- [ ] Click "+ Manual lead", pick a client, add fields, submit
- [ ] Confirm row appears in inbox with `source=manual`
- [ ] Confirm notification fired to the assigned AM

## Client portal

- [ ] Log in as a portal user for that client
- [ ] Visit `/portal/leads`; confirm only that client's portal-flagged leads show
- [ ] Click a lead; confirm detail (no delivery history, no assignment)
- [ ] Click "Mark contacted"; confirm status updates and the agency side reflects `contacted_by` = the portal user
- [ ] CSV export downloads only the visible leads

## Operations

- [ ] Trigger `/api/leads/_internal/recover-stuck-claims` manually (with `INTERNAL_CRON_TOKEN`); 200 response, `reset` field returns
- [ ] Force a stuck claim by manually setting a delivery to `claimed` 6 minutes ago; re-run cron; confirm reset
- [ ] Trigger `/api/leads/_internal/purge-ingestion-errors`; confirm 200 + sensible `deleted` count
- [ ] Inspect Worker logs in CF dashboard during a load run; no unhandled exceptions

## Load

- [ ] Run `scripts/loadtest-leads.mjs` against staging with 1,000 leads / concurrency 50
- [ ] Confirm: 0 failures, p95 latency < 1s, queue drains within 5 minutes
- [ ] Inspect `lead_deliveries` aggregates: no `failed` (other than ones intentionally bad), no `claimed` stragglers

## Privacy

- [ ] Soft-delete a lead from the inbox; confirm gone from filters but still queryable in DB with `deleted_at` set
- [ ] As an admin, hit `/api/leads/<id>/purge`; confirm hard-delete cascades to `lead_deliveries`
- [ ] Confirm `lead_ingestion_errors` purge works on rows older than 30 days (use a hand-aged row)
- [ ] Confirm retention purge works in dry-run with `LEADS_RETENTION_MONTHS=1` (then revert to 18)

## Sign-off

- [ ] All items above checked
- [ ] Plan 1a / 1b / 1c milestone tags exist (`leads-1a-backend`, `leads-1b-ui`, `leads-1c-ops`)
- [ ] Cut a `leads-phase-1-shipped` annotated tag pointing at the merge commit
