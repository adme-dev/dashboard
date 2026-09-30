# Native customer managed CMS page saves — RND-22

Continue the approved native customer session and typed-storage boundary. An
ordinary page save on an already managed customer site must advance the accepted
checkpoint and CMS application atomically under the customer's original login,
workspace ownership and staging preview entitlement. Preserve component/action/
schema selections; never impersonate a staff or portal session.

1. Add an explicit native customer principal and checkpoint-only mutation to CMS
   authority. Acquire native identity/workspace/site authority in its existing
   lock order and recheck immediately before commit/replay. Deny foreign scope,
   production environment, schema/record/action/billing and AI/history operations.
2. Route managed customer checkpoints through the existing graph verifier and
   atomic commit, with remote storage outside SQL locks. Retain native customer
   audit attribution; do not create legacy staging/publication grants.
3. Exercise actual PostgreSQL rollback/CAS/replay, real graph verification and
   scoped storage fixtures; test revocation during storage and lock waits,
   invalid content, foreign actor/scope, unchanged graph and atomic rollback.
4. Run focused/full checks, review, push a draft PR and update PRD #601. No
   production migration, activation, adoption route or browser launch.

Threat boundaries: signed claims are rechecked against native rows; remote R2/D1
bytes remain untrusted and digest-verified; graph and checkpoint pointers commit
in one transaction; source/AI/publish capabilities remain unavailable. Hosted
resource acceptance and customer graph adoption remain separate rollout gates.
