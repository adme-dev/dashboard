# Task 9 Report — Authenticated Queue-to-Pages Protocol

## Result

- Status: `DONE_WITH_CONCERNS`.
- Intended commit: `feat(crm-search): secure queue processing protocol`.
- Scope: Task 9 shared transport/authentication modules, three internal endpoints, five focused suites, and this report only. Concurrent Task 6 migration, migration-test, and report paths remained under the Task 6 writer's ownership.
- No database/provider/Queue/resource, network, migration, deployment, or production mutation was performed.

## Implemented Contracts

- `crmSearchIndexProtocol.ts` pins protocol v1, the exact process/dead-letter/health paths, a 256-byte request-body ceiling, canonical lower-case UUID identifiers, a canonical 24-byte UTC timestamp, the Queue's 14-day recovery bound, and one deterministic exact-field JSON envelope containing only protocol version, operation ID, correlation ID, and enqueue time. Process and DLQ idempotency identities are stable by operation and separated by exact path.
- `crmSearchIndexSigning.ts` uses a domain-separated canonical string and WebCrypto HMAC-SHA-256 over method, exact path, request timestamp, operation ID, correlation ID, protocol version, and SHA-256 body digest. Header representations, identifier/key/signature/digest sizes, protocol range, canonical signing size, freshness, future skew, key count, key bytes, key-version bytes, and overlap duration are bounded.
- Signing accepts only the configured active key inside its half-open validity window. Verification uses `crypto.subtle.verify`, then enforces active/previous status and validity, an explicit half-open rotation overlap no longer than one hour, a 60-second request freshness window, an exact current/N-1 protocol set, and the signed body digest. Unknown, premature, expired, retired, duplicate-secret, malformed, and oversized-overlap keyrings fail closed.
- `process.post.ts` and `dead-letter.post.ts` share the same bounded-body and authentication implementation. Authentication and exact envelope matching precede the injected durable replay reservation; that reservation precedes the injected complete-operation processor/recorder. Durable replay returns only the recorded typed outcome, unresolved in-flight work remains retryable with 503, malformed dependency results fail closed, and default dependencies cannot load database/provider work.
- Runtime key lookup gives an explicitly present Cloudflare binding precedence and does not hide a malformed binding behind a process-environment fallback. The request clock is captured once for signature and envelope checks.
- Both endpoints emit only structured operation ID, correlation ID, protocol, and status records. Source text, client/organisation data, bodies, secrets, provider payloads, URLs, and arbitrary error text are absent from the log contract.
- `health.get.ts` validates exact lower-case 40-hex Git SHAs and `sha256:<64-hex>` artifact/binding-manifest digests with Zod. Readiness requires deployed-versus-expected Pages SHA/artifact/binding equality, same-SHA expected Worker evidence, binding-manifest equality, and compatible emitted protocol. Missing, malformed, coercible, drifted, or incompatible evidence returns 503 with `private, no-store`.

## Source-Driven Runtime Contract

The implementation follows the approved design's dedicated-consumer contract and the repository's locally installed H3/WebCrypto runtime types. The relevant official references are:

- Cloudflare Workers Web Crypto API, including HMAC sign/verify: <https://developers.cloudflare.com/workers/runtime-apis/web-crypto/>
- Cloudflare Workers production practices: <https://developers.cloudflare.com/workers/best-practices/workers-best-practices/>
- H3 request utilities used for headers and the request Web Stream: <https://h3.dev/utils/request>
- Web Cryptography `SubtleCrypto.verify` contract: <https://www.w3.org/TR/WebCryptoAPI/#SubtleCrypto-method-verify>

No network lookup was made because Task 9 explicitly prohibited network activity. Provider/resource behavior was not inferred or simulated here; Task 10 owns the standalone consumer and concrete Queue configuration.

## Behavioral TDD Evidence

### Initial RED

All five focused suites were created before their implementation modules/endpoints. The required command was then run:

```text
pnpm exec vitest run test/crm/searchIndex/protocol.test.ts test/crm/searchIndex/signing.test.ts test/server/api/crmSearchProcessEndpoint.test.ts test/server/api/crmSearchDeadLetterEndpoint.test.ts test/server/api/crmSearchProtocolHealth.test.ts
```

Result: expected failure — five suites could not resolve the absent modules/endpoints, with zero tests executed.

### Incremental GREEN and adversarial RED→GREEN

The protocol, signer/verifier, and endpoints were implemented in thin slices. Protocol first reached 1 file/5 tests, protocol plus signing reached 2 files/11 tests, and the first endpoint slice reached 3 files/17 tests. The first complete contract plus MCP regression gate was 6 files/31 tests.

Fresh adversarial tests then reproduced and closed:

- a reservation marked duplicate before durable completion being acknowledged and losing retryable work;
- exact durable replay outcomes versus unresolved `in_progress` reservations on process and DLQ paths;
- inclusive key-expiry/overlap endpoints and verification through an expired active-key window;
- leading-zero/whitespace aliases for signed header coordinates;
- malformed reservation states falling through to processor/DLQ work;
- separate clock reads for signature and queue-age validation;
- a processor status object accepted through attacker-controlled `toString()` coercion;
- a malformed Cloudflare runtime key binding silently falling back to a different process-environment keyring;
- coercible non-string release-health evidence; and
- noncanonical runtime protocol strings normalized into an apparently compatible number.

Final Task 9 plus MCP signing gate:

```text
PASS: 6 files, 42 tests
```

## Static and Deep-Review Evidence

