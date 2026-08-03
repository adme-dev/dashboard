# Automotive Site Intelligence pilot runbook

This runbook activates governed collection for a small client-owned and public
competitor pilot. It does not authorise a production deployment by itself. Keep
`SITE_INTELLIGENCE_ENABLED=false` and `SITE_INTELLIGENCE_AI_ENABLED=false` until
the named owner records a go decision for the relevant gate.

The Pages application must only be deployed through repository scripts. Never
run `wrangler pages deploy` directly and never change the `agency-dashboard`
project name.

## Owners and pilot boundary

Record these before provisioning:

- accountable owner and rollback operator;
- one pilot client ID;
- one client-owned origin and one approved public competitor origin;
- business justification and approver for each origin;
- raw-snapshot retention: 90 days for owned, 30 days for competitor;
- AI Gateway pilot budget: USD 5 per fixed 24-hour window;
- start time for the 24-hour manual observation window.

Do not add authenticated pages, robots-disallowed paths, private portals,
personal profiles, or domains outside the approved automotive comparison set.

### Knox record — 3 August 2026

- Client: Knox GWM Haval (`b6d459d4-aeaa-4c78-9868-e6682a0dbc68`).
- Owned: `https://www.knoxgwmhaval.com.au`, domain
  `6c4ab974-8af3-4ec3-b996-5ea8aa131aee`, active, manual-only, 90-day retention.
- Competitor: `https://www.lilydalegwm.com.au`, domain
  `d58df6dc-a640-4e5d-9428-22c2c4704e0c`, active, manual-only, 30-day retention.
- Four owned crawl attempts exist; zero collected pages. The latest run is
  `failed` with safe category `browser_run`.
- No competitor crawl has passed. Keep the competitor lane untouched until the
  Browser Rendering no-job probe passes and Knox is observed first.

This is a blocked production gate, not a successful pilot smoke. Do not enable
scheduled collection or infer a healthy empty result.

## Gate 1 — verify code and immutable deployment target

From the repository root:

```bash
pnpm deploy:check
pnpm run typecheck
pnpm exec vitest run test/server/api/siteIntelligenceReadiness.test.ts test/server/api/siteIntelligenceCron.test.ts test/app/siteIntelligenceFeaturePage.test.ts
pnpm deploy:workflows:dry-run
```

`deploy:check` must print `agency-dashboard / main`. The known repository-wide
type backlog is acceptable only when no diagnostic names a Site Intelligence
file. Stop on any new feature diagnostic or failed test.

## Gate 2 — provision private storage and lifecycle rules

The binding in `wrangler.toml` expects the private bucket
`agency-site-intelligence`.

```bash
pnpm exec wrangler r2 bucket create agency-site-intelligence
pnpm exec wrangler r2 bucket list
```

Cloudflare R2 buckets are private by default. Do not add a custom domain or
`r2.dev` public access. In R2 → `agency-site-intelligence` → Settings → Object
Lifecycle Rules, add prefix-scoped deletion rules for the two pilot domains:

- `clients/<CLIENT_ID>/domains/<OWNED_DOMAIN_ID>/` — delete after 90 days;
- `clients/<CLIENT_ID>/domains/<COMPETITOR_DOMAIN_ID>/` — delete after 30 days.

The application key shape is
`clients/<client>/domains/<domain>/runs/<run>/<sha256>.md`. Confirm the rules with:

```bash
pnpm exec wrangler r2 bucket lifecycle list agency-site-intelligence
```

Object deletion may occur after the nominal expiry time, so treat lifecycle as
retention enforcement rather than an exact-to-the-minute job. Do not add a bucket
lock that outlives these deletion rules.

## Gate 3 — provision the dedicated Vectorize index

The embedding model is `@cf/baai/bge-base-en-v1.5`, which produces 768 dimensions.
Create the separate index before inserting any vectors, then create every field
used by tenant and evidence filters as a metadata index:

```bash
pnpm exec wrangler vectorize create automotive-site-intelligence --dimensions=768 --metric=cosine
pnpm exec wrangler vectorize create-metadata-index automotive-site-intelligence --property-name=clientId --type=string
pnpm exec wrangler vectorize create-metadata-index automotive-site-intelligence --property-name=domainId --type=string
pnpm exec wrangler vectorize create-metadata-index automotive-site-intelligence --property-name=lane --type=string
pnpm exec wrangler vectorize create-metadata-index automotive-site-intelligence --property-name=pageType --type=string
pnpm exec wrangler vectorize list-metadata-index automotive-site-intelligence
pnpm exec wrangler vectorize info automotive-site-intelligence
```

All four metadata indexes must be visible before AI enrichment is enabled.

## Gate 4 — configure Workflow and Browser Rendering credentials

Create a custom Cloudflare API token scoped to the account with only
`Browser Rendering - Edit`. Do not use a Global API Key. Store the account ID and
token as encrypted `agency-workflows` Worker secrets; never paste them into a
tracked file or command argument:

