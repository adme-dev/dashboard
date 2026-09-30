# Studio images and credits: staging acceptance

This records real image generation, customer UI, credit accounting and scoped
staging integration. Stripe test-mode checkout is implemented and locally
verified; hosted payment acceptance requires external test configuration.
Customer production and live payments are disabled. Nothing was merged.

## Sources and targets

| Surface | Source | Deployment |
| --- | --- | --- |
| Dashboard preview | `f5aead325` | `87cb9bae.agency-dashboard-6cm.pages.dev` |
| Private control gateway | `002094ba0` | `638f0c12-516e-4a5c-b329-2440d39b4f25` |
| Studio Sandbox and editor | `f97ee8c` (editor source `d2a3707`) | `45d8f500-871d-4a14-ab70-f1835182fcfe` |
| Delivery worker | `f97ee8c` | `c34f5ea6-f78f-441d-ac04-64e47df35fbe` |
| Private test-payment worker | `56a9993fe` | `04727aed-d511-40c6-a417-a3c7b930a1af` |
| Private image worker | `25e888a` | `2ee09292-0f49-4f00-b511-1ee012497360` |

The branches include current main as fetched before these deployments:
Dashboard `642980e448e9cfb9d898f1282274bd3cd9c246d6`, Studio
`4d4f3ff10da45cf621a1e568c5a20f5f603f58e6`. They also depend on the verified,
unmerged CMS work (Dashboard #599 / Studio #108). The new private editor image
is pinned by SHA-256 `00fa1685c94adc23a9f46cd3d72693de416d2f58d0dfe36bda1013446a3c7365`.
The served overlay returned 2,538,625 bytes with SHA-256
`b4072365eba95d58c3a5ad1e16c18bb804a5b01b1e97e6763531dfe7fa5469f0`, matching the verified build.
The new immutable renderer is `astro_runtime_55f4c2813577ad0dedcfce08ac60edb4843e5d3604b9bdf9349b708210955a06`
(Worker version `0c67408d-5e1e-43ac-961c-5b8085f23a0e`). Prior CMS renderers remain retained.

The named Gateway is `studio-images-staging`, in account
`a5b299b3ad15c1b5b895dc66f9357b17`. The worker exposes no public HTTP generation
endpoint. Its Queue, dead-letter Queue, R2 bucket and control service are staging
resources. Its recovery inventory contains only the two existing synthetic sites.
The checked-in empty recovery inventory intentionally disables generation.

## Real model and credit results

Each synthetic customer received an idempotent 100-credit test grant. Each
generation was quoted at 10 credits. These grants involved no payment provider.

| Request | Model | Result |
| --- | --- | --- |
| `c451beaa-1d8e-49a5-b5ba-82257fef6585` | FLUX.1 Schnell | Saved 1024×1024 PNG, 838,387 bytes; settled 10 credits |
| `15ee5f1e-e222-4056-b94c-e4141eee1824` | SDXL | Original 60-second attempt uncertain; 10 credits remain reserved |
| `5817f4e3-bcd2-43b1-91fa-6b2a45a5b054` | SDXL | New explicit intent saved 1024×576 PNG, 965,448 bytes; settled 10 credits |
| `1eb2e88f-e2aa-4560-9b38-42414c9d5b8d` | FLUX.1 Schnell | Second customer saved PNG, 761,592 bytes; settled 10 credits |

SDXL's successful Gateway request took 85,444 ms. Its deadline is now 180 seconds
at the Gateway and 185 seconds locally; FLUX remains 60/65 seconds. Both are
bounded below the native five-minute stale-dispatch threshold. The unknown
request was never redispatched or refunded. It must retain its reservation until
immutable evidence supports an operator resolution. A later successful request
does not establish the earlier request's outcome.

Resulting balances: first customer 80 total, 10 reserved, 70 available; second
customer 90 total and available. Replaying the successful first job returns the
same job and does not produce another charge.

## Gateway attribution and privacy

The successful diagnostic requests have Gateway entries
`01M3QVXRD95SMMZG1W8HV3MHWP` (SDXL) and
`01M3QW0NV0CJ717G60FZRZ5A48` (FLUX). Each has the correct tenant, customer, site,
job and price-version metadata, provider `workers-ai` and HTTP 200. No fallback
or automatic retry is enabled.

Both entries' request and response payload endpoints returned Cloudflare error
7002, body not available. This verifies the configured metadata-only logging:
`collectLog: true` with `cf-aig-collect-log-payload: false`.
See [Cloudflare logging](https://developers.cloudflare.com/ai-gateway/observability/logging/)
and [request handling](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/).

## Owned assets and isolation

Authenticated native launch and editor cookie exchange succeeded for both
synthetic customers. On each exact scoped editor hostname:

- Catalog and library returned HTTP 200 and the matching site scope.
- Every successful generated asset returned HTTP 200 with the expected byte
  count and SHA-256. The two primary images were visually inspected.
- Fetching the other customer's generated asset returned HTTP 404.
- Cross-origin image API requests returned HTTP 403.

Native cross-customer site, job and quote requests returned HTTP 404. Private
worker commands require both control authentication and a separate worker
credential; the editor transport cannot supply that credential.

Raw outputs and private claim/receipt records stay outside the public asset
namespace. Full decode/re-encode, dimension/byte limits and a SHA-256 path precede
settlement. Reconciliation recovers stored output and settlement, never another
provider invocation.

## Evidence and remaining work

Machine-readable receipts and command logs are retained locally under
`/private/tmp/studio-image-credits-20260930/`, including
`gateway-metadata-receipt.json`, `editor-acceptance.json`,
`isolation-receipt.json` and `hosted-receipts.json`. Credential files in that
directory are private and must not be attached to a PR.

Full Studio verification passed: build (28 tasks), typecheck (44 tasks), tests
(40 tasks plus security and action-runtime suites), and lint (1,462 files). The
native image/private-control regression passed 109 tests across nine files.
Worker tests include single dispatch, uncertain outcomes, storage recovery and
lost callbacks.

The image picker, hero/section backgrounds, standalone credits page and private
test-payment worker are deployed to isolated staging. Top-ups correctly show
unavailable without Stripe test credentials and versioned packs. Customer
activation still requires commercial model prices, payment configuration, a
retention/cleanup policy and an operational process for unknown provider outcomes.
No live payment or production admission is enabled.

## Customer UI verification (Task4)

The editor now separates reviewing a price, paid generation and using a saved
image in the draft. Saved library reuse does not invoke generation. Featured
images require alt text; decorative hero/section backgrounds use empty alt text
and the same focal-position renderer for preview and publication. Stale target
selection is rejected and the draft change is one undoable operation.

The standalone `/studio/credits` page shows available/reserved balances and
paginated activity. The separate billing implementation enables test checkout
only for billing owners when explicit test configuration is available. The Nuxt UI browser harness runs with synthetic transport:
`node scripts/verify-image-credits-browser.mjs`. Light/dark desktop/mobile
screenshots were inspected; exact history cursors, customer switching and access
failures passed with zero browser errors. Six component tests passed. Global
Dashboard typecheck remains at 919 pre-existing diagnostics, zero new.

Studio full build (28 tasks), typecheck (44 tasks), test (40 tasks) tasks plus security (36) and action-runtime (48)
passed. Full lint passed; the final browser-only test addition also passed scoped
Biome and overlay typecheck. Six real Chrome image-dialog cases plus nine
existing design cases passed. Twenty image unit cases and 298 site-kit cases
passed, including a regression for section background class separation.

These local checks are complemented by the hosted acceptance below. Hosted
Stripe payment acceptance remains unverified.

## Final hosted customer workflow

Actual Chrome checks used 1440px desktop and 390px mobile viewports. Both scopes
showed the two configured models and their own saved library. The primary hero
received the SDXL asset, meaningful alt text and top focal alignment. The second
hero received its own FLUX image as a decorative, centred background. Both
reported **Saved**. Native comparisons against the prior published staging
versions contained exactly these image properties; CMS pins, schemas, forms and
page text were unchanged. Reopening restored the hero and the same saved library,
including the original uncertain request and its reserved balance.

Standalone `/studio/credits` showed 70 available / 10 reserved for the primary
customer and 90 / 0 for the second, with separate activity. Mobile had no
horizontal overflow. My sites and the existing agency QR Codes page loaded.
Customer top-ups displayed the explicit unavailable state. No generation or
payment was submitted during saved-library reuse.

Native review and approval preceded both runtime publications:

| Scope | Version | Final release | Pointer epoch |
| --- | --- | --- | --- |
| Primary synthetic customer | `251a0c36-967a-460c-873c-cd7e8bed292f` | `7b27d729-38cd-4e76-94ca-3e618c83ecab` | 20 |
| Second synthetic customer | `c7637841-c563-4c62-a14d-5e4b34465c27` | `fef92462-d657-4eb5-95fe-7c8e52f7bc9c` | 9 |

Both pin the new `55f4c2…` renderer. Dashboard source `f5aead325` deployed as
`87cb9bae-3f85-4322-8c2e-b11e3b027fdc`; later documentation commits do not change
its executable source. The generated Wrangler configuration was checked for the
new renderer and exactly two additional synthetic admissions. Production
configuration was compared unchanged. The prior E2 renderer remains available.

Cold publication initially exhausted the old ten-second shared retention budget
(recovery 4.0s, image content 4.0s, seal interrupted after 1.9s). No failed request
activated a partial release. A real-Postgres regression reproduced this and now
allows a 15s preparation while rejecting 30.001s; authority is rechecked after
storage, and public projection keeps its ten-second deadline. The final pair of
publications succeeded without retry on the corrected deployment. The original
primary retry used the same immutable request identity and activated only once.

Final image/payment/worker/UI regression: 204 passed across 25 files. Additional
publication/CMS regression: 170 passed, one skipped. Scoped lint passed. Dashboard
full typecheck matched the existing baseline exactly (919 diagnostic lines, 894
unique; zero new). Full build and unchanged raw/gzip release budgets passed.
The fresh final reviewer found one important stale-pack checkout issue; the fix
clears only a definitive pre-intent price-change rejection and requires fresh
selection. Unknown outcomes keep their original intent. Its regression was
observed failing before the fix and passing afterward. Model naming was corrected
to Stable Diffusion XL; no other important review finding remains.

Raw command logs, screenshots and private fixture receipts remain in the local
evidence directory. Do not attach its credentials to PRs. Before customer
activation, supply Stripe test configuration and complete hosted payment tests,
then separately approve commercial pricing, retention/cleanup and live rollout.

Final public GET and HEAD were HTTP 200 with private/no-store on both sites;
retained image bytes matched SHA-256 and length (965,448 / 761,592). Current CMS
titles remained visible, private descriptions and cross-customer markers absent.
Existing JS/CSS assets returned 200. Native record heads remained primary version 5
and second version 6, with the same stored schema references and usage counts 36/15.
These results are retained in `published-background-evidence.json`,
`after-background-corrected.json` and the public asset receipts.

## Visual regression and review handoff

The final published mobile screenshot exposed a missing stylesheet for plain
hero/section backgrounds. The shared document renderer had emitted the decorative
image but included its positioning CSS only for showcase content. Commit
`d2a3707` adds background properties to that condition. Rendered-head/body tests
for both plain layouts failed before the fix and pass with absolute positioning,
cover sizing and a relative container. Site-kit: 300, Astro runtime: 65 and deployment
configuration: 7 tests pass; typecheck and Biome pass.

The final published background was inspected visually and in computed styles:
absolute positioning, cover sizing, centre focal point and empty alt text. The
editor container rollout completed at application version 35 with the new digest;
the served overlay matches the locally verified 29-file image. Previous `a8ea2d`
and E2 generations remain retained, with their matching private credentials.

Reviewable stacked PRs: [Dashboard #600](https://github.com/adme-dev/dashboard/pull/600)
and [Studio #109](https://github.com/adme-dev/xeroflow-page-studio/pull/109). They
depend on the original CMS PRs #599/#108. Retarget after those dependencies merge.
Owned feature worktrees remain while review is open; no obsolete branch was
merged or released and unrelated root-worktree changes were left untouched.
