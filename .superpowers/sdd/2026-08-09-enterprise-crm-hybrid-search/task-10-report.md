# Task 10 Report — Dedicated CRM Search Queue Consumer

## Result

- Status: `DONE_WITH_CONCERNS`.
- Intended commit: `feat(crm-search): add dedicated queue consumer`.
- Scope: the standalone `workers/crm-search-consumer` package, its two Task 10
  suites, and this report only. Concurrent Task 8 files remained outside this
  task's ownership and staging scope.
- No database, provider, Queue, Cloudflare resource, production deployment, or
  production-network mutation was performed. Wrangler ran only with
  `deploy --dry-run` and exited before deployment.

The remaining concern is intentional: readiness cannot become `ready` until an
authorized release workflow supplies frozen artifact/binding evidence, a valid
active signing key, and Cloudflare API readback for two separately provisioned
14-day queues. This task neither invents that evidence nor provisions resources.

## Implemented Contracts

- `src/consumer.ts` is a dedicated batch consumer for only
  `agency-crm-search-index` and `agency-crm-search-index-dlq`. Unknown queues
  fail closed. It accepts only the shared versioned identifier envelope, rejects
  extra/source fields, and reserializes the exact canonical body before signing.
- Both primary and DLQ forwarding use the committed Task 9 HMAC contract and
  exact Pages paths. Method, path, timestamp, operation/correlation identifiers,
  protocol, and body digest are therefore bound by the active service key. A
  previous key may remain in the verification keyring but is never selected for
  Worker signing.
- Primary outcomes `complete`, `accepted_provider_pending`, and `superseded`
  acknowledge their individual messages. DLQ outcomes `recorded` and
  `duplicate` acknowledge only after the signed Pages request succeeds. HTTP,
  transport, timeout, malformed-response, and incompatible-outcome failures
  call `retry({ delaySeconds: 30 })`; the primary binding moves exhausted
  messages to its configured DLQ.
- Every message receives an explicit per-message disposition. Logging is a
  projected allowlist of event, validated operation/correlation identifiers,
  protocol, and stable status only. Raw queue bodies, CRM source fields,
  provider responses, and exception strings are never logged. Logging failure
  cannot change or prevent queue disposition.
- `src/health.ts` fails closed before any process/DLQ request unless all of the
  following agree: exact HTTPS Pages origin; currently valid active service
  key; frozen Worker/Page SHA, artifact, and binding-manifest digests; exact
  Pages current/N−1 accepted-protocol evidence; expected Worker protocol and
  release evidence; and strict Cloudflare API readback for both queue names,
  supported paid plan, and exactly 1,209,600-second retention.
- Pages health and outcome responses have exact JSON media type, byte ceilings,
  fatal UTF-8 decoding, strict schemas, and redirects disabled. Outcome objects
  are projected to their status enum before control flow.
- `src/index.ts` exposes only exact `GET /health` with private/no-store JSON and
  the queue handler. Unready health returns a generic 503 without leaking
  failure details.

## Binding and Deployment Guard

- `wrangler.toml` pins the immutable Worker name
  `agency-crm-search-consumer`, entry point, compatibility date/flag, disabled
  `workers_dev`, observability, and fixed Pages origin.
- The primary consumer pins batch size 5, timeout 5 seconds, retries 5, retry
  delay 30 seconds, maximum concurrency 4, and the dedicated DLQ. The DLQ
  consumer separately pins batch size 5, timeout 5 seconds, retries 3, retry
  delay 30 seconds, and maximum concurrency 2.
- There is no queue producer, generic jobs binding, Vectorize binding, Workers
  AI binding, or inline provider fallback. All release/readback values and the
  service keyring are required secrets rather than committed ready defaults.
- Wrangler generates `CrmSearchConsumerEnv` and runtime declarations from the
  actual config. Strict source checking remains enabled; `skipLibCheck` is used
  only because the shared Task 9 standards-based `globalThis.crypto` shape and
  generated Workers declarations overlap when DOM standards types are present.
- The package deliberately has no production `deploy` script. Its only release
  command is `deploy:dry-run`; `scripts/deploy.mjs` rejects every other mode and
  revalidates the immutable name, config path, compatibility settings, origin,
  observability, exact secrets, absence of AI/Vectorize/producers, and both
  consumer policies before invoking local Wrangler with `--dry-run`.
- `DEPLOYMENT.md` records API-readback retention evidence, Pages-before-Worker
  rollout, health gating, and pause-consumer-before-incompatible-Pages-rollback.

## Source-Driven Cloudflare Contract

Official Cloudflare documentation was rechecked on 2026-08-10:

- Queue batching, explicit per-message acknowledgement/retry, retry delay, and
  first-disposition precedence:
  <https://developers.cloudflare.com/queues/configuration/batching-retries/>
- Queue JavaScript APIs and message/batch disposition methods:
  <https://developers.cloudflare.com/queues/configuration/javascript-apis/>