```bash
pnpm --dir workers/agency-workflows exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --config wrangler.toml
pnpm --dir workers/agency-workflows exec wrangler secret put BROWSER_RENDERING_API_TOKEN --config wrangler.toml
pnpm --dir workers/agency-workflows exec wrangler secret put WORKFLOW_SERVICE_SECRET --config wrangler.toml
pnpm --dir workers/agency-workflows exec wrangler secret put WORKFLOW_CALLBACK_SECRET --config wrangler.toml
```

The two workflow secrets must match the corresponding encrypted Pages secrets.
Do not print or compare their values. Deploy the Workflow worker only through:

```bash
pnpm deploy:workflows
pnpm readiness:agency-workflows
```

The readiness response may expose booleans and workflow names, but never account
IDs, bucket/index names, tokens, or secrets.

The Site Intelligence readiness route performs an authenticated, no-job Browser
Rendering probe against the documented crawl endpoint. It deliberately submits
an empty JSON body: only HTTP 400 with Cloudflare's expected missing/invalid URL
validation error proves the request reached validation. Authentication errors,
unrelated 400s, rate limits, timeouts, network failures, and server responses all
fail readiness closed. The two-second probe never supplies a URL and cannot
start a crawl job.

If readiness reports `browserRenderingApi: false` while the two secrets are
present, rotate `BROWSER_RENDERING_API_TOKEN`. Create a custom Cloudflare API
token scoped to the pilot account with `Browser Rendering - Edit`, avoid an IP
restriction the Worker egress cannot satisfy, then replace the Worker secret
through the interactive command above. Never paste the token into shell history,
tracked environment files, tickets, or logs. A crawl 401 is permanent and must
not be retried until the credential is replaced.

## Gate 5 — verify Pages bindings without deploying

The production Pages configuration must contain bindings named exactly:

- `SITE_INTELLIGENCE_BUCKET` → private R2 bucket;
- `SITE_INTELLIGENCE_VECTORIZE` → dedicated Vectorize index;
- `JOBS_QUEUE` → `agency-jobs` producer;
- `AI` → Workers AI;
- `AGENCY_WORKFLOWS` → `agency-workflows` service binding.

Download the effective Pages configuration into a disposable directory and
inspect binding names only:

```bash
mkdir -p /tmp/xeroflow-site-intelligence-bindings
pnpm exec wrangler pages download config agency-dashboard --cwd /tmp/xeroflow-site-intelligence-bindings --force
rg 'SITE_INTELLIGENCE_BUCKET|SITE_INTELLIGENCE_VECTORIZE|JOBS_QUEUE|AGENCY_WORKFLOWS|binding = "AI"' /tmp/xeroflow-site-intelligence-bindings
pnpm deploy:check
```

Also verify the `jobs-consumer` Worker is attached to `agency-jobs`, its dead
letter queue is `agency-jobs-dlq`, and its consumer status is active. A Pages
producer binding without that standalone consumer is not ready.

## Gate 6 — configure the AI cost boundary

Keep `SITE_INTELLIGENCE_AI_ENABLED=false` for deterministic-only smoke tests.
Before enabling enrichment, route the deployed Groq client through the approved
Cloudflare AI Gateway and create a blocking spend-limit rule:

- budget: USD 5;
- window: fixed 24 hours;
- action: block with HTTP 429;
- scope: the gateway used by the pilot;
- alert owner: the accountable pilot owner.

Confirm `AI_GATEWAY_URL` points to that gateway and the gateway authentication
token is stored as an encrypted Pages secret. If the gateway is shared by other
XeroFlow features and a USD 5 global cap is unacceptable, leave
`SITE_INTELLIGENCE_AI_ENABLED=false` until a dedicated gateway route exists.
Spend-limit enforcement is eventually consistent, so a concurrent burst can
briefly exceed the configured amount; keep the crawl page limits conservative.

## Gate 7 — deploy dormant infrastructure

With both Site Intelligence flags still false:

```bash
pnpm deploy:production
pnpm deploy:workflows
```

Do not deploy `pages-cron` yet. Authenticate as an owner/admin and call:

```text
GET /api/agency/site-intelligence/readiness
```

Expected before activation: every required infrastructure boolean is true and
only `featureEnabled` is false. `browserRenderingApi` means the credential passed
the authenticated no-job probe, not merely that a secret exists. If AI remains
disabled, `aiEnabled` may be false; `workersAi` and `vectorize` must still report
their actual binding state.

## Gate 8 — activate manual-only pilot and smoke both lanes

After explicit go approval, change `SITE_INTELLIGENCE_ENABLED` to `true` in
`wrangler.toml`, obtain review, and use `pnpm deploy:production`. Leave
`SITE_INTELLIGENCE_AI_ENABLED=false` and do not deploy `pages-cron`.

