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

## Cron connection — 24 September

POST /api/cron/page-studio-checkpoint-staging authenticates x-cron-secret against
the request's Cloudflare CRON_SECRET, with local process fallback only when the
binding is absent. Invalid explicit bindings fail closed; secrets are byte-bounded
and compared by constant-time SHA-256 digests. The route reads no caller body or
scope/environment query. It passes only the deployed environment and concrete
transactionWithoutRetry implementation into the existing dispatcher, awaits the
full bounded batch, and returns counts or a sanitized 503.

The pages-cron Worker invokes it once per existing five-minute schedule. The
retained originating login, entitlement, checkpoint, quota and activation fences
remain in the existing management coordinator. Cron does not create a substitute
actor or replace an active preview when later drafts are saved.

- New endpoint and scheduler tests failed before implementation.
- Endpoint, scheduler, inventory, dispatcher/client and existing cron regressions:
  69 passed. Combined new boundary tests plus actual PostgreSQL authority/outbox
  recovery: 174 passed. Lost-response recovery retains one admission.
- Changed files pass ESLint. Strict pages-cron Worker typecheck passes.
  Focused native TypeScript reports only the three pre-existing overloaded
  Neon Pool.connect typing errors in unchanged server/utils/db.ts:375/380/382.
- Independent source review found no blockers. Route inventory increases only
  the total and mutation counts by one; God mode bypass/guard counts are unchanged.
- Native production build passes with Cloudflare wrapping and size checks:
  raw 25,304,966 / 25,468,928 bytes; gzip 6,789,551 / 9,750,000 bytes.
  Evidence: /private/tmp/resume-astro-checkpoint-cron-build.log. No deployment ran.

Evidence: /private/tmp/resume-astro-checkpoint-cron-{red,green,pg,lint,types,worker-types}.log.
Paired deployment and hosted automatic-staging acceptance remain required.
It does not enable interactive staging CMS/actions or replace an existing preview
with every subsequent checkpoint.
