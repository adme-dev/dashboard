# Leads Engine — Staging UAT

**Date target:** before Phase 1 ship.
**Environment:** staging (Pages preview branch + staging Cloudflare account).
**Owner:** the executor of this plan.

## Pre-flight

- [ ] All three plans (1a / 1b / 1c) merged to `main`
- [ ] Migrations applied to staging Neon: `087-leads-engine.sql`, `090-leads-is-test.sql`, `091-leads-source-expand.sql`
- [ ] `leads-cron` worker deployed (3 schedules: stuck-claim recovery every 5 min, ingestion-error purge daily at 03:10 UTC, retention purge daily at 03:30 UTC)
- [ ] `INTERNAL_CRON_TOKEN`, `RESEND_API_KEY`, `DATABASE_URL`, `META_LEADGEN_VERIFY_TOKEN`, `META_APP_SECRET`, `GOOGLE_DEVELOPER_TOKEN`, `META_APP_ID`, `META_APP_SECRET` all set on Pages env
- [ ] `LEADS_DELIVERY_QUEUE` binding kept OFF in `wrangler.toml` (inline-fallback dispatch is the production path; queue + consumer wiring is deferred Path Y)
- [ ] Sidebar entry "Leads → Lead Inbox" visible to authed users

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
- [ ] Click "+ Add custom field" — verify the snake_case key is auto-derived from the friendly label

## Generic webhook (Zapier / Make / n8n / custom)

- [ ] In Settings → Social → Google → Lead webhooks, copy a client's URL + key
- [ ] Replace the URL path `/google/<token>` with `/generic/<token>` and POST the documented JSON shape (see Setup guide → Other sources)
- [ ] Confirm 200 + `lead_id` returned, lead appears in inbox with `source=webhook`
- [ ] Replay with same `lead_id` — confirm `200 {skipped: true}` (idempotency)
- [ ] Wrong `key` → 401 `invalid_key`
- [ ] Empty `fields` object → 200 + ingestion_error logged

## CSV import

- [ ] Download a small Meta Lead Center CSV (or any CSV with full_name/email/phone columns + a `lead_id` column)
- [ ] Inbox header → "Import CSV" → upload the file
- [ ] Confirm preview shows correct headers + first 5 rows
- [ ] Click Import → confirm "Imported N leads" toast + rows visible in inbox with `source=meta` (or `csv`)
- [ ] Re-upload the same file → confirm "Skipped duplicates" count matches imported count
- [ ] Edit the CSV to introduce a malformed row → confirm error count + first 10 errors shown in modal

## Form picker dropdown (OAuth-based)

- [ ] Form rules tab → "+ New form rule"
- [ ] Pick a client, leave source as Google Ads → confirm the Form dropdown loads with discovered Google Lead Form Extension assets across all connected accounts (each entry shows form name + account name)
- [ ] Switch source to Meta → confirm the dropdown surfaces a clear "leads_retrieval App Review pending" message and the "Use a custom form ID" toggle becomes available
- [ ] Switch source to Webhook / CSV import / Manual → confirm the dropdown is replaced by a manual form ID input
- [ ] Pick a discovered Google form → confirm form_name auto-fills, click Create & configure → rule editor opens

## is_test flagging

- [ ] In Google Ads "Send test data" against a configured form → confirm the lead lands but is HIDDEN from the default inbox
- [ ] Toggle "Show test leads" in the filter bar → confirm test leads appear with a yellow "TEST" badge next to the source icon
- [ ] Click "Clear filters" → confirm "Show test leads" toggles off

## Destination editor — presets + field picker

- [ ] Add a Slack destination → confirm "Lead alert" preset card appears at the top while config is empty → click it → confirm message_template populates with the {{ field.x }} skeleton
- [ ] Add an Email destination → confirm "Sales notification" preset works the same way
- [ ] On any new Slack/Email/Webhook destination, confirm the right-side "Available fields" panel lists Form fields (if the form has metadata), Lead metadata, and Attribution tokens
- [ ] Click any token → confirm clipboard contains it + a "Copied" toast
- [ ] Edit the message_template / body_template, save, click Test fire → confirm the rendered template arrives with values substituted

## Lead detail slideover

- [ ] Click any row in the inbox → slideover opens with full field data
- [ ] Field keys appear humanized (`full_name` → "Full name", etc.)
- [ ] Click the status badge in the header → confirm the dropdown menu lists 6 status options with icons
- [ ] Pick a new status → confirm toast + badge updates + agency side reflects the change
- [ ] Edit notes, click outside the textarea → confirm "Saving…" indicator → "Saved" check → fades after 2s
- [ ] Click "Retry failed" in the Delivery history section → confirm any failed deliveries re-enqueue

## Meta endpoints (pre-App-Review)

- [ ] `curl https://<host>/api/leads/webhook/meta?hub.mode=subscribe&hub.verify_token=<META_LEADGEN_VERIFY_TOKEN>&hub.challenge=ABC` → returns `ABC` 200
- [ ] Same with wrong verify_token → 403
- [ ] POST a real Meta event with HMAC-SHA256(META_APP_SECRET) signature in `X-Hub-Signature-256` header → 200 + archived in `lead_ingestion_errors` (either `phase_1_archive` or `leadgen_not_resolvable`)
- [ ] POST without signature → 401 `invalid_signature`
- [ ] POST with invalid signature → 401 `invalid_signature`
- [ ] After Meta App Review approves and operator reconnects Meta accounts: same POST succeeds, archive entry doesn't accumulate, lead lands in inbox

## Meta backfill (post App Review)

- [ ] After Meta App Review approves, reconnect at least one Meta account (Settings → Social → Meta) so the connection has the new scope
- [ ] `curl -X POST -H "Authorization: Bearer $INTERNAL_CRON_TOKEN" https://<host>/api/leads/_internal/meta-backfill?limit=500` → 200 + `{scanned, ingested, duplicates, still_pending, errors}` summary
- [ ] Confirm previously-archived rows in `lead_ingestion_errors` for `source=meta` decrease (rows that successfully fetch are deleted)
- [ ] Confirm new leads appear in the inbox with `source=meta`

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
