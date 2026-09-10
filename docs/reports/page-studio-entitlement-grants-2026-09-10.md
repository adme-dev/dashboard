# Website access grants

The Website Builder could only list entitlements, leaving a real client without
a normal administration path to create its first website. The subscriptions
screen now offers a permission-gated Grant website access dialog. Operators
select the client, plan reference, trial/active status, start/end dates, modules,
portal creation setting and all seven stored usage limits, with an audit reason.
Defaults match existing database allowances; the plan and expiry are explicit.
This configures manual access and does not create a paid subscription or charge.

## Contract and review

POST `/api/agency/page-studio/subscriptions` derives actor and selected tenant
from `requireAgencyPageStudioAccess(PAGE_STUDIO_SUBSCRIPTIONS)`. Strict validation
rejects forged extra scope, invalid counters/modules, duplicate modules and
unbounded trials. Dates normalize to UTC. Business content is required. SQL is
parameterized and every grant locks the active client before replay or mutation.

The existing `page_studio_entitlements` and append-only
`billing_entitlement_audit` tables are written in one transaction. Matching
request/actor/tenant/client retries return the original scoped receipt, including
after expiry; changed requests or actors fail. A competing request cannot replace
an existing active, trial, expired, suspended or past-due entitlement. No new
migration, role bypass, customer membership or runtime activation was introduced.
The route inventory adds one reviewed mutation while retaining God-mode denial.

Browser inputs use labelled Nuxt UI controls, container-responsive grids and
calendar popovers. No select uses an empty-string sentinel. Dates and limits
remain visible before submission; retry identity survives a lost response and
changes when terms change. Read-only/revoked permissions prevent submission.
The starting calendar cannot be cleared. Server permission and scope remain
authoritative. No arbitrary code, URL fetch or secret is accepted by this path.

## Verification

- 17 grant-store tests; two authenticated endpoint cases; five mounted Vue cases.
- Four real PostgreSQL cases run in a unique disposable local schema, using the
  entitlement and audit DDL extracted from existing migrations. Matching races
  produce one grant/audit; competing grants preserve the winner; other tenants
  cannot replay the receipt; failed audit insertion rolls back the entitlement.
- Full suite: **13,257 passed / 48 skipped**, 2,026 passing files. The first run
  caught the expected route-inventory count change; the reviewed inventory was
  updated and the entire suite passed again. PostgreSQL initially rejected an
  incorrect local role; the initialized `postgres` role was verified before retry.
- Nuxt typecheck: existing **927** global errors, none in changed files. Changed
  code compiles in actual Nuxt and changed-file ESLint passes.
- Actual Nuxt UI, connected browser, synthetic local responses only:

| Viewport | Horizontal field overflow | Scroll position / content height | Save button bottom |
|---|---|---|---|
| 390 x 844 | 0 | 934 / 1778 | 769.15 |
| 1024 x 768 | 0 | 550 / 1318 | 689.45 |

Both save buttons are reachable. Visual inspection confirms one field column on
mobile and two columns where the form container permits. Evidence:
`/private/tmp/page-studio-grant-browser-measurement.json`; screenshot
`/var/folders/89/3w6yy2712qqc4x5cjv45b6_00000gn/T/kimi-webbridge-screenshots/screenshot_20260910_145953.657.png`.
The local harness at `/private/tmp/page-studio-grant-browser` imports the actual
components and uses endpoints that reject saves; no customer grant was created.
The screenshot helper was adapted locally because the daemon now returns a file
path rather than base64. This did not change application code.

## Releases and remaining client work

Agency site-creation source `39c575a112c181ae95d9c11d479585b43e56c5a0` passed
guarded run `34437402955`. Independent Cloudflare readback confirms preview
`15d9811f-3ed2-4d6a-a319-f2ae6d0e5f06`, project `agency-dashboard`, exact clean
source, successful deploy and stable preview alias. Its immutable URL is
`https://15d9811f.agency-dashboard-6cm.pages.dev`. The preview requires a separate
sign-in. Kimi is connected; the Chrome DevTools alternative could not connect
because its profile is already in use. Authenticated preview acceptance remains
open; do not bypass login or present local UI tests as a production flow.

Foundation documentation source `7660a14fcdb072c34963b7a0f0260972127ba5b7`
passes CI `34437230059` on Linux and Windows, plus branch policy/secret scan.
This supersedes the prior Windows timeout as the current CI status.

The access-grant feature itself still needs its guarded build/deploy and live
acceptance. Fantasy Limo client `0595e5aa-59b4-461e-b8ff-7fe529ca9667` still has
no grant, saved website or review link. Portal owner/contact, client content and
accepted commercial terms remain unconfirmed. Complete its internal development
access through this normal admin path, then save the draft and proceed to scoped
content, reviewed preview and stored booking-enquiry acceptance. Grant lifecycle
editing/cancellation, renewals and provider billing remain separate open work.

Production promotion must preserve the actual release branch:
PR 521 merged to `release/send-scan-foundation`; `origin/main` remains the older
September 4 baseline. The Page Studio branch must be integrated/reviewed against
the production release source before promotion, retaining deployment target
guards and unrelated production changes.
