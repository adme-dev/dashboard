# Customer provisioning recovery

This RND-21/22 increment lets the original customer owner explicitly resume the
same staging preview after signing in again. The customer dashboard presents
“Continue your website setup” and a Resume action. Reads never recover or allocate.
The canonical task ledger remains documentation PR601.

## Native authority and immutable intent

The original provisioning intent, actor, login hash, plan, request key, resources
and checkpoint provenance remain immutable. A separate append-only audit event
binds current authority to the owner's new login. Recovery requires the same
verified identity, current owner membership, native workspace without a legacy
binding, the retained operator approval and unchanged preview entitlement.

Transactions preserve account → identity/session → workspace/site lock ordering.
Session, membership, approval and entitlement clocks are checked again after lock
waits. Provider discovery and retry calls occur outside database transactions.
Worker admission and first-checkpoint commits read the current recovery receipt;
revoking the replacement login stops those operations. Old browser cookies remain
revoked and a different active login cannot silently substitute itself.

Recovery compares the expected immutable-job digest and predecessor recovery ID.
An exact retry returns the retained receipt; competing or stale replacements
conflict. The receipt also pins the failed provider attempt observed by the
server before recovery. Replaying that request cannot restart a later failure.
A later failed attempt needs a new explicit recovery action. Audit failure rolls
back the authority change. There is no new database migration.

## Worker retry

Matching private Studio coordinator and executor versions are required. A real
version RPC through both workers confirms support; testing for a callable property
alone is insufficient because RPC proxies can expose absent remote methods.
Missing or incompatible workers suppress recovery and leave the intent unchanged.

The coordinator accepts only customer staging failures. It verifies immutable
identity, rechecks native authority, and conditionally changes the exact failed
payload to requested only when no lease is held. Attempts increment under the
existing bounded schema; resource handles remain unchanged. The scheduler then
uses the existing guarded, idempotent allocation, initialization, seeding and
checkpoint steps. Every external effect still requires fresh native authority.
An old snapshot cannot overwrite a later failure or a live attempt. The final
native check can fail after a remote retry becomes durable; subsequent status
reads reconcile that uncertainty without creating replacement resources.

Failed jobs from agency/portal principals remain denied. Failed customer jobs
require an explicit native recovery receipt before worker retry admission.
Recovery does not authorize collection/workflow upgrades, billing, AI, editor
launch or publication. Coordinator completion remains Awaiting verification.

## HTTP and UI

`POST /api/portal/page-studio/customer/recover` accepts only a recovery UUID,
expected predecessor UUID/null and expected job digest. The native cookie, exact
origin, existing staging flags and request limit are mandatory. Workspace, site,
actor, provider attempt and resource identifiers are server-derived. Responses
expose redacted progress and opaque recovery challenges, never login hashes or
provider errors. The page disables stale/busy actions, requires an explicit
click and refreshes after uncertain responses.

## Evidence and rollout

Real PostgreSQL cases cover recovery, replay after another failed attempt,
competing requests, revocation, lock-crossed expiry, rollback and checkpoint
provenance. Studio tests exercise failed-job scheduling and actual workerd private
RPC/D1 retry, live-lease denial and missing-worker compatibility. Browser checks
use the real Nuxt page with intercepted API fixtures at 1280, 390 and 320 pixels,
including keyboard recovery and reload; they do not prove hosted provisioning.
Full validation and source/CI receipts are recorded in paired PRs and PR601.

Deploy matching consumers and verify hosted two-customer isolation before enabling
customer recovery. No deployment or activation accompanies this increment.
Collection/workflow/CMS-runtime setup, browser editor lifecycle and hosted
launch/save/reload/return acceptance remain separate roadmap items.
