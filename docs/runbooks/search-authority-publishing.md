# Search Authority Publishing Runbook

## Purpose and boundary

Publish a human-approved Search Authority guide on a client-owned subdomain
without Dealer Studio or CMS credentials. XeroFlow renders the immutable guide,
stores versioned objects in private R2, activates a small manifest, serves the
approved host through a dedicated Cloudflare Worker, and offers a bounded GTM
Menu Agent that adds one navigation link.

GTM cannot create the indexable page, set canonical metadata, inject vehicle
schema, or replace the dealership website. The content host is the indexable
surface; GTM is discovery only.

## Production targets

- Pages project: `agency-dashboard`, deployed only with `pnpm deploy:production`.
- Publisher Worker: `search-authority-publisher`, deployed only with
  `pnpm deploy:search-authority-publisher`.
- R2 bucket: `agency-search-authority-publications`, private.
- Knox canonical host: `www.knoxgwmhaval.com.au`.
- Knox proposed content host: `learn.knoxgwmhaval.com.au`.
- Menu bootstrap: `https://app.xeroflow.io/search-authority/menu-agent.v1.js`.

The publisher deploy wrapper rejects alternate Worker names, entrypoints or R2
targets. Never run a direct `wrangler deploy` for this Worker.

## Gate 1 — verify the release

From the reviewed branch:

```bash
pnpm run typecheck
pnpm deploy:check
pnpm deploy:search-authority-publisher:dry-run
```

Run the complete Search Authority focused suite from the pilot tracker. Stop on
any changed-file type error, failed publisher test, target mismatch or generated
Worker type failure.

## Gate 2 — provision storage and Worker routing

Create the private production and preview buckets named in
`workers/search-authority-publisher/wrangler.jsonc`. Do not attach `r2.dev` or a
public bucket domain. Deploy through the named wrapper, then verify:

```text
GET /healthz → 200 {"ok":true}
unknown host/path → real 404
POST any path → 405 with Allow: GET, HEAD
```

Only the approved custom hostname may route to this Worker. Validate the custom
hostname mapping before putting a content hostname into the XeroFlow site row.

Cloudflare for SaaS on the `xeroflow.io` zone uses `publish.xeroflow.io` (a
proxied placeholder A record) as the fallback origin, with the Worker route
`publish.xeroflow.io/*` bound to the publisher. **Worker routes match the
request hostname, not the fallback origin**, so every client content hostname
also needs its own route on the `xeroflow.io` zone, e.g.
`learn.knoxgwmhaval.com.au/*` → `search-authority-publisher`. Without it
Cloudflare forwards the request to the placeholder origin and the client sees a
522. Add the route in the same step as the custom hostname (verified on
`learn.adme.net.au`, 2026-08-26).

## Gate 3 — configure DNS and the site

The authorised Knox DNS operator creates only the issued `learn` record. Verify
CAA compatibility, certificate issuance, TLS and that the host reaches the
publisher Worker. Do not proxy the apex or main dealership origin.

In Agency → Search Authority → Connections, set the content hostname to
`learn.knoxgwmhaval.com.au` only after routing is verified. A configured value is
not publication proof.

### Owner accounts

Owners always run under the God mode execution ledger. Every Search Authority
write route is registered as a mutation family in
`server/utils/searchAuthority/godModeMutations.ts` and the UI sends an
`Idempotency-Key` per attempt. A 503 "God mode mutation coordination required"
on any Search Authority write means a new route was added without a family —
register it there before shipping.

### Same-host mode (optional, per site)

Where a client's web platform can rewrite one path, guides can live on their own
host (`www.client.com.au/guides/…`) and are indexed there. In Connections set
**Publishing mode → Same host**; the card shows the rewrite for their developer:

```js
// next.config.js (or the platform's proxy-path setting)
{ source: '/guides',        destination: 'https://publish.xeroflowpages.com/s/<public_id>/guides' },
{ source: '/guides/:path*', destination: 'https://publish.xeroflowpages.com/s/<public_id>/guides/:path*' }
```

Click **Verify rewrite**: it fetches `https://<canonical>/guides/healthz` and
requires the publisher's `x-xeroflow-publisher: <public_id>` header. Until that
passes, nothing is published on the client host. No custom hostname, Worker route
or DNS change is needed in same-host mode. The sitemap is served at
`/guides/sitemap.xml`; register it against the client's Search Console domain
property. Their own `robots.txt` and `sitemap.xml` are never touched.

