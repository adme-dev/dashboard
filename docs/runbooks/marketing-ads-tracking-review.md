# Reviewed Google Ads and tracking operations

Staff need the operator-owned `ads_plan` / `tracking_plan` grant, current client
access and signed `mcp:write` for proposals. Reporting alone permits scoped Ads
reads. No MANAGEMENT/ADMIN group is granted to enable marketing. Owners retain
the existing direct path; ordinary admins cannot self-confirm MCP Ads proposals.
Retained ordinary Ads proposals must be recreated as reviewed plans.

Open `/agency/marketing/reviews/google-ads` or `/agency/marketing/reviews/gtm`
as a different active owner/admin. Inspect requester, client/account, exact hash,
diff, risk, expiry and tracking ownership evidence. Approve and execute separately.
Execution rechecks requester/reviewer authority and target ownership. Unknown
outcomes are held; inspect provider evidence rather than repeating the operation.

GTM needs an existing client-to-connection mapping established by the owner.
Staff inventories return only assigned bindings. A binding proposal can select
an unbound web container only after exact ownership review; application checks
its public domain against the site's explicit HTTPS allowed origins. Other
clients' containers are rejected before credentials. No connection-name fallback
establishes ownership.

Record exact dealer/client, host/form endpoint, native versus external platform,
accepted-enquiry conversion owner, browser requirement, consent owner/policy,
existing hooks, native-server inspection, provider-specific deduplication,
current source/guide/wiki/graph revisions and content-free Conversion Delivery
references. Record unavailable/stale documentary areas explicitly. Native
DriveAgent accepted leads keep native server routing; the XeroFlow installer and
accepted-lead browser conversion templates are withheld for those sites.

Each workspace/installation proposal compiles in isolation after review and
records its exact version. Propose publish for that compiled version separately.
Rollback selects only the previous version recorded by a verified publish.
Fingerprints, live base and managed read-back must match. The initial bounded
registry supports `tag.google.v1`, `tag.ga4_event.v1`,
`tag.google_ads_conversion.v1`, `trigger.window_loaded.v1`, and `folder.v1`.
Variable types, legacy gaawc, GtagConfig, custom HTML/JavaScript and raw provider
JSON remain unsupported. Updates reject existing configuration outside the
managed schema instead of silently dropping it. No deletes are offered.

Source fixtures under `test/fixtures/gtm/` pin Google-authored representations.
They do not prove provider write acceptance. Before activation, record actual
OAuth grants/container permissions, account mapping, quota behavior, one selected
reviewed operation, transport receipt and exact version/live read-back. Report
configuration, validation, transport, live installation and customer conversion
delivery separately. Never fabricate a customer enquiry.

Migrations 484/485 extend existing Ads/GTM control planes. They do not activate
provider flags or connect accounts. Source base and graph/wiki limits are recorded
in `docs/persona-360-tracking-guide.md`; no dealer-specific acceptance is claimed.

## Correction-round execution boundaries

Publication must still match the live base from which its source version was
compiled. An intervening publication requires recompilation and a new review;
it cannot be silently adopted as a new base. Rollback is a separately reviewed
full replacement. Reviews show exact base/target paths and fingerprints, source
proposal links, safe before/after configuration and explicit unavailable cost
or validation evidence. Script content is represented by hashes, never executed
in the reviewer UI. Older pending proposals without this projection must be
recreated.

Installation review hashes the server-generated tag/trigger, site identity/name,
SPA setting, write key, binding/container and collector origin. Execution rejects
any change to that identity before credentials; it checks again inside the reused
installer before writes. The compiled installation manifest survives separate
publication and exact-version/live read-back. The generated trigger ID becomes
known during compilation and is pinned in that manifest for publication review.

Every reviewed operation reserves its entire request budget atomically before
provider execution, including verification reads. The shared project budget
remains 20 requests per 100 seconds (the additional five-provider-request recovery
margin is unchanged). A five-tag create with one existing trigger per tag needs
21 calls and is rejected before writes. Split oversized work into smaller
separately reviewed proposals; there is no automatic multi-window continuation.
Existing or concurrent quota use can safely deny admission even for a smaller
batch. Do not retry an executing/unknown proposal. A failed admission has no
provider effects and requires a fresh proposal after capacity is available.

Verified already-installed presence is a no-op; already-in-progress installation
returns the existing operation without authorizing another write. Preflight or
quota failure releases this proposal's connection hold. Only an attempted
provider mutation or binding database write followed by an unverified outcome
retains an unknown hold.
For manual inspection, record proposal/connection IDs, change-set/workspace and
version paths, approved hash and the last durable receipt without copying tokens
or customer content. Reconcile exact provider state and live fingerprint against
the intended manifest before deciding whether to close the attempt or prepare a
new review. This slice has no operator unlock endpoint; removing a database hold
by itself never authorizes a retry.

Unbound-container host/web eligibility remains checked during approved binding
execution. Proposal-time reads first reject other clients' locally mapped
containers and require an existing client/connection mapping; absence of a local
binding is not positive proof of external host ownership. Provider additions
inside existing parameter arrays are not a complete recursive audit in this
slice; managed parameters are verified exactly. Hosted/browser/provider
acceptance remains separate from fixture tests.