- Dead-letter queue behavior and `max_retries` routing:
  <https://developers.cloudflare.com/queues/configuration/dead-letter-queues/>
- Consumer concurrency and `max_concurrency`:
  <https://developers.cloudflare.com/queues/configuration/consumer-concurrency/>
- Wrangler consumer configuration, including batching, retries, delay, DLQ,
  and concurrency:
  <https://developers.cloudflare.com/queues/configuration/configure-queues/>
- Queue retention limits and plan-dependent capacity:
  <https://developers.cloudflare.com/queues/platform/limits/>
- Wrangler-generated TypeScript binding/runtime declarations:
  <https://developers.cloudflare.com/workers/languages/typescript/#generate-types>
- Worker runtime, WebCrypto, and deployment guidance:
  <https://developers.cloudflare.com/workers/runtime-apis/web-crypto/>,
  <https://developers.cloudflare.com/workers/best-practices/workers-best-practices/>,
  and <https://developers.cloudflare.com/workers/wrangler/commands/#deploy>.

The current Queue API documents that the first per-message acknowledgement or
retry call wins. The implementation still makes exactly one disposition call;
the logging-failure regression specifically prevents an acknowledgement from
falling through to retry.

## Behavioral TDD Evidence

### Initial RED

Both owned tests were created before any Worker/config implementation:

```text
pnpm exec vitest run test/workers/crmSearchConsumer.test.ts test/config/crmSearchConsumerConfig.test.ts
```

Result: expected exit 1. The runtime suite could not resolve the absent consumer
module, while all seven config tests reported absent Task 10 artifacts.

### Incremental GREEN and adversarial RED→GREEN

The first focused green was 2 files/24 tests. A fresh deep-review RED then proved
and closed five edge cases:

- noncanonical Pages accepted-protocol lists were not rejected before forwarding;
- a logging exception could escape after acknowledgement and reach retry logic;
- a logging exception could prevent health-gated retries;
- health requests followed redirects by default; and
- the dry-run wrapper had not yet frozen every release-critical config surface.

The final focused gate is:

```text
PASS: 2 files, 28 tests
```

It covers active-only HMAC signing, exact primary/DLQ paths, all acknowledgement
outcomes, transport/HTTP/malformed-response retries, invalid identifier-only
messages, privacy-safe logs, release/protocol mismatches, active-key expiry,
unknown queues, resource retention/plan failures, and exact health output.

## Regression, Type, Lint, and Dry-Run Evidence

- Combined Task 10 + committed Task 9 + MCP signing gate:

  ```text
  PASS: 10 files, 138 tests
  ```

  This includes shared CRM protocol/signing, process/DLQ endpoints, Pages health,
  real middleware auth-chain boundaries, and `mcpRequestSigningContract.test.ts`.
- Wrangler 4.110.0 generated `CrmSearchConsumerEnv` and compatibility-date
  runtime declarations; strict `tsc --noEmit` then exited 0.
- The shell-default Node 20.10.0 was below Wrangler's Node 22 minimum and also
  lacked ESLint's required `Object.groupBy`. Both gates were rerun with the
  repository's installed Node 24.18.0. One initial runtime-type generation was
  sandbox-blocked from binding loopback; the approved local generator completed,
  and subsequent sandboxed generated-type checks exited 0.
- Node 24 targeted ESLint over all owned source, deploy script, and tests: exit 0.
- Guarded `pnpm --dir workers/crm-search-consumer run deploy:dry-run`: exit 0,
  reported `--dry-run: exiting now`, and performed no deployment.
- Static scans found no Task 10 production references to `JOBS_QUEUE`,
  `VECTORIZE`, `agency-jobs`, a generic consumer, a provider fallback, raw CRM
  source/provider/error logging, Queue create/delete operations, or committed
  secret material. No trailing whitespace was found.
- Every owned implementation/config/test/document file was reread end-to-end.
  The review checked exact aliases and imports, structured-clone input handling,
  HMAC path/body binding, response/body bounds, redirect behavior, current/N−1
  compatibility, key windows, per-message first-disposition semantics, logging
  isolation, immutable deploy guards, and rollout/rollback order.

## Remaining Integration Concerns

1. An authorized operator/release workflow must provision the two dedicated
   queues with 1,209,600-second retention, read them back through Cloudflare,
   and supply the strict `CRM_SEARCH_RESOURCE_MANIFEST`. Task 10 intentionally
   performs none of those mutations.
2. Frozen implementation SHA, Worker/Pages artifact digests, binding-manifest
   digests, and service keyring secrets must be populated by the later release
   workflow. Missing or mismatched evidence keeps both health and consumption
   fail-closed.
3. Production rollout must deploy compatible Pages first, then the Worker. An
   incompatible Pages rollback requires pausing the consumer first; redirecting
   these queues to the generic jobs consumer is never an allowed fallback.
