# Knox GWM Search Authority & AI Trust Pilot Acceptance

**Evidence date:** 3 August 2026  
**Client:** Knox GWM Haval  
**Client ID:** `b6d459d4-aeaa-4c78-9868-e6682a0dbc68`  
**Engineering branch:** `agent/knox-pilot-completion-20260803`  
**Pull request:** [#370 — complete Knox Search Authority pilot engineering](https://github.com/adme-dev/dashboard/pull/370)
**Decision:** Engineering implementation is in PR review; core production pilot
is not complete.

## Executive verdict

XeroFlow now has the repeatable product components proposed for the Knox design
client: readiness, Search Console evidence, deterministic trust findings,
source-backed approvals, edge publishing, a bounded GTM menu link, honest
first-party/GA4 attribution, review-only PMax handoff and optional GBP evidence.

The live Knox acceptance cannot truthfully be closed yet. External credentials,
Google property access, a real Sales Manager source, DNS, GTM and GA4 test access
remain required. No live guide, navigation link, test journey or rollback proof
exists on 3 August 2026.

## Production facts

The following was read from Neon on 3 August 2026 without customer PII, raw
queries, crawl bodies or credentials.

| Evidence | Observed state |
| --- | --- |
| Search Authority site | Active; site `a20c9f2b-7f24-4528-9439-709858c5789c` |
| Canonical host | `www.knoxgwmhaval.com.au` |
| Content host | Unset; proposed `learn.knoxgwmhaval.com.au` does not yet qualify as configured proof |
| Owned boundary | Active/manual: `https://www.knoxgwmhaval.com.au`, 90-day retention |
| Competitor boundary | Active/manual: `https://www.lilydalegwm.com.au`, 30-day retention |
| Collection | Four runs, zero successful runs/pages; latest `failed`, category `browser_run` |
| Search Console | 0 connections, 0 property maps, 0 sync runs |
| Opportunities | 0 |
| Trust evidence | 0 findings and 0 mobile performance evidence rows |
| Content | 0 assets, 0 approvals, 0 publications |
| Menu Agent | 0 client configs; no GTM/browser proof |
| Google Business Profile | 0 accounts and 0 performance rows; explicitly unavailable |

## Engineering evidence

| Capability | Evidence |
| --- | --- |
| Readiness | Tenant-scoped safe gate contract and agency card |
| Technical trust | Deterministic status/robots/canonical/sitemap/schema/image/soft-404 findings plus separated lab/field performance |
| Content governance | Consented source record, append-only versions, evidence-bound claims, attributable decisions and self-approval prevention |
| Publisher | Private R2 version objects, manifest-last activation, host allowlist, SSR metadata, sitemap/robots, real 404 and rollback |
| Menu Agent | Public-ID config, selector bounds, duplicate control, 30-second observer, remote kill switch and own-node cleanup |
| Measurement | Version-specific UTM, first-party events, direct/assisted/unknown lead separation, GA4 aggregate label and no Ads mutation |
| GBP | Documented-metric-only Performance API adapter, composite tenant/account integrity, redacted sync state, disabled no-op cron and agency evidence UI |

Migrations `333` through `340` were applied to the configured Neon database. The
pilot regression passed 95 files/491 tests; the repository suite passed 1,443
files and 8,470 tests with 5 files/10 tests skipped. Targeted lint, the 6.27 KiB
publisher typecheck/dry run, the immutable Pages target check, 160-route
production build and 23.44 MiB worker-size guard passed. Repository typecheck
still reports 860 unrelated existing diagnostics and zero pilot-changed file
matches. PR #370 is open for independent review and CI evidence.

## Production acceptance register

| Gate | Status | Owner action | Required proof |
| --- | --- | --- | --- |
| Browser Rendering | Blocked | XeroFlow Cloudflare owner rotates least-privilege token interactively | Authenticated no-job probe reports true |
| Owned crawl | Blocked | Retry Knox after readiness | Terminal run with at least one page and correct R2 tenant/domain prefix |
| Competitor crawl | Blocked | Run Lilydale only after Knox observation | Truthful terminal run with no synthetic audience/performance claims |
| Search Console | Not started | Knox/ADME authorises read-only identity and verified property | Active connection/map and completed 90-day baseline |
| Opportunity | Not started | Agency reviewer accepts one evidence-backed opportunity and links a task | Lifecycle and atomic task link |
| First guide | Not started | Sales Manager source plus independent approver | Immutable approved version with claims/disclaimer |
| Content host | Not started | Authorised DNS operator configures `learn` | TLS-valid host routed only to publisher Worker |
| Live publication | Not started | Agency publishes approved version | Browser/HTTP metadata, schema, sitemap, 404 and manifest evidence |
| Menu | Not started | Authorised GTM publisher installs reviewed bootstrap | Exactly one desktop/mobile link and kill-switch removal proof |
| Measurement | Not started | ADME runs consented test journey and GA4 cross-domain check | View, CTA, test lead and no false self-referral |
| Rollback | Not started | Agency/operator performs and restores one manifest rollback | Before/after version and activation IDs |
| GBP | Unavailable | Google project owner proves API quota; Knox connects location | Dated metrics and separate approved provider post, or continued deferral |

## Release and rollback decision

The PR may merge after code review and green checks because every new write or
public surface remains tenant-scoped and fail-closed. Merging does not authorise
publication or make the core pilot complete.

Release order:

1. Deploy Pages through `pnpm deploy:production` after `pnpm deploy:check`.
2. Deploy `pages-cron` through its named Worker wrapper; GBP remains a no-op.
3. Deploy `search-authority-publisher` through its fail-closed wrapper.
4. Complete Browser Rendering and Search Console gates.
5. Obtain the source/approval, DNS, GTM and GA4 operator actions.
6. Publish, measure, roll back, restore and attach the production evidence.

Rollback uses feature flags for the agency/portal control plane, a manifest
pointer for guides, the Menu Agent config kill switch for navigation, and
existing tracking-site activation for first-party measurement. Additive evidence
tables remain in place.

## First monthly content question

Candidate for the Sales Manager call, subject to Search Console evidence:

> What should a local buyer verify before choosing a Cannon Alpha for regular
> towing, and which capability figures or conditions must we confirm from the
> current manufacturer specification before publishing?

This is a question, not an approved claim. Vehicle capability, pricing,
availability, finance and warranty details must be verified against current
manufacturer/dealership sources at approval time.

## External references

- [Google Business Profile Performance API](https://developers.google.com/my-business/reference/performance/rpc)
- [Google `fetchMultiDailyMetricsTimeSeries` REST method](https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries)
- [Cloudflare R2 custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/#custom-domains)
- [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
