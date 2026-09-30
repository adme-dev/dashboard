# Studio images: staging generation acceptance

This verifies the generation backend and editor transport. The customer image
picker, draft application controls and payment checkout remain separate work.
Customer production and live payments are disabled. Nothing was merged.

## Sources and targets

| Surface | Source | Deployment |
| --- | --- | --- |
| Dashboard preview | `002094ba0c249c2757f83a63159928428b298c28` | `99916cf4.agency-dashboard-6cm.pages.dev` |
| Private control gateway | `002094ba0` | `638f0c12-516e-4a5c-b329-2440d39b4f25` |
| Studio Sandbox routes | `4aec34d` | `1eaac508-22c5-4e7c-88af-430ca6ef27d6` |
| Private image worker | `25e888a` | `2ee09292-0f49-4f00-b511-1ee012497360` |

The branches include current main as fetched before these deployments:
Dashboard `642980e448e9cfb9d898f1282274bd3cd9c246d6`, Studio
`4d4f3ff10da45cf621a1e568c5a20f5f603f58e6`. They also depend on the verified,
unmerged CMS work. The Sandbox deployment retained its verified CMS container;
this stage changed its worker routes only.

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

Complete the plan's image picker, typed hero/section background application,
standalone credit history, Stripe test-mode lifecycle and final release review
before describing the entire feature as complete. Production activation also
requires an operational process for unknown provider outcomes and retention.
