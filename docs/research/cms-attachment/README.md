# CMS attachment to an imported website

18 September 2026. R08/R12 child investigation and local lifecycle rehearsal.
**Research only. The attachment workflow is not implemented in the application,
and neither Fantasy nor the staging fixture has been provisioned by this work.**

## Confirmed root cause

Read-only Cloudflare provider queries at `2026-09-18T06:41:18.770Z` found zero
provisioning jobs, content-database reservations, content-Worker reservations and
content-route records for both:

- Fantasy: `c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
- Synthetic staging website: `a27135dc-1374-475c-a56d-7e60310425bb`.

Both sites were checked in both the staging and production provisioning stores.
All queries were SELECTs; provider metadata reported zero rows written. Pages
environment values and router service bindings match their respective
environments. No customer content, credentials or arbitrary job payloads were
included in the evidence. The previous staging browser check shows the CMS
unavailable state with saving disabled. A fresh Fantasy browser check was not
performed in this investigation; its recorded unavailable state is historical.

This proves missing retained setup resources, not a missing deployed service.
The private router's lookup cannot resolve an absent route. It does not prove
that no orphaned resource exists outside the ownership registries. Provisioning
must reconcile deterministic resource names/ownership before creating anything.

The initial readback was repeated with exact site-axis queries; the latest
sanitized result is [provider-evidence.json](./provider-evidence.json).
The reproducible [audit-provider.mjs](./audit-provider.mjs) reads local Wrangler
OAuth configuration (macOS default, or `CMS_AUDIT_WRANGLER_CONFIG` as a path
override), performs only metadata GETs and D1 SELECTs, and writes
`cms-storage-readback.json` in the working directory (`CMS_AUDIT_OUTPUT` overrides
that artifact path). It never prints the credential. D1 query transport follows the
[official API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/).

## Why ordinary setup is unsuitable

Current Studio `seedProvisioningCheckpoint` supplies `expectedCheckpointId: null`
and creates a `setup_<digest>` page checkpoint. Dashboard's
`commitPageStudioProvisioningCheckpoint` enforces that empty-head precondition.
The ordinary checkpoint writer rejects an unrelated existing draft. This is a
valuable existing protection, not a condition to remove.

The existing job also binds resource identity to the accepted plan, initiating
actor and original login. A historical job without its original login cannot
be adopted by a newer login. Changing the actor/hash or resetting a job phase
would bypass these contracts. No such operation was performed.

Inspected sources:

- Dashboard `35a88e1b71bbeb723b5149c15482585d433e011c`:
  `server/utils/pageStudio/{businessContent,provisioningBinding,provisioningAuthority,provisioningCheckpoint,controlStore}.ts`.
- Studio `ef77b8226ee8174b2a4a225e73a138894f099c67`:
  `services/sandbox-worker/src/provisioning-checkpoint.ts`,
  `services/business-content-worker/src/{content-route-registry,content-router-worker}.ts`,
  `packages/protocol/src/provisioning.ts`.
- Research branch starts from fetched Dashboard main
  `a917386dde67f06921843fd6e3a1ed1b4b984c6f`; it does not include or redeploy the
  separately staged authority changes.

## Selected design for implementation

Add an explicit **attach-existing-content** operation. It creates the website's
private content storage while leaving page checkpoints, version history, assets,
forms, current page head and published release untouched. Initially attach empty
collections; imported HTML is not authoritative structured customer data.
Schema/record authoring remains the A02–A05 work, not this attachment operation.

| Approach | Decision and reason |
| --- | --- |
| Explicit attachment operation sharing resource allocation and ownership checks | Selected: records intent, preserves imported pages and supports resumable effects. |
| Reuse normal site generation after clearing or replacing its head | Rejected: conflicts with page preservation and existing checkpoint authority. |
| Insert a route or impersonate a completed provisioning job | Rejected: cannot establish resource, seed, actor, checkpoint and lifecycle ownership. |

The operation retains: versioned mode, full server-derived tenant/client/business/
site/environment scope, initiating actor plus native-login identity, explicit
operation ID, original immutable checkpoint ID/digest, reviewed schema/runtime
digests and current capability-policy version. Include every new mode/anchor
field in deterministic identities and retained-job comparisons in both repos.
Do not reinterpret historical job identities.

An imported checkpoint is an immutable provenance anchor, not a request to
restore it. Later editor saves may proceed; attachment never rewrites the head
to that anchor. A missing/foreign/changed anchor fails before allocation. Native
login, effective entitlement, membership/action permission and site ownership
must be checked before effects and before activation. A new login cannot take
ownership of an interrupted operation automatically.

Ordered effects: reserve operation → allocate owned database → install reviewed
schema/runtime → seed empty content once → prepare private route → complete.
Every effect needs an immutable receipt and reconciliation after a lost response.
Resolution requires both a verified route and completed operation. Disabled
routes remain tombstones; retry cannot reactivate them. Public publication is
unchanged. Arbitrary generated execution remains disabled.

Authentication lives in PostgreSQL while provisioning lives in D1. The local
model's single-store final authorization/completion transaction cannot be copied
as proof of a distributed revocation fence. The implementation must resolve that
R06 boundary explicitly; fresh admission alone leaves a race after the check.

## Rehearsal

Run with Node 24.18.0; no dependencies or cloud credentials are required:

```sh
node --test docs/research/cms-attachment/attachment.test.mjs
```

`attachment.mjs` uses two disposable on-disk SQLite databases, one for control
state and one for provider effects. Tests close/reopen both stores after injected
interruptions to exercise durable recovery. The fixture has 75 synthetic pages,
109 asset-count metadata and eight form-count metadata. It is not Fantasy's real
manifest, asset bytes or rendered website.

Coverage includes loss of acknowledgement after each modeled step, repeated
operation IDs, competing reservations, changed immutable inputs, all five scope
axes, original-login binding, revocation, retained partial resources, interleaved
page edits, disabled-route retry and conflicting resource ownership. Retrying
completion and resolving a route reverify earlier provider receipts; missing or
reassigned resources withhold the route and require reconciliation. Records
arriving after setup survive retry and changing a runtime pin back to its old
value. Schema identity must match exactly for that rollback experiment.

The synthetic grant is not native authentication. External provider APIs,
parallel processes/leases, schema application and Worker code execution are not
modeled. The rollback test changes a pin; it does not deploy or execute old code.
Retirement/export/recovery and additive/incompatible schema migration rehearsals
remain open. These limitations prevent closing R08, R12 or any delivery task.

## Verification results

- All **40 local rehearsal tests pass**, with no skipped cases, on Node 24.18.0.
  Thirteen receipt-integrity regressions failed before the corresponding model
  corrections and pass afterward. The initial test run before implementation
  failed because the model module did not yet exist; that was not an application
  regression reproduction.
- Existing Studio source suites pass: **8 provisioning-checkpoint tests** and
  **22 route-registry tests**, including protection of an unrelated editor head,
  guarded activation and disabled-route behavior. These are existing application
  regressions, separate from the new research model.
- Independent review found two model receipt-verification gaps, now corrected
  with the thirteen regressions above. Final review reports no Critical or
  Important issue and independently reran all 40 rehearsal cases successfully.
- Node syntax checks and Git whitespace checks pass. Application build,
  typecheck and full repository suites were not repeated for these standalone
  research files. No application source, dependency, deployment or migration
  changes were made. The preceding staging release's full-suite result remains
  separate evidence, not a result from this research run.

Raw logs: `.verification/page-studio-builder-rnd-20260917/cms-attachment-*`.

## Ordered implementation children

| Child | Work | Required verification |
| --- | --- | --- |
| CMS-ATTACH-1 | Shared versioned attachment contract and immutable identity; strict alignment across Dashboard and Studio. | Reject unknown mode, foreign scope, invalid anchor/digests and changed retry payload; legacy job bytes unchanged. |
| CMS-ATTACH-2 | Native authenticated attachment intent/authority using A01 policy; derive scope and anchor server-side. | Real PostgreSQL owner/editor/viewer, revoked/expired login, entitlement, changed client/site and conflict cases. |
| CMS-ATTACH-3 | Coordinator/executor mode with shared allocation/ownership code and a read-only existing-checkpoint receipt; no `seedProvisioningCheckpoint` call. | Real D1/R2 recovery after each provider step and response loss; page head/history/release remain byte-for-byte unchanged. |
| CMS-ATTACH-4 | Route registry discriminates normal setup versus attachment receipt; completion/revocation contract resolved. | Native logout during every awaited boundary; no available route without valid current authority and exact resource proof. |
| CMS-ATTACH-5 | Client-admin/Studio readiness and setup action share the same operation/API. | Existing/empty/failed/disabled states, customer roles, repeated click, reconnect and safe retry; no automatic provisioning on read. |
| CMS-ATTACH-6 | Controlled synthetic staging attachment and shared CMS reads/writes; then reviewed Fantasy attachment. | Resource ownership readback; full pre/post page/history/release comparison; cross-customer denial; content save/reopen/conflicts. |

These child IDs refine existing A01/A02/A05 and R08/R12 work, not six additional
top-level delivery tasks. No provider resource creation, route activation, source
deployment or production mutation is part of this research increment.
