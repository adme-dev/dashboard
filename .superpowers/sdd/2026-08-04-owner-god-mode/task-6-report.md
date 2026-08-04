# Task 6 — Signed, Unique MCP Request Authority

## Status

Complete. Worker→Pages `tools/list` and `tools/call` requests now require the independent internal
service secret plus a short-lived HMAC-signed, one-time exact-request claim. Pages verifies every claim
binding, freshly resolves current owner authority, and atomically consumes the nonce before any tool
projection or execution. OAuth identity assertions remain required and cannot carry a client-supplied
God-mode bit.

## Files changed

- `shared/utils/mcpRequestClaim.ts`
- `server/utils/ai/mcp/requestClaim.ts`
- `server/api/internal/mcp/exchange.post.ts`
- `server/api/internal/mcp/tools.post.ts`
- `server/api/internal/mcp/call.post.ts`
- `workers/mcp-server/src/index.ts`
- `workers/mcp-server/wrangler.toml`
- `wrangler.toml`
- `workers/mcp-server/DEPLOYMENT.md`
- `docs/mcp-server-guide.md`
- `test/ai/mcpAssertion.test.ts`
- `test/ai/mcpRequestClaim.test.ts`
- `test/server/api/internalMcpAuthorityEndpoints.test.ts`
- `test/workers/mcpServerRequestAuthority.test.ts`
- `test/config/mcpRequestSigningContract.test.ts`
- `test/config/godModeGateInventory.test.ts` — refreshed only for the new signing-secret boundary and
  the two required `user_role AS role` query corrections.

`server/utils/ai/mcp/assertion.ts` intentionally remains identity-and-scope-only. Its new regression test
proves an attempted caller God-mode option is neither serialized nor returned.

## TDD evidence

### RED

All production behavior was preceded by an observed failure:

1. The required assertion/claim command failed one new suite because the shared claim module did not
   exist; all eight existing OAuth assertion tests still passed.
2. Internal endpoint RED produced three intended failures out of four tests: exchange omitted fresh
   owner state, tools/list trusted an unsigned write-scope header, and tools/call trusted that header.
   The independent service-secret-before-claim control already passed.
3. Worker RED produced three intended failures out of three: manifest authority was cached at `init`,
   call bodies had no stable protocol idempotency key, and OAuth props lacked exchange-derived owner
   evidence plus a stable OAuth session identity.
4. Config RED failed because `MCP_REQUEST_SIGNING_SECRET` was absent first from Worker/Pages deployment
   documentation and then from the root Pages config contract.
5. A final boundary RED proved a timestamp/JTI-like idempotency string still reached execution. Pages now
   rejects anything outside `mcp:<64 lowercase hex>` before claim consumption.

### GREEN

- Complete MCP-focused suite: 18 files, 159 tests passed before the final idempotency-format regression;
  the final fresh run is recorded below.
- All Worker/config tests: 210 files passed, 1 skipped; 966 tests passed, 12 environment-gated tests
  skipped; 0 failed. The first sandboxed run exposed one expected gate-inventory update and one unrelated
  `tsx` IPC `EPERM`; the inventory was updated and the exact suite passed outside the sandbox.
- Standalone Worker isolated compile: TypeScript exited 0.
- Standalone Worker Wrangler dry-run: exit 0; 2,196.79 KiB upload / 390.29 KiB gzip.
- Root Node 24 Nuxt typecheck: exit 0. A redundant type re-export warning found by this run was removed;
  the final fresh run is recorded below.

## Claim canonicalization and cryptographic decisions

- The shared module contains only runtime-neutral Web Crypto, UTF-8/base64url encoding, deterministic
  JSON, request-body SHA-256, claim HMAC, schema validation, and logical-idempotency derivation. It has no
  Node crypto, H3, database, environment, or logging dependency and is bundled unchanged into Worker and
  Nitro runtimes.
- Canonical JSON recursively sorts object keys, preserves array order, follows JSON omission/null rules,
  rejects BigInt, and normalizes scopes to the supported `mcp:read`, `mcp:write` order. Body digests are
  lowercase SHA-256 hex over that canonical byte representation.
- Claims use Web Crypto HMAC-SHA-256 with a 30-second default and hard 60-second maximum. JTI defaults to
  `crypto.randomUUID()` and is schema-validated as a UUID. Verification uses `subtle.verify`, validates an
  exact allowlisted object shape, rejects extra fields, unknown/duplicate scopes, malformed digests,
  unsupported paths/method/audience, missing tool/JTI, expiry, and excessive future lifetime.
- Each claim binds `uid`, sole signed scopes, exchange owner-evidence bit, JTI, expiry, exact audience,
  `POST`, exact internal path, exact call tool when present, and canonical body digest. The call body also
  contains the separately stable logical idempotency key, so argument/key substitution changes the digest.

## Stable MCP logical idempotency

The installed MCP SDK exposes `extra.requestId` to `CallToolRequestSchema` handlers, so no Durable Object
fallback ledger is needed. The Worker mints one cryptographically random `oauthSessionId` when Pages has
validated the OAuth assertion and persists it in OAuth token `Props`. The logical operation key is:

