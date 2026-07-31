# Search Authority Phase 1 Runbook

## Purpose

Operate the Knox GWM Haval design-client pilot without enabling later technical
crawling, edge publishing, Menu Agent, or Google Business Profile phases.
Phase 1 is read-only provider ingestion plus human-reviewed task handoff.

## Runtime prerequisites

- Node.js `24.18.0`.
- `SEARCH_AUTHORITY_ENABLED=true` in the production build, plus
  `NUXT_SEARCH_AUTHORITY_ENABLED=true` and
  `NUXT_PUBLIC_SEARCH_AUTHORITY_ENABLED=true` in the intended Pages
  environment. The private `NUXT_` value is the request-time server kill
  switch; the public value is a presentation-only navigation mirror.
- `CRON_SECRET` configured on both the Pages application and `pages-cron`
  Worker.
- Google OAuth client configured with the Search Console read-only scope and the
  exact XeroFlow callback URL.
- The Knox client has an active `search_authority.core` entitlement.

The global flag is the kill switch. The client entitlement is the tenant
boundary. Both must pass.

## Production pilot record

- Activation approved: 31 July 2026. Runtime activation is complete only after
  the production deployment and tenant preflight below pass.
- Owner: XeroFlow operations.
- Initial cohort: Knox GWM Haval only.
- Canonical hostname: `www.knoxgwmhaval.com.au`.
- Content hostname: unset for Phase 1.
- First review: after the initial baseline completes, then weekly during the
  pilot.
- Roll back immediately for cross-client exposure, provider writes outside the
  selected property, data-integrity failures, or a material increase in
  production error rate. Use the kill-switch procedure below; leave additive
  evidence tables in place.

## Pilot activation

Before merging or scheduling the globally armed release, list every currently
valid entitlement. Proceed only when the result is empty before Knox setup, or
contains exactly the Knox client after site setup:

```sql
SELECT c.id, c.name, e.status, e.starts_at, e.expires_at
FROM client_feature_entitlements e
JOIN agency_clients c ON c.id = e.client_id
WHERE e.feature_key = 'search_authority.core'
  AND c.is_active IS TRUE
  AND e.status IN ('active', 'trial')
  AND e.starts_at <= NOW()
  AND (e.expires_at IS NULL OR e.expires_at > NOW())
ORDER BY c.id;
```

The pre-merge production check on 31 July 2026 returned zero valid rows. After
step 2, repeat the query and require exactly Knox GWM Haval
(`b6d459d4-aeaa-4c78-9868-e6682a0dbc68`) before deploying `pages-cron`.

1. Open **Agency → Search Authority → Connections**.
2. Select Knox GWM Haval and save `www.knoxgwmhaval.com.au` as the canonical
   hostname. Do not configure a content hostname in Phase 1.
3. Connect the Google identity that can read the verified Knox property.
4. Map the verified domain or URL-prefix property and confirm its permission
   level is not `siteUnverifiedUser`.
5. Trigger the initial sync with an authenticated
   `POST /api/agency/search-authority/sync` body containing the Knox
   `clientId`, or wait for the next scheduled run. The initial 90-day baseline
   is processed in resumable chunks of at most 30 dates (90 projection calls)
   per run. Its start and end dates are stored on the property map, so manual
   short-range or legacy successful runs cannot bypass it. Re-run the sync
   until the baseline completion timestamp is set; completed projections are
   not fetched again during the backfill.
6. Verify the agency workspace shows a data-through date, completeness caveats,
   and literal Search Console measures.

## Scheduled operation

The dedicated `pages-cron` Worker calls:

```text
POST /api/cron/search-console-sync
x-cron-secret: <CRON_SECRET>
```

Schedule: `15 2 * * *`.

After the application release, deploy the updated schedule with
`pnpm deploy:workers pages-cron`. This uses
`workers/pages-cron/wrangler.toml`; it is not a Pages dashboard cron trigger.

Each entitled active client runs in this order:

1. trailing Search Console refresh;
2. deterministic 28-day opportunity generation;
3. at most 50 indexed-version URL inspections.

Each selected property is protected by a renewable, token-bound two-hour sync
lease. Ownership is renewed before every evidence date; a worker stops before
provider writes if it loses the lease. Operator-requested manual refreshes are
capped at 30 inclusive days, matching the per-run evidence limit.

Confirm recent `gsc_sync_runs` are `succeeded` or intentionally `partial`, the
property map has a current `data_through_date`, and failures retain a literal
provider error rather than zeroing prior evidence.

## Review and task handoff

Agency staff move opportunities through `new → under_review → accepted`.
Only then can **Create task** open the normal XeroFlow task dialog. The evidence
is editable before submission. Task linking is a separate atomic step; if it
fails, use **Retry link** and do not create a second task.

Client portal users see measured visibility, freshness, approved actions, and
next steps. They do not receive raw queries, internal score reasons or weights,
connection identifiers, credentials, or cross-client benchmarks.

## Kill switch and rollback

1. Set `SEARCH_AUTHORITY_ENABLED=false`,
   `NUXT_SEARCH_AUTHORITY_ENABLED=false`, and
   `NUXT_PUBLIC_SEARCH_AUTHORITY_ENABLED=false` in `wrangler.toml`. Set the
   matching production Build environment value in `.github/workflows/ci.yml`
   to `false`. The private `NUXT_` value closes the request-time server gate;
   the public and build values hide the presentation-only client mirror.
2. Redeploy through the guarded `pnpm deploy:*` command only after
   `pnpm deploy:check` passes.
3. Remove or disable the `15 2 * * *` trigger in
   `workers/pages-cron/wrangler.toml` and redeploy that Worker if ingestion
   must stop immediately. Leaving it scheduled is also safe after the global
   flag is off because the endpoint queues no clients.
4. Disconnect the Knox Search Console mapping if provider access must be
   revoked. Purpose-bound encrypted Google credentials remain governed by the
   shared credential-profile lifecycle.

Migrations `329_search_authority_phase_1.sql` and
`330_search_authority_evidence_hardening.sql` are additive. Leave their tables,
checks and selected-property constraint in place during rollback; disabling
flags and cron removes runtime exposure without destroying evidence or audit
history.

## Provider limitations

- Search Console can lag and mark recent data provisional.
- Query data can be privacy-filtered and is not a complete demand census.
- URL Inspection describes Google’s indexed version, not a live fetch.
- Inspection quota is provider-controlled; XeroFlow caps each client run at 50.
- There is no provider-supplied AI Overview impression field in this release,
  so XeroFlow does not claim one.
- Phase 1 does not crawl arbitrary URLs, modify the dealer CMS, publish pages,
  inject navigation, or publish to Google Business Profile.
