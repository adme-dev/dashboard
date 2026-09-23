# Checkpoint staging dispatcher verification

The durable dispatcher commits at most three claims before private service RPC,
runs them concurrently under a 90-second deadline, and acknowledges each in a
fresh non-retrying transaction. It retains the immutable original request identity
and reports uncertain acknowledgement separately. A matching ready checkpoint is
required for completion; pending work is reconciled with bounded attempts/backoff.

Evidence on 23 September:

- Initial failing test: missing dispatcher module (`root-checkpoint-dispatcher-red.log`).
- 44 dispatcher/client unit tests: pending/failed/suspended states, response errors,
  claim commit uncertainty, settlement failures, expired claims, timeout, late reply
  and bounded concurrent RPCs.
- 68 PostgreSQL authority/coordinator tests, including five new dispatcher cases:
  lost successful RPC response, existing pending claim recovery, logout during
  provider work, settlement rollback and lost successful settlement response.
  They assert one build admission and activation through recovery.
- Strict dispatcher/client/outbox TypeScript and ESLint pass.
- Final combined dispatcher/client/authority/outbox run: 161 tests pass in four
  files (`/private/tmp/root-checkpoint-dispatcher-final.log`).
- Independent review of complete changed files and dependent contracts found no
  actionable correctness/security issues. Formatting fixes followed the review.

Logs are under `/private/tmp/root-checkpoint-dispatcher-*`. Existing disposable
PostgreSQL port 55444 was used; no production records or migrations changed here.

This is the dispatch core. The authenticated cron route and scheduler connection,
paired deployments and hosted automatic-staging acceptance are still required.
It does not enable interactive staging CMS/actions or replace an existing preview
with every subsequent checkpoint.
