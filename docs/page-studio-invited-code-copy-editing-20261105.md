# Invited portal manual editing of ready code template copies

Source candidate only. This adds no editor interface or account permissions.
The paired Studio bridge uses the existing canonical Page Studio editor.

Private, machine-authenticated POST routes under `/internal/page-studio/checkpoints/`:

- `editor-template-copy`: signed agency/client session proof of an owned READY
  destination and its current accepted code checkpoint.
- `editor-client-code-latest`: invited-client current accepted code pointer.
- `editor-client-code-history`: at most 20 own accepted code checkpoints.
- `editor-client-code-commit`: invited-client prepared immutable code checkpoint
  with an existing accepted code parent and strict expected-head CAS.

All routes require `x-page-studio-session`. Commit also binds `idempotency-key`
to the checkpoint identity. The control gateway forwards the signed token only
on the exact private routes. Generic client code commits and all client source
imports remain denied. No session capabilities are added.

Fresh native membership, login/session, entitlement and site authority is checked
under the destination site lock. Client admission requires checkpoint/reconnect
capabilities. The copy must remain READY with an owned, audited code head.
Editing does not depend on continued access to the original template grant.
History/restore never reads another destination or an unaccepted prepared object.

Commit keeps the compatibility document digest unchanged, verifies the owned
immutable envelope/package/index/content outside SQL locks, then reauthorizes
inside the final commit transaction. The accepted expected parent can differ
from the current head so an identical lost-acknowledgement operation can reconcile;
the existing CAS primitive rejects conflicting stale writes and handles replay.
Typed-to-code conversion is unavailable through this lane.

Validation: control gateway scoped TypeScript check and bundles for all four
changed/new private handlers passed on Node24.18.0/pnpm10.17.1. Full Nuxt build,
full application typecheck, tests, production deployment and browser acceptance
are separate root-owned gates. No new tests/suites, account changes or deployment
were performed for this candidate.
