# DriveAgent News social recovery — 12 October 2026

## Scope and cause

Client `bc8a15a8-f523-4a75-a8f4-a501649bb71d` uses Facebook Page `1391237540730945` through XeroFlow. The Page connection and published-news source remain valid. Previously deployed October fixes were absent from current main; the dispatcher compared a UUID client field with a text parameter, and current source lacked the deployed news-replenishment engine. Ten scheduled posts had no publication attempts. The metrics Worker was missing and obsolete Graph insight names produced failures that reporting represented as zero.

Recovered only the needed publishing changes onto freshly fetched main `124fa5bb6ac8a40c8010a7af20dbecac136aa20c`; unrelated original checkout changes were preserved. Migration 449 reconciles existing rules and import receipts without deleting them.

## Live recovery before release

- Held the ten overdue, unattempted News posts as drafts, clearing schedule and approval. Each carries `metadata.recoveryHold` with its prior schedule and operation `driveagent-social-recovery-20261012`.
- Set the existing News rule to `review`. Fresh published stories become drafts; automatic publishing remains an explicit manager policy choice.
- Applied migration 449 transactionally.
- Retained all published history and existing posting slots.

## Metrics behavior

Graph v25 live probes confirmed Page follower fields, `page_views_total`, post reaction/comment summaries and `post_clicks`. Empty insights are unavailable, not zero. Retired impressions/reach/video metrics are not relabelled as media views. Nulls survive database writes, aggregate totals, comparisons, UI, PDFs and AI summaries. Verified zeroes remain zero. Failed/partial collection makes the Worker fail visibly.

Deploy `social-metrics-cron` against `https://agency-dashboard-6cm.pages.dev`, with the matching Pages `CRON_SECRET`, once the app release is verified. Deploy the recovered dispatcher afterward. Validate the secret through the authenticated metrics endpoint without printing it. Do not trigger bulk publishing for a smoke test.

## Sponsor renewal

Delivery stopped on 9 October for Northern Motor Group, Northern Kia and Northern Nissan. Their active status did not override expired end dates. Following the owner's extension request, renewed the complimentary campaigns for 30 days ending **11 November 2026 at 18:51:57 AEDT**. No invoices, payments, invitations or messages were created.

| Sponsor | Expired campaign | Renewal |
|---|---|---|
| Northern Motor Group | `5da48902-e0a7-4247-986b-501ce9ca5af8` | `d5e9f4fd-0a22-4936-a7ec-3e21c59fd78b` |
| Northern Kia | `a59db0ed-e4b3-433b-9d62-d621cbeed2fe` | `8be4d663-94a2-4bdc-9362-eeec1ba966f8` |
| Northern Nissan | `f1fe2ae6-6f20-4af8-b77b-5e8085c73b46` | `501fc41e-abd8-4cb8-ab00-a2eb8a9abd63` |

Each renewal has nine immutable approved creative records referencing the same approved R2 bytes, with new dates and campaign UTM values. All 27 R2 files passed image validation and matched original dimensions/byte counts. Placement/device coverage, destinations, advertiser state, non-exclusive priority 100 and weight 1 were preserved. Explicit approval audit entries record provenance. Old campaigns are completed; their metrics remain intact. DriveAgent's own promotion and the superseded exclusive campaign were left unchanged. The public homepage visibly served all three renewed sponsors after activation.

## Website measurement

The separate website change adds an independent Meta permission and dormant News-only Pixel configuration, with GPC/DNT and private/sensitive-route exclusions. Existing analytics permission is not marketing permission. A dedicated News dataset is required; another customer's Pixel must never be reused. The Meta create form is prepared in the ADME Advertising - Additional portfolio, pending the owner's acceptance of Meta Business Tools Terms. No dataset, token or CAPI activation is claimed yet. Newsletter events are not mapped to sales leads.

## Verification and release record

Before release: 942 Dashboard tests across 141 files pass, including social and deployment guards. Independent review confirmed nullable reporting, source-replenishment controls and consent boundaries. Website tests: 2,621 pass and lint passes. Production build, live app smoke, source commit and deployment IDs are recorded after release below.

## Rollback

Pause the News rule before rolling back publishing; preserve drafts and import receipts. Disable the metrics schedule if collection fails, retaining null semantics. Sponsor renewal can be paused by normal lifecycle transitions; do not delete original history or shared R2 assets. Pixel configuration stays unset until the dedicated dataset is verified.
