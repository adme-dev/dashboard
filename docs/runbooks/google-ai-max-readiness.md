# Google Ads AI Max Readiness Release Runbook

This runbook releases the read-only Google Search campaign readiness control for the
1 September 2026 AI Max migration. It covers schema, first scan, verification,
scheduling, internal notifications, and rollback. The release does not change Google
Ads campaign settings.

## Safety state

- `GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED` must be absent or set to `false` during
  migration, preview, and the first production scan.
- Do not deploy the consolidated `pages-cron` Worker change until the first manual
  scan has been compared with Google Ads.
- Do not enable notifications until the Manual verification sign-off is recorded.
- Existing AI Max tables and observations are additive and can remain in place during
  rollback.

## 1. Preflight

From the isolated feature checkout:

```bash
pnpm install
pnpm deploy:check
pnpm exec vitest run test/server/utils/googleAiMax.test.ts test/server/utils/googleAiMaxScanner.test.ts test/server/api/googleAiMaxScanEndpoint.test.ts
```

Confirm the Pages production environment has the existing Google OAuth client,
developer token, database connection, and `CRON_SECRET`. Confirm
`GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED` is absent or `false`.

## 2. Migration

Load the configured database URL without printing it, then apply both additive
migrations in order:

```bash
set -a
source .env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/288_google_ai_max_readiness.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/289_google_ai_max_notifications.sql
```

Both files are idempotent. Re-run them once and confirm only `already exists, skipping`
notices appear.

## 3. Preview release

Use only the guarded repository scripts:

```bash
pnpm deploy:check
pnpm deploy:preview
```

Sign in as a user with `MEDIA_BUYING`, select the intended Xero organisation, and open
`/agency/social/google/ai-max`.

## 4. First manual scan

Keep notifications disabled. On the readiness page, select one known direct Google Ads
account and choose **Scan now**. After that run completes, repeat with one known MCC
child account, then run the full portfolio scan.

Run the bounded database check for the selected tenant:

```bash
set -a
source .env
set +a
AI_MAX_TENANT_ID='<selected-xero-tenant-id>' node scripts/google-ai-max-readiness-check.mjs
```

Expected conditions:

- the latest run is `completed` or an understood `partial` result;
- processed connections reconcile to the intended Google scope;
- coverage is non-zero when eligible Search campaigns exist;
- failed accounts show redacted operational errors, never tokens;
- a rescan with unchanged Google evidence creates no material-change events.

## 5. Google Ads comparison

For at least three campaigns, compare the evidence slideover with the Google Ads UI:

1. one campaign using automatically created text assets;
2. one using campaign-level broad match;
3. one with AI Max enabled, including final URL expansion and ad-group matching
   exceptions where available.

Record campaign IDs, not names, in the release ticket. Confirm the XeroFlow status,
migration trigger, effective subfeatures, and deep link. Any unsupported or missing
provider value must appear as `Unknown`; do not reinterpret it as disabled.

## 6. Production application release

After preview approval:

```bash
pnpm deploy:check
pnpm deploy:production
```

Repeat the First manual scan and Google Ads comparison in production while notifications
remain disabled.

## 7. Enable the daily pages-cron route

The consolidated Worker owns recurring HTTP calls because Cloudflare Pages has no
scheduled handler. The committed schedule runs at `30 6 * * *`, after the 06:00 UTC
spend sync, and calls `POST /api/cron/google-ai-max-readiness` with the existing
`x-cron-secret` header.

Only after the production comparison passes:

```bash
pnpm --dir workers/pages-cron install
pnpm --dir workers/pages-cron deploy
```

Confirm the `pages-cron` Worker still has its encrypted `CRON_SECRET` and that it
matches Pages. Test authentication without exposing the value:

```bash
curl -i -X POST "$APP_BASE_URL/api/cron/google-ai-max-readiness" \
  -H "x-cron-secret: $CRON_SECRET"
```

Expect HTTP 200 with `scheduled: true`. A missing or incorrect header must return 401.
Inspect `google_ai_max_scan_runs` for the terminal scheduled run rather than expecting
the HTTP response to wait for Google.

## 8. Manual verification sign-off and notifications

Notification delivery is dormant by default. After a media lead signs off the campaign
sample and daily scan behavior, set the Pages production variable:

```text
GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED=true
```

Redeploy through `pnpm deploy:production`. The first release sends internal in-app
alerts only: first affected detection, transitions to unknown, and one unresolved daily
digest. Database delivery claims deduplicate by tenant, user, campaign/event/day.
Existing quiet-hours/DND behavior suppresses low-signal push delivery while retaining
the in-app record. There is no client portal, email, or Slack fan-out.

## 9. Operational checks

Daily, verify:

- latest scheduled run status, duration, processed/total connection count, and failures;
- eligible/affected/unknown counts and coverage;
- observations older than 26 hours (warning) or 72 hours (critical/unknown);
- notification claim counts versus internal notification rows;
- no overlapping `queued` or `running` run per tenant.

The readiness API caches tenant/filter results for no more than 60 seconds and clears
all variants when a scan finishes. A failed zero-state result is not cached.

## 10. Rollback

1. Set `GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED=false` (or remove it) and redeploy with
   `pnpm deploy:production` to stop new alerts.
2. Disable the `30 6 * * *` trigger on the `pages-cron` Worker to stop scheduled scans.
3. If required, revert the application feature branch and redeploy through the guarded
   scripts. Do not delete historical observations during an incident.
4. Manual Google Ads rollback is unnecessary because this release makes no provider
   writes.

If a provider field changes shape, leave scheduling disabled, preserve the last known
evidence, add a sanitized fixture, update the fail-closed classifier, and repeat preview
comparison before re-enabling the cron.
