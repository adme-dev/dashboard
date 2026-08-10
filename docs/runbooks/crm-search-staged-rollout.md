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

The protected release workflow has two separate manual invocations. `build` checks out the exact detached SHA, consumes and validates the complete signed binding readback against both explicit Pages environments, builds Pages and the consumer once, records every exact file, stages the lock/tool/build-command/Pages/Worker/binding inputs, signs the Ed25519 artifact envelope, and uploads it. `deploy` downloads that same artifact, the full signed `production_deploy` envelope, and the independently signed bounded release evidence; it never rebuilds. The approval pins the exact evidence hash, while the evidence must prove the Task 15 sealed handoff is production-ready and that no mutable cleanup target remains. Immediately before each external spawn the runner reads the current approval and both approval/rate-card revocations through the direct Neon release connection. Pages deploys only the recorded `pages/` directory. The consumer uploads only the recorded entry with `versions upload <entry> --no-bundle` and the recorded config/cwd.