### Guides hub and multiple guides

Every publish carries the host's other guides forward, so a site can hold many.
`/guides` is the server-rendered hub (subdomain root redirects to it; on a client
host `/` stays theirs). `/sitemap.xml` and `/guides/sitemap.xml` list all guides.

## Gate 4 — create and approve content

1. Record the consented Sales Manager interview and source summary.
2. Create the guide slug, title and topic.
3. Create an immutable version with body, excerpt, disclaimer, schema type and
   every material claim linked to a sales interview, manufacturer source or
   provider evidence.
4. Submit the current version.
5. Have a different authorised actor approve it with a rationale.

No generic scaled blog copy, invented vehicle specification, silent claim edit,
author self-approval or approval of a superseded version is permitted.

## Gate 5 — publish and validate

Publish from the content library. XeroFlow writes hash-verified version objects
first and the current manifest last. Validate the returned guide URL plus:

- server-rendered title, description, canonical and Open Graph metadata;
- valid Article or FAQPage JSON-LD appropriate to the approved content;
- escaped source labels, claims, disclaimer and body content;
- `/robots.txt` and `/sitemap.xml` referencing the same host;
- security headers, HEAD behavior, ETag/304 behavior and a real unknown-path 404;
- CTA destination on the canonical dealership host with a
  `publication_<uuid>` UTM marker;
- first-party tracking only when a matching active XeroFlow tracking site was
  already allowlisted for the content origin.

Do not equate a successful API response with public acceptance; capture a real
browser and HTTP proof.

## Gate 6 — activate the Menu Agent

In Search Authority, configure the approved label, guide href, bounded desktop
and mobile selectors, and insertion position. Copy the generated bootstrap into
the authorised Knox GTM container and publish through the normal GTM approval.

Battle-test initial load, desktop, mobile, client-side navigation and a Next.js
rerender. Require exactly one link per actual menu. Shared responsive DOM roots
must deduplicate. Confirm the Agent observes for no more than 30 seconds and
never removes or mutates an origin-owned node.

Disable the XeroFlow menu config and confirm only Agent-owned links disappear.
A heartbeat means the script requested config; it is not DOM or visibility
proof.

### Front-page feature posts (optional)

The same GTM tag can insert one bounded block of cards linking to the newest
published guides. In the Menu Agent card enable **Front-page feature posts**, set
the heading, count (1–3), placement and a bounded target selector on the client's
home page. The block uses `textContent` only, shares the menu kill switch, and is
removed when disabled. Google treats the cards as ordinary internal links — they
are teasers, not indexable pages, and must not be sold as such.

## Gate 7 — verify measurement

Run a consented test journey: guide view → CTA → dealership site → test lead.
Confirm:

- guide views and CTA handoffs are deduplicated by event ID;
- the exact publication marker survives the CTA and test lead;
- direct and assisted lead counts require explicit retained markers;
- unmatched leads remain unknown;
- GA4 landing-page evidence is labelled aggregate and unavailable is not zero;
- the dealership and content subdomain do not create false self-referrals;
- the PMax output is a review-only brief and no Google Ads mutation occurs.

## Gate 8 — prove rollback

Select a prior published version, provide a rationale and roll back. The Worker
switches the small manifest pointer; immutable objects are not rewritten. Verify
the prior HTML is public, then restore the desired version through the same
audited flow. Each restore creates a new activation record so historical event
attribution continues to use the version active at that time.

If the dashboard is unavailable, an authorised Cloudflare operator may restore
the previously recorded manifest object at
`hosts/<hostname>/manifests/current.json`. Record the exact target manifest and
time, then reconcile the audit trail before resuming publication.

## Emergency containment

- Content: restore the last good manifest; do not delete immutable versions.
- Menu: disable its XeroFlow config; if necessary, roll back the GTM container.
- Measurement: deactivate the matching tracking site; do not relabel existing
  unlinked leads.
- Publisher: remove only the affected custom hostname route after preserving
  the last manifest evidence.

Stop for cross-tenant data, unexpected host routing, XSS, a missing approval,
arbitrary DOM mutation, a secret/provider body in logs, or attributed outcomes
without an explicit marker.
