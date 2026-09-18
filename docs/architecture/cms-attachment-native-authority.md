# Native authority for CMS attachment

19 September 2026 — connection integration in progress.

`POST /internal/page-studio/content-attachments/authorize` is machine-authenticated
and never cacheable. It authorizes an exact immutable intent already recorded by
native agency or portal authentication. Browser callers cannot mint authority by
supplying a scope, actor, original login hash, artifact or operation identity.

The authority transaction verifies the retained audit owner/role, complete request
and deterministic identity, original native login, checkpoint digest, current
site/client/entitlement and live permission policy. Preparation records the verified
anchor page count in append-only metadata so later checks enforce page allowance
without rereading a multi-megabyte checkpoint before every provider call. Legacy
private intents without this evidence fail closed; no automatic ownership transfer
or audit-event rewrite is permitted. The original R2 checkpoint is still independently
verified by the executor.

Preparation and worker reauthorization share the same owner/policy query. The site lock precedes native portal and parent-login locks, matching preparation
and logout ordering. After acquiring authority-row locks, a fresh query checks
wall-clock expiry again; PostgreSQL can otherwise evaluate expiry before waiting
on a lock. This is admission
for a provider effect, not a claim that PostgreSQL and D1 share a transaction.
Provider outcomes remain owned and recoverable if authorization changes during I/O.

## Connection steps still being integrated

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

The site is not connected by the authorization endpoint alone. No deployment,
route activation or Fantasy mutation has occurred in this integration checkpoint.