In `/agency/analytics/audiences/intelligence`:

1. Add the client-owned domain with 90-day retention, a 25-page limit, depth 1,
   static-first rendering, manual frequency, and `search` purpose only.
2. Confirm the crawl in the modal. Verify the run becomes completed or a truthful
   partial/blocked state, source links resolve to the approved origin, and no raw
   page body appears in API responses or logs.
3. Add the public competitor domain with 30-day retention, a 25-page limit, depth
   1, static-first rendering, manual frequency, and `search` purpose only.
4. Run it once. Verify no visitor, audience, reach, traffic, spend, conversion, or
   demographic estimates appear. Check before/after evidence and policy-blocked
   diagnostics.
5. Verify R2 keys remain inside the expected tenant/domain/run prefixes and DB
   rows carry the same `client_id` and `domain_id`.

Any cross-tenant row, unexpected origin, access-control workaround, secret/body
log, or unbounded crawl is an immediate no-go and rollback.

## Gate 9 — observe for 24 hours

For 24 hours, leave both domains on manual frequency and review:

- Workflow successes, retries, duration, Browser seconds, and callback errors;
- run counts and repeated `blocked`, `partial`, or `failed` states;
- R2 write failures and object-prefix correctness;
- `agency-jobs` backlog, consumer throughput, retry count, and
  `agency-jobs-dlq` depth;
- enrichment skipped state while the AI flag is false;
- Neon query latency and any tenant-scope or unique-active-run conflicts;
- Browser Run and Workers AI cost against the pilot cap.

Record the evidence and a go/no-go decision. Do not infer healthy collection from
an empty insight feed; check run diagnostics and coverage explicitly.

## Gate 10 — activate scheduled collection

Only after the 24-hour go decision:

1. Change the two pilot domains to daily or weekly frequency and verify
   `next_run_at`.
2. Deploy the updated hourly dispatcher through the repository wrapper:

```bash
pnpm deploy:workers pages-cron
```

3. Confirm the next hourly invocation calls `/api/cron/site-intelligence`, claims
   no more than 20 domains, skips queued/running domains, and records per-domain
   outcomes without aborting the batch.
4. Keep all non-pilot domains paused or manual.

Enable `SITE_INTELLIGENCE_AI_ENABLED=true` only under a separate approved change
after the AI Gateway cap, Vectorize metadata indexes, queue consumer, and review
workflow have all been observed working.

## Pause and rollback

Use the smallest switch that contains the issue:

- one domain: set its status to Paused in the dashboard;
- all new runs: set `SITE_INTELLIGENCE_ENABLED=false` in `wrangler.toml`, review,
  then run `pnpm deploy:production`;
- AI only: set `SITE_INTELLIGENCE_AI_ENABLED=false`, review, then deploy through
  `pnpm deploy:production`;
- scheduled starts: restore the preceding `pages-cron` version through the normal
  Git/repository deployment workflow, or leave the feature flag false;
- queue enrichment: pause the `jobs-consumer` queue consumer in Cloudflare while
  preserving messages for diagnosis.

Do not delete run history during incident containment. Existing Workflow instances
may finish after the feature flag changes; monitor them to a terminal state and
do not retry until the root cause is understood.

## Tenant deletion procedure

Tenant deletion is a coordinated storage, vector, and relational operation:

1. Set every tenant domain to Paused and confirm no queued/running crawl exists.
2. Export the page IDs and `r2_object_key` values for the exact client ID into a
   restricted operator artifact; do not export page bodies.
3. Delete those page IDs from `SITE_INTELLIGENCE_VECTORIZE` using the bound
   deletion utility or an approved one-off Worker.
4. Delete only the R2 prefix `clients/<CLIENT_ID>/` and verify it is empty.
5. In a transaction, delete the tenant's `site_intelligence_domains` rows. Foreign
   keys cascade pages, changes, runs, insights, batches, and audit rows.
6. Verify zero remaining rows for that `client_id` in every
   `site_intelligence_*` table and zero objects/vectors for the exported IDs.
7. Destroy the restricted operator artifact and record the deletion evidence.

Never use an unresolved environment variable, wildcard client ID, repository
root, or bucket-wide delete for tenant erasure.

## Go/no-go record

The pilot is a go only when all required readiness booleans are true, both manual
lane smokes are tenant-correct, the 24-hour window has no critical failures, the
queue/DLQ is stable, spend is below cap, and rollback ownership is confirmed.
Otherwise keep the feature and AI flags false and document the failed gate.

Cloudflare references:

- [R2 bucket creation](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- [R2 object lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Vectorize index and metadata-index creation](https://developers.cloudflare.com/vectorize/get-started/intro/)
- [Browser Run crawl authentication](https://developers.cloudflare.com/browser-run/quick-actions/crawl-endpoint/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/)
