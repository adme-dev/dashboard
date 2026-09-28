# Two isolated synthetic runtime hosts — 29 September 2026

`PAGE_STUDIO_RUNTIME_STAGING_CANARIES` accepts a strict JSON array of one to four
exact `{tenantId,clientId,siteId,hostname}` entries. Hostnames and UUIDs normalize
to lowercase; duplicate hostnames or complete scopes are rejected. Configuration
is bounded to 8 KiB. The legacy singular `PAGE_STUDIO_RUNTIME_STAGING_CANARY`
remains supported; configuring both names fails closed. No wildcard grant exists.

The same selector is used by runtime target admission and the native runtime-state
hostname fallback. Selection itself grants no authority: publication/projection
still require deployment and target environment `staging`, exact native scope and
hostname, and the current site's `integrations.synthetic=true`. Normal ready
provider-owned staging hosts retain their existing rules. The UI fallback applies
only to synthetic runtime sites without an existing ready host or release pointer;
it neither creates a staging row nor activates a release.

The intended second hostname is `cms-second-staging.xeroflow.io`, attached as a
Workers custom domain to **`xeroflow-page-studio-delivery-staging`** in the
`xeroflow.io` zone (`8e38cbf3910d291dd218710296661073`). Provider environment for this
named Worker is `production`; the application's native publication environment
remains `staging`. Preserve `page-studio-staging.xeroflow.io` on the same Worker
and preserve its `*-staging.xeroflowpages.com/*` route. Provider readback before
implementation returned exactly one existing custom domain for this service:
`page-studio-staging.xeroflow.io`, ID `64aacbfa63cf23bdd07d1040f37b894376920aca`,
with result count and total_count both 1. This note does not claim attachment of
the new hostname or any deployment.

A `*-staging.xeroflowpages.com` public hostname was deliberately not selected:
Delivery treats that suffix as authenticated preview space. The exact new
`xeroflow.io` custom domain reuses current public runtime resolution without
changing preview authorization, customer staging provisioning, production routing
or the production renderer.

## Local evidence

Tests first reproduced the missing plural configuration and UI fallback (15
failures). Unit regressions cover both exact scopes, legacy input, bounded and
unique lists, malformed/ambiguous input, wrong scope/host, non-synthetic sites,
production denial, grant removal, normal staging authority and UI fallback.

The PostgreSQL feature suite now exercises two distinct tenants, clients, sites
and native login accounts in the same disposable schema. Both accepted graphs
activate and project, both roll back to earlier releases with fresh epochs and
current records, and each scope's content stays separate. Cross-host activation
and projection, stale epochs, production access and removed grants fail closed.
No provider-ready staging rows are created by this synthetic-canary regression.
Owned test schemas are dropped by the existing fixture cleanup.

The second graph fixture is test data generated with Studio's existing
`packages/protocol/src/builder-graph-fixtures.ts` constructor, following
`scripts/generate-native-builder-graph-fixture.mjs`. Set its graphScope to tenant
`tenant-second`, client/business `10000000-0000-4000-8000-000000000002`, site
`20000000-0000-4000-8000-000000000002`, and replace the constructor's literal
checkpoint IDs with `base_checkpoint_second` and `next_checkpoint_second` before
bundling. All dependent hashes are computed by the original constructor. This
fixture is not hosted generation/acceptance evidence.