`mcp:` + SHA-256(canonical JSON `{ oauthSessionId, protocolRequestId }`)

Transport retries for the same OAuth grant and JSON-RPC request ID retain exactly one operation key while
every Worker→Pages attempt receives a new random JTI. No timestamp, random fallback, or one-time JTI is
used as logical operation identity. OAuth tokens predating `oauthSessionId` fail closed and must reconnect.

## Endpoint validation and authority ordering

Both `tools.post.ts` and `call.post.ts` now order the boundary as follows:

1. `MCP_SERVER_ENABLED` and `x-mcp-secret === MCP_INTERNAL_SECRET`;
2. bounded required body identity/tool/idempotency fields;
3. signed claim HMAC/schema/expiry;
4. exact audience, method, path, subject, tool, canonical body digest, and transitional scope-header match;
5. fresh `resolveGodModeAuthority(event, exactSubject)`;
6. reject signed `godMode: true` if current branded active-owner authority is absent;
7. atomic `INSERT ... ON CONFLICT DO NOTHING` into `god_mode_mcp_request_nonces`;
8. only then query/project tools or rate-limit/resolve/execute the call.

Every mismatch before step 7 consumes no nonce. Replay returns 409. Database/replay-protection failure
returns a bounded 503. A current owner with stale signed `godMode: false` receives the fresh branded owner
authority stored in trusted request context; signed true after downgrade rejects before nonce consumption.
The claim scope is the sole scope authority. A retained `x-mcp-scope` must token-for-token match it and can
never add write access. Both role queries now correctly select `team_members.user_role AS role`.

## Worker, config, and documentation

- `init()` registers protocol handlers without fetching a manifest. Every tools/list handler performs a
  new signed Pages fetch, producing fresh database authority and a unique nonce.
- Every tools/call handler uses the SDK JSON-RPC request ID and OAuth session identity for stable logical
  idempotency, then signs the exact completed body and tool name.
- Exchange returns only server-resolved owner evidence for the verified OAuth assertion subject. Callback
  query/body values cannot set it.
- Worker and root Pages Wrangler configs require `MCP_REQUEST_SIGNING_SECRET` as a secret name without a
  value. Deployment instructions copy the shared module into the isolated build, use the pinned package's
  existing legacy-peer install requirement, and describe coordinated secret rotation without printing it.
- Operator/deployment docs distinguish ordinary role/scope/suite/proposal-confirmation behavior from
  freshly revalidated owner direct writes. They retain authentication, tenant/client, validation,
  provider, idempotency, and immutable-audit boundaries.

## Secret and log review

- No production code logs or serializes the service secret, signing secret, or full signed claim.
- No snapshot contains a claim or secret. Test constants are explicitly fake; endpoint fixtures use the
  literal redacted placeholder `signed-request-claim-redacted`.
- Audit behavior remains bounded to existing arg-key metadata. This task does not add claim/body/audit
  persistence.

## Self-review

- Re-read every modified and new file end-to-end and reviewed the complete diff.
- Confirmed server imports use `~~/`, shared code is environment-independent, and Worker relative imports
  compile in the documented isolated directory layout.
- Confirmed service-secret failure occurs before claim verification; all request binding and fresh
  authority checks occur before nonce consumption; nonce consumption occurs before projection/execution.
- Confirmed replay, cross-user, cross-path, cross-tool, changed-body, changed-scope, forged, malformed,
  expired, missing-JTI, downgrade, stale-false/current-owner, and unsigned-header cases are covered.
- Confirmed ordinary-user scope and proposal/confirmation paths are unchanged after the new transport
  boundary, and Task 5 owner execution code was not modified.
- Confirmed no browser forms/UI, migration, external deployment, database mutation, or production secret
  operation was in scope.

## Concerns and rollout notes

- The standalone package's existing `agents@0.16.2` peer tree requires `npm install --legacy-peer-deps`;
  the deployment guide now uses the command verified by this task.
- This commit must be deployed Worker-first from the documented shared-layout copy, with both Worker and
  Pages secret names configured, then Pages. Pre-`oauthSessionId` connectors must reconnect.
- Production secret configuration and live owner/ordinary smoke tests remain deployment-gate work; no
  secret was read, set, or printed during this task.

## Commit

- Scoped commit: `feat(mcp): sign and revalidate owner requests`

## Final verification

- Required assertion/claim suite: 2 files, 16 tests passed, 0 failed.
- Complete MCP-focused suite: 18 files, 160 tests passed, 0 failed.
- All Worker/config tests: 210 files passed, 1 skipped; 966 tests passed, 12 skipped, 0 failed.
- Root Node 24 `pnpm typecheck`: exit 0 with no diagnostics or duplicate-import warnings.
- Exact standalone Worker source: isolated TypeScript exit 0; Wrangler dry-run exit 0 at 2,196.79 KiB
  upload / 390.29 KiB gzip.
- Final `git diff --check`, secret/log scan, staged diff review, and commit SHA are reported in the
  controller handoff after this report is included in the scoped commit.
