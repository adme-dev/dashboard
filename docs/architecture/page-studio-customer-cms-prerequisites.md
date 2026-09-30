# Native customer CMS prerequisites

This RND-22 increment runs the existing collection, workflow and collection-staging
setup operations for an approved standalone customer preview. The private customer
session dispatcher adds `cms-prerequisites`; the gateway and Studio control client
accept this exact authenticated POST path. Browser/Sandbox launch stays disabled.
The canonical delivery ledger is the customer CMS PRD in documentation PR601.

## Authority and retained work

A strict status/start/recover request chooses one of three server-owned contracts.
No caller-selected site, database, actor, SQL, digest or runtime is accepted.
Current native customer `workspace:create` authority derives the scope and parent
login provenance. Collection, workflow and CMS staging upgrades retain their
existing schema digests and predecessor discovery/verification. Provider calls
occur outside native SQL transactions; fresh native admission surrounds them.

One immutable audit intent retains the original operation, request ID, complete
child claims, actor/login digest, database and identity. Initial creation serializes
under the existing account/identity/session → workspace/site → child lock order.
Concurrent/repeated starts reuse that intent; changed request IDs conflict. A
retained retry does not discover or allocate replacement resources. Exact installed
receipts must match the retained intent before reporting success.

Worker callbacks recognize the distinct customer actor before legacy agency/client
inference. They verify the exact retained intent and digest, then require the
original or explicitly recovered native child session, its owner membership,
preview approval and entitlement. Claims and recovery head are checked again after
lock waits. Existing disabled-operation audit events deny start, recovery and
callbacks. Missing or incompatible bindings leave setup pending. No callback trusts
a signed session or audit event alone as continuing authority.

## Explicit recovery

A new child session, including one issued from the same parent login, can inspect
redacted reconciliation status but cannot silently continue the prior child’s work.
The original verified owner can explicitly recover by comparing the latest recovery
ID. Append-only receipts select current child claims while preserving the original
operation, actor and resources. An exact recovery retry is idempotent; an old replay
cannot replace a newer head. A changed owner cannot take over this operation through
recovery. Audit failure rolls back recovery; post-provider revocation can deny the
response even after remote work became durable, so subsequent reads reconcile it.

## Boundaries and rollout

Only the three upgrade-local actor contracts gain `customer-user`. Generic content
attachment, generic schema preparation, record/schema editing, billing, AI and
publication grants remain unchanged. Customer upgrades are staging-only and require
the existing private customer-editor enablement and exact origin configuration.
There is no new migration or customer database allocation, and no public route or
UI is enabled. Deploy matching protocol/coordinator/executor/control consumers
before enabling a browser caller.

The existing CMS adoption adapter can consume verified prerequisite receipts after
these operations finish. Local PostgreSQL and D1 tests do not prove deployed routing,
R2 ownership, database isolation or a Ready customer website. Full browser/Sandbox
launch/save/reload/return, two-customer hosted receipt acceptance and release/QR
navigation remain rollout gates. Final review, source, local gate and CI receipts
are recorded in the paired PRs and canonical PRD.
