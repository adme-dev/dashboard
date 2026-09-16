# Page Studio version review — recovered FR04 slice

Scope: extend the existing Reviews screen and immutable version endpoints. Agency
reviewers inspect the selected checkpoint against one explicitly named active
production release. Select another hostname when releases differ. No live release
is represented by an empty comparison baseline; unavailable storage is an error.

- Read-only, uncached comparison endpoint requires PAGE_STUDIO_APPROVE and scopes
  every version/checkpoint/release join to tenant, client and site. Load both R2
  envelopes through existing digest-verifying bounded loader. Re-read pointers
  after loading; return 409 on concurrent changes.
- Compare content in the client, matching arrays by stable IDs, preserving reorder
  differences, showing page/component/form/site paths and before/after text.
  Explicitly bound results; an incomplete comparison cannot enable a decision.
- Nuxt UI slideover shows author, version identity, named live hostname and digest,
  followed by a readable change list. Use existing semantic colours and Geist;
  plain before/after columns stack on small containers. No new visual theme.
- Decisions use existing guarded review POST, with a fresh comparison before
  mutation and unchanged immutable candidate/active baseline. Historical versions
  remain inspectable; only the current submitted checkpoint may be decided.
- Narrow tests: ID matching/reorder, malformed/missing objects, site isolation,
  pointer races, error/redirection states, escaping authored HTML and decision
  binding. Then full tests/build/type baseline and live synthetic acceptance.

No database migration or new provider. Keep Cloudflare raw/gzip limits unchanged;
if a build exceeds them, resolve the source footprint before release.

## Private inspection service

The Pages build exceeded its immutable raw-byte budget. Launch-readiness and
comparison and review-list reads now run in the existing private Page Studio management Worker,
using cache-disabled Hyperdrive and environment-specific checkpoint R2 bindings.
Dashboard authenticates the request; the Worker rechecks active staff permission
and scopes every database query. Public Worker fetch remains 404.

Both checkpoints retain the existing 8 MiB bound and digest verification. RPC
returns a scoped UTF-8 byte envelope capped at 17 MiB; this fits the documented
32 MiB [Cloudflare RPC limit](https://developers.cloudflare.com/workers/runtime-apis/rpc/).
Dashboard verifies the echoed request and content identity before responding.
Deploy the compatible Worker to staging and production before the Dashboard.
No new public routes, provider, database migration or increased bundle limit.

## Pre-release verification

- Full Dashboard suite: 13,862 passed, 263 skipped across 2,056 passing files.
- Disposable PostgreSQL: 16 publishing/review tests passed, including concurrent
  checkpoint and active-release pointer locks and stale-decision rejection.
- Production build passed: raw 25,468,354 / 25,468,928 bytes; gzip
  6,623,875 / 9,750,000 bytes. Budgets unchanged.
- Dashboard typecheck: 917 pre-existing diagnostics versus 918 baseline; zero
  added, one Reviews refresh-handler error fixed. Strict management Worker
  typecheck and dry-run build passed. Changed-file lint and diff checks passed.
- Read-only production SQL proof returned the exact Reference candidate and live
  digests, ten tenant review rows, and zero rows for a different tenant.
- Reviewed scope joins, R2 key/digest/stream limits, untrusted text rendering,
  decision preconditions, transaction locking, generated bindings and immutable
  deployment guards. No browser dialogs, raw form controls or frontend server
  imports were introduced. Live review and release acceptance remain pending.
