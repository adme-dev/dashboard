# Nearby automotive market pilot runbook

This runbook activates nearby dealership discovery for Knox GWM Haval only. It
does not authorise deployment or wider activation. Keep
`NEARBY_MARKET_DISCOVERY_ENABLED=false` until every gate below passes and the
named owner records a go decision.

## Prerequisite: finish the Knox crawl first

Before provisioning Google access, replace the current Cloudflare credential
with a custom token limited to `Browser Rendering - Edit`; do not use a Global
API Key or a broader token. Run the existing Knox Browser Rendering crawl and
observe a truthful terminal result (`completed`, `partial`, `blocked`, or
`failed`) in its diagnostics. Do not start Lilydale validation or enable portal
nominations while that crawl is non-terminal.

## 1. Provision separate restricted Google credentials

In the Google Cloud project used for XeroFlow, enable billing, Maps JavaScript
API, and Places API (New). Create two unrelated credentials:

1. Browser key: apply Website restrictions and allow only each exact production origin:
   `https://app.xeroflow.io/*` and
   `https://agency-dashboard-6cm.pages.dev/*`, plus an individually approved
   preview origin such as `https://preview.agency-dashboard-6cm.pages.dev/*`.
   Do not use `*.pages.dev`, `*`, localhost, or deployment-ID origins in
   production. Apply API restrictions for Maps JavaScript API only.
2. Server key: apply an API restriction for Places API (New) only and an
   application restriction of **IP addresses** containing only the exact stable
   controlled-egress IPv4 and IPv6 addresses used by the Places request path.
   Record the allowlist in restricted operations evidence; use individual
   `/32` entries for IPv4 addresses rather than a broad network range. Never
   place the key or allowlist in public runtime config, browser code, a tracked
   file, or an operator log.

Cloudflare Pages and Workers default outbound addresses are not assumed to be
stable or exclusively assigned. Route server-side Places calls through an
approved controlled-egress or static-IP proxy before activation, and verify the
observed source addresses match the Google Cloud key allowlist. If an exact,
stable, allowlistable egress path and Google application restriction cannot be
provided, activation is a **hard no-go**: keep
`NEARBY_MARKET_DISCOVERY_ENABLED=false`.

Set conservative per-minute and per-day Places quotas for the Knox pilot. Create
a Google Cloud budget and billing alerts below and at the budget threshold, plus
quota alerts for request volume and errors. Record owners for the budget, quota,
and credential-revocation actions. A budget alert is not a hard spending cap.

## 2. Configure the dormant environment

Set these encrypted Cloudflare Pages variables separately in production and the
approved preview environment; never record their values in this runbook:

- `NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` — origin-restricted browser key;
- `NUXT_PUBLIC_GOOGLE_MAPS_MAP_ID` — production Google Map ID;
- `GOOGLE_PLACES_SERVER_API_KEY` — server-only Places API (New) key;
- `NEARBY_MARKET_DISCOVERY_ENABLED=false` — independent kill switch.

Do not reuse the browser key on the server. Do not change
`SITE_INTELLIGENCE_ENABLED` as part of credential provisioning. Use only
`pnpm deploy:production` or `pnpm deploy:preview`, after `pnpm deploy:check`
passes; never run Wrangler Pages deploy directly.

## 3. Verify readiness while disabled

Authenticate as an owner or admin and call:

```text
GET /api/agency/site-intelligence/readiness
```

`nearbyMarket.enabled` must be `false`; `browserKeyConfigured`,
`mapIdConfigured`, and `serverKeyConfigured` must be `true`; and
`placesReady` must be `false` until the flag is enabled. The response must expose
booleans only, never credential values. The existing crawler `ready` result must
remain unchanged while nearby discovery is disabled.

These readiness booleans do not prove the Google Cloud Console policy. Attach
manual evidence showing the server key's Places API (New) restriction, exact IP
address application allowlist, and a controlled-egress request whose observed
source address matches that allowlist. Missing or mismatched evidence is a hard
no-go.

## 4. Knox-first pilot

After the prerequisite terminal Knox crawl and explicit approval:

1. Confirm the Knox GWM Haval primary trading location and Google Place ID.
2. Re-check the restricted server key and controlled-egress evidence described
   above. Confirm every exact allowlisted address and a matching observed source
   address; otherwise stop with the feature flag false.
3. Enable `NEARBY_MARKET_DISCOVERY_ENABLED=true`, review the change, deploy only
   through the guarded production script, and repeat the readiness call. Require
   all five `nearbyMarket` booleans to be `true`.
4. Search 25 km around Knox. Confirm the UI says results are non-exhaustive and
   limited to up to 20 discovery candidates.
5. Verify Lilydale GWM Haval appears and is labelled already monitored. Stop if
   it appears as a new candidate, creates a duplicate domain, or requests a
   second crawl.
6. Review one unmonitored dealership without approval. Confirm website details
   are fetched only for that selected candidate and no domain or crawl exists.
7. Approve one public competitor using the 25-page, depth-1, automatic-rendering,
   manual-frequency, 30-day raw-retention, `search`-purpose, AI-off preview.
   Confirm exactly one competitor domain and one crawl run, then observe its
   terminal diagnostics and retention evidence.
8. Grant `canNominateCompetitors` to one Knox portal user only. Confirm a single
   nomination reaches the agency queue without website lookup, domain creation,
   or crawl, and requires explicit agency approval before monitoring.

Any cross-client result, duplicate domain/run, raw Google payload, hidden
provider error, missing attribution, unexpected cost, or crawler-policy bypass
is an immediate no-go.

## 5. Monitor before widening

For at least 24 hours, review Google Places request count, billable SKU usage,
quota consumption, budget alerts, latency, timeouts, and redacted provider error
rates. Review Maps JavaScript load errors, nearby-search throttles, candidate
review calls, audit events, crawl run health, Browser Rendering usage, and R2
retention. Confirm no Google key value or raw Places response appears in logs,
analytics, Neon, R2, Vectorize, queues, error responses, or AI inputs.

Do not enable another client until the pilot owner accepts the cost and error
evidence and confirms Lilydale remained linked to its existing monitored domain.

## Three-layer rollback

Use the narrowest layer that contains the incident while preserving decisions,
approved domains, crawl evidence, and audit history:

1. Disable nearby discovery: set `NEARBY_MARKET_DISCOVERY_ENABLED=false`, review,
   and redeploy through the guarded script. Existing crawler readiness and
   evidence remain available.
2. Revoke the Google credentials: revoke both restricted keys if exposure,
   unexpected origin use, or uncontrolled cost is suspected. Keep discovery
   disabled until replacement keys and restrictions pass readiness.
3. Pause site-intelligence crawling: pause the affected domain first, or set
   `SITE_INTELLIGENCE_ENABLED=false` for all new runs if crawl safety is in
   doubt. Monitor already-running workflows to a terminal state; do not delete
   domains, runs, snapshots, decisions, or audits during containment.
