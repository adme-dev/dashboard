# CRM Search Staged Rollout

Production remains unchanged until six separate, unexpired, revocable approvals are issued in this guarded order:

1. `resource_provision`
2. `production_migration`
3. `production_deploy`
4. `client_indexing`
5. `client_shadow`
6. `client_assist`

Each approval binds the original requester and distinct approver, reason, environment, implementation SHA, frozen artifact and binding manifest digests, evidence bundle, expiry, exact client set/revisions, and maximum cost. The bootstrap `resource_provision` authority is a signed Ed25519 release artifact. Its importer verifies the active trusted key and recomputes `importedProvenanceHash`; caller-supplied provenance is never accepted.

Metadata indexes and sentinel readiness precede backfill. Backfill and confirmation precede shadow. Reconciliation and evaluation evidence both precede promotion. Assist is per-client and never implies portal semantic search. A later finding that changes code, configuration, dependencies, or target resources invalidates the artifact and all derived evidence.

Commands default to preview. Production requires an explicit production flag, exact signed resource readback, the verified frozen bytes, and the matching approval. No approval authorizes resource creation, schema mutation, deployment, indexing, shadow, or assist belonging to another step.
