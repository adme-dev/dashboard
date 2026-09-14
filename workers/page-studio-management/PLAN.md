# Private Page Studio management service

Email PR558 exceeds the fixed Pages raw bundle budget by3215bytes when combined
with current main78bf. Move its reviewed SQL/role/CAS/audit implementation to a
private Worker. Email extraction alone still exceeds the budget by2209bytes.
Move the complete domain authority, provider, DNS verification and durable receipt
closure to the same service, preserving transaction boundaries. Keep authenticated
Pages routes and customer UI. Portal administrators can prepare and verify domains;
viewers receive a safe projection. No email sending or budget-limit change is included.

The service binds only the exact environment's cache-disabled Hyperdrive. It
uses non-retrying per-request transactions, fresh role/site/customer/entitlement
checks and the existing redacted atomic audit. RPC requests carry a validated
actor and expected environment; only the Worker binding chooses actual DB/env.
Public fetch always denies, workers.dev/previews/routes/cron stay off. No secret
values are committed. Errors never return provider or database details.

Preserve all25 PostgreSQL business cases against the extracted implementation.
Add transport/worker tests for binding absence, environment mismatch, caller
scope, input/result validation, no automatic write replay and DB cleanup. Build
and inspect the actual Worker, generate binding types, validate each deployment
target, then rerun full Pages CI/size guard. Stage and verify before production.

Domain RPC uses the Worker-owned release environment, zone, target and optional
provider token. Request bodies are bounded before parsing; caller-supplied provider
configuration is never accepted. Real PostgreSQL tests cover the complete handler
and the existing attachment receipt/recovery cases. Public customer cutover remains
a separate acceptance step. Readback found no domain zone, target or token configured
on either existing Pages environment; absence must remain fail-closed and must never
be recorded as successful provider provisioning.

Compatibility is explicitly pinned to2026-07-15 for this first service, matching
the installed reproducible workerd test runtime. No later API is used. Both local
acceptance and provider deployments must use this exact date; do not silently
substitute an older test date for a newer production configuration. Date upgrades
require their own runtime verification.
