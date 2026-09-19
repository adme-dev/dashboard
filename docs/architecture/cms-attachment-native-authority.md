# Native authority for CMS attachment

19 September 2026 — connection integration in progress.

`POST /internal/page-studio/content-attachments/authorize` is machine-authenticated
and never cacheable. It authorizes an exact immutable intent already recorded by
native agency or portal authentication. Browser callers cannot mint authority by
supplying a scope, actor, original login hash, artifact or operation identity.

The fresh, uncached read-only authority query verifies the retained audit owner/role, complete request
and deterministic identity, original native login, checkpoint digest, current
site/client/entitlement and live permission policy. Preparation records the verified
anchor page count in append-only metadata so later checks enforce page allowance
without rereading a multi-megabyte checkpoint before every provider call. Legacy
private intents without this evidence fail closed; no automatic ownership transfer
or audit-event rewrite is permitted. The original R2 checkpoint is still independently
verified by the executor.

Read-only provider admission uses one PostgreSQL statement snapshot. Logout committed
before that snapshot denies the next admission. A logout that commits after the
snapshot can race a successful response; no cross-store atomic fence is claimed.
Every provider boundary still performs a fresh check, with no cached authorization.
This replaces repeated locking transactions whose round trips exhausted the five-minute
setup lease in staging. Duplicate native intent rows fail closed.

Intent preparation and native completion keep their ordered locking transactions.
The site lock precedes native portal and parent-login locks, matching logout order.
After acquiring authority locks, fresh statements check wall-clock expiry again;
completion also checks after its audit write. Provider outcomes remain owned and
recoverable if authorization changes during I/O.

## Connection implementation and acceptance

1. Native permission adapter and ordered resource setup (implemented here).
2. Persist a verified, inactive attachment route with exact resource/seed proof.
3. Commit completion under PostgreSQL native authority locks; preserve an immutable
   completion audit receipt. No network/provider operation inside this transaction.
4. Resolve attachment routes only when both D1 proof and matching native completion
   exist. Logout after completed setup must not disable other authorized CMS users.
5. Expose explicit setup/status through the selected website's admin; reads never
   create resources. Repeated requests reuse the original operation.
6. Verify current-source staging with a synthetic website, then Fantasy, including
   CMS write/reopen and pre/post page, checkpoint, version and release comparisons.

Staging integration is deployed for acceptance. The synthetic staging website has a
retained setup operation and owned D1 database; activation and CMS save/reopen remain
pending. Fantasy is in the production account and has not been changed.
