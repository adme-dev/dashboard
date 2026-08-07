# Decision Log

Decisions marked **Accepted** are rollout constraints. Decisions marked **Pending**
block only the phases listed.

## D-001 — Separate provider responsibilities

**Status:** Accepted
**Decision:** XeroFlow owns orchestration and approvals; Merchant API owns Merchant
resources; Google Ads API owns campaigns and advertising resources.
**Reason:** The APIs have different resource models, permissions and failure domains.
Conflating them would make authorization and recovery unsafe.

## D-002 — The AI assistant is internal

**Status:** Accepted
**Decision:** The assistant creates proposals and confirmed XeroFlow jobs/tasks. It is
not published to Google and receives no direct provider-mutation tools.
**Reason:** Deterministic validation and human authorization must remain between model
output and provider operations.

## D-003 — Merchant integration starts read-only

**Status:** Accepted
**Decision:** Releases 1-2 contain no Merchant mutation path.
**Reason:** Account topology, real enum behavior, feed ownership and operational impact
must be proven first.

## D-004 — Campaign creation is paused-first

**Status:** Accepted
**Decision:** Google campaigns are created paused, read back, then activated only by a
separate approved action.
**Reason:** Provider acceptance does not prove configuration correctness or authorize
spend.

## D-005 — Cloudflare remains the control plane

**Status:** Accepted
**Decision:** Use Pages/Nitro, Workers, Queues and existing Neon/R2 patterns. Do not add
Google Cloud compute, scheduler or messaging products for this rollout.
**Reason:** It preserves the deployed architecture and avoids a second operations plane.

## D-006 — Adopt, do not duplicate, concurrent PMax work

**Status:** Accepted
**Decision:** This workstream will rebase after the concurrent PMax session and reuse
its surviving budget, state, hash, approval and persistence contracts.
**Reason:** Root currently contains unmerged migrations and launch utilities owned by
another session; parallel alternatives would create schema and state divergence.

## D-007 — Candidate Cloud project is not yet approved

**Status:** Pending; blocks Merchant registration and production credential changes
**Decision needed:** Confirm whether `gen-lang-client-0818792107` is the production
XeroFlow OAuth project and whether it should be the long-lived agency integration
project.
**Default:** Read-only inspection only; do not register it to a Merchant account.

## D-008 — Merchant account topology

**Status:** Pending; blocks Merchant registration
**Decision needed:** Identify the controlling agency/advanced account and how client
subaccounts/standalone accounts will be accessed.
**Default:** Do not register per dealer or client subaccount.

## D-009 — Legacy Content API retirement

**Status:** Accepted
**Decision:** Maintain the existing read audit until Merchant API parity and live
comparison pass, then remove the legacy path in a dedicated reviewed task.
**Reason:** Avoid an observation gap while still preventing new legacy dependency.

## D-010 — Data Manager remains conditional

**Status:** Accepted
**Decision:** Verify and reuse the existing Data Manager integration for measurement
evidence. Do not make it a universal Merchant-readiness dependency.
**Reason:** Merchant/catalog health and first-party conversion delivery are distinct
failure domains.

## D-011 — YouTube API is opt-in scope

**Status:** Pending; does not block Releases 1-3
**Decision needed:** Whether XeroFlow must upload generated PMax videos.
**Default:** Use existing authorized YouTube video IDs or approved retail PMax behavior;
do not enable upload scope.

## D-012 — Completion is evidence-based

**Status:** Accepted
**Decision:** A task or phase is complete only when acceptance criteria, tests, review,
provider evidence where applicable and merge/deploy state are recorded.
**Reason:** This work spans external systems where committed code alone cannot prove
the intended outcome.