- Strict standalone TypeScript over all ten owned source/test modules: exit 0.
- Node 24.18.0 ESLint over all ten owned source/test modules: exit 0.
- An initial ESLint attempt under the shell's Node 20.10.0 failed before linting because the installed toolchain requires `Object.groupBy`; rerunning with the repository's Node 24.18.0 completed cleanly.
- Exact owned-source scans found no `CRON_SECRET`/cron-header shortcut, database helper import/call, provider/Vectorize/Workers-AI call, outbound fetch, or unsafe console error/body logging. The only runtime secret name is the dedicated `CRM_SEARCH_SERVICE_KEYRING`.
- Every owned file was reread end-to-end against the approved design and Task 9 brief. Review covered exact canonical bytes/fields, request-coordinate binding, WebCrypto verification order, half-open key windows, bounded rotation, active-only signing, current/N-1 validation, Cloudflare binding precedence, replay-before-operation-load order, dependency-output validation, process/DLQ auth parity, structured logging, fail-closed health evidence, Nitro `~~/` aliases, and absence of frontend/server import leakage.
- The final exact-file test, lint, type, whitespace, scope, and staged-index checks are recorded in the commit handoff. No Task 6 path is included in the Task 9 staged set.

## Remaining Integration Concerns

1. The default process/replay and DLQ recorder dependencies deliberately return 503. A downstream provider-lifecycle task must inject the durable reservation/operation adapters; Task 9 does not invent database or provider behavior.
2. Task 10 must import this exact shared signer/protocol, expose the Worker's observed SHA/artifact/binding/protocol evidence, and compare it with the Pages health contract before becoming ready.
3. Queue retention, individual `ack()`/`retry()`, concrete bindings, and real runtime deployment health remain Task 10/resource-manifest responsibilities; no Cloudflare resource or network verification occurred in Task 9.
4. Mocked/standalone gates do not satisfy the approved design's later isolated non-production end-to-end release evidence requirement.

## Review 1 — Machine Route Boundary Hardening

### Review Result

- Status: `PASS` for the requested Task 9 review corrections.
- Intended review commit: `fix(crm-search): harden machine route boundaries`.
- Expanded scope is limited to the existing Task 9 protocol/signing/endpoints/tests, the global staff-auth middleware, one full middleware-chain regression suite, and this report. Concurrent Task 6 and Task 8 paths were not edited, staged, or inspected.

### Strict RED Evidence

The review regressions were added before the production fixes. The first focused run produced 8 expected failures across the three affected suites:

- all three exact CRM machine routes were pre-empted by the staff-session middleware instead of reaching their inline HMAC/release-evidence guards;
- a valid signed body with actual `EF BB BF` wire bytes prepended was accepted because the default `TextDecoder` consumed the UTF-8 BOM before the body digest was checked;
- process and dead-letter dependency outcomes with a custom prototype and inherited `toJSON` were accepted, allowing attacker-controlled serialization behavior to cross the handler boundary; and
- valid dependency outcomes were returned by reference instead of being projected to a new status-only response.

The initial full Nuxt typecheck after the runtime fixes also supplied compile-time RED evidence: the exact-route set was inferred as a literal union incompatible with the middleware's arbitrary string pathname, and Zod's full-project inference left the validated signer path optional. Both diagnostics were corrected without relaxing runtime validation.

### Implemented Corrections

- `auth.ts` exempts only the three shared exact path constants for process, dead-letter, and health. No CRM prefix is public: sibling, suffix, trailing-slash, and similarly named paths continue to the normal staff-auth 401 boundary. The full-chain suite invokes the real middleware and real Task 9 handlers, proving that process and DLQ reach and fail their HMAC guards while health reaches its fail-closed release proof.
- The bounded request reader now configures `TextDecoder` with `ignoreBOM: true`, which preserves a leading U+FEFF instead of stripping its `EF BB BF` bytes. Digest verification therefore binds the exact valid UTF-8 wire representation; the prepended-BOM regression fails authentication before reservation or provider work.
- Process and DLQ outcomes must have `Object.prototype` or a null prototype, exactly one enumerable key, and an own data-property `status` with an allowed literal. Both new and replayed outcomes pass through the same projector and handlers return a fresh `{ status }`, so dependency prototypes, inherited `toJSON`, accessors, and extra enumerable fields cannot cross the response/log boundary.
- The signer now explicitly reasserts the exact service-path guard after Zod validation, resolving the full-project Zod inference mismatch while preserving the same two-path runtime allowlist.

### Fresh Review Verification

- Focused post-fix gate: 3 files, 28 tests passed.
- Final Task 9, MCP-signing, and impacted auth middleware regression gate: 12 files, 87 tests passed.
- Signing/MCP/full-chain compiler-fix regression gate: 3 files, 21 tests passed.
- Strict standalone TypeScript over the ten original Task 9 source/test modules: exit 0.
- Full Nuxt typecheck retains the repository's unrelated baseline (`typecheck` exit 2) but the changed Task 9/auth path filter emitted no diagnostics (`rg` exit 1, no matches) after the fixes.
- Node 24.18.0 ESLint over all Task 9 source/tests plus `auth.ts` and the new middleware-chain suite: exit 0.
- End-to-end reread and targeted scans confirmed exact-match auth behavior, exact body-byte binding, identical process/DLQ projection rules, privacy-safe status-only responses/logging, shared `~~/` server aliases, and no added database, provider, Queue, resource, outbound network, deployment, or cron-secret shortcut behavior.
