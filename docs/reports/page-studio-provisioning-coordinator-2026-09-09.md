# Page Studio shared provisioning handoff

Dashboard now converts its saved setup proposal into the shared coordinator's
contract. `starterVersion` becomes `templateId`, `modules` becomes
`enabledModules`, and the reviewed pages/collections are retained. Unknown
templates fail with 422; non-limousine industries no longer fall back to limousine.
All scope comes from the authenticated site lookup.

Provisioning requires fresh editor membership, an accepted proposal revision,
an active/trial entitlement with portal creation enabled and current effective
dates, a draft/active site, and sufficient page allowance. Job reads now supply
the full scope to the private service as well as checking its response scope.

Preview alone binds `PAGE_STUDIO_PROVISIONER` to the independent
`xeroflow-provisioning-staging` Worker. The coordinator stores jobs in dedicated
Cloudflare D1 `f19256aa-ddb6-47fe-b7e9-7287d0be6a19`; customer content databases
are not prerequisites. It has no public route, cron or resource executor enabled.
This release can queue a setup request, but cannot yet automatically allocate
and seed a customer's site and database.

Verification: Page Studio suites passed 289 tests with one skipped; both preview
binding guard suites passed 11 tests. Changed-file ESLint, deploy target check and
the full production build passed (raw Worker 25,059,666 bytes, 409,262 remaining).
The endpoint's exact extracted SQL passed read-only EXPLAIN against isolated Neon
branch `br-long-mountain-a4f73v10`, confirming the entitlement columns and joins
against the actual schema. Endpoint denial tests mock query results; they do not
by themselves prove live entitlement revocation or the full customer journey.

The retained read-only `page-studio-provisioning-entitlement-proof.sql` also ran
against that isolated branch. All 13 synthetic cases matched: active/trial
allowed; disabled portal, future/expired/suspended entitlement, inactive site,
viewer membership, foreign entitlement tenant/client, wrong entitlement ID and
insufficient/zero page allowance denied. The inner SQL is extracted from the
endpoint. No persisted rows were changed.

The Foundation companion's remote smoke imports this real proposal generator
and adapter. Release results are retained in its
`docs/research/2026-09-09-provisioning-coordinator.md`.

Remaining: resource executor with ownership/idempotency, execution-time entitlement
checks, interrupted creation recovery, billing reconciliation, and authenticated
customer setup acceptance. The current handoff still derives business ID from
client ID and targets staging. Production bindings and public marketing claims
are unchanged until the complete customer workflow is verified. Removing the
preview binding stops new dispatches; preserve queued jobs for investigation.
