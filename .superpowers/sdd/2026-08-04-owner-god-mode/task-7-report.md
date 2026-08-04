# Task 7 Report — Complete Owner MCP Registry

## Outcome

Implemented a single authoritative MCP suite registry and projected the complete registered tool union for a freshly verified active owner. Ordinary users retain the legacy role-, flag-, and signed-scope-governed manifest exactly, including manifest order and descriptions.

Commit: `feat(mcp): expose complete owner tool registry` (the commit containing this report)

## Registry and inventory

- `registeredMcpSuites` is the sole suite assembly list.
- Registered suite keys, in legacy ordinary-output order: `catalog`, `generation`, `writes`, `video-media`, `banners`, `finance`.
- The catalog suite projects the injected base `AiTool` registry automatically; future base registrations require no MCP allowlist edit.
- Current measured inventory: 44 base `AiTool` entries; 62 projected owner manifests; 62 unique names.
- The owner union includes representative core reads, generation, writes, finance, social publishing, banner, video/media, administration, and synthetic future-suite tools.
- Every exported `*McpSuite` projector is registered exactly once, and every exported lower-level `project*Tools` projector is inventoried exactly once by its suite.
- JSON Schemas are checked for JSON serializability and semantic validity before discovery. Identical duplicate definitions deduplicate deterministically; conflicting definitions fail closed.

## Authority and governance behavior

- Active owner discovery requires the existing service-enable gate, service secret, exact consumed signed claim, and a fresh runtime-branded `GodModeAuthority` for the same actor.
- Only an active owner bypasses suite flags, role/permission projection, and read-only OAuth scope narrowing.
- Ordinary projection uses only `claim.scope`; unsigned scope headers cannot expand discovery.
- Owner discovery audits the controls actually bypassed. `mcp_scope` is recorded only when write-scope enforcement denied the signed claim, and `mcp_suite_flag` only when at least one suite flag was off.
- `tools/list` writes `attempt` before projection and a `succeeded` or `failed` terminal after it. Projection failures and terminal-audit persistence failures both block the manifest with a generic 503; terminal-audit failures have their own outcome code.
- Provider/service availability, tenant/provider ownership, schema validation, idempotency, and execution audit remain hard execution boundaries.
- `/api/agency/ai/mcp/my-tools` now resolves fresh authority. Active owners see the same internal complete union; ordinary staff retain the legacy read-only response shape and exact tools.

## TDD evidence

RED was established before implementation:

- Initial Task 7 suite: two failing files — missing authoritative registry suite and owner `my-tools` authority projection; 91 pre-existing assertions remained green.
- Invalid-schema contract: 1 failing assertion proved malformed registered schemas were initially accepted.
- Ordinary endpoint centralization contract: 1 failing assertion proved `my-tools` still called the legacy projector directly.

GREEN after implementation and self-review:

- Focused Task 7 suite: 8 files passed, 123 tests passed.
- Broader MCP/God-mode authority regression suite: 26 files passed, 239 tests passed.
- Worker request-claim runtime compatibility: 1 file passed, 1 test passed. The sandboxed run could not bind localhost (`listen EPERM`); the identical approved local-listener run passed.
- Inventory probe: 44 base tools, 6 registered suites, 62 projected tools, 62 unique names.
- `git diff --check`: passed.
- Project-wide `pnpm run typecheck`: still exits 2 on the repository's inherited TypeScript baseline. A fresh filtered run emitted zero diagnostics for every Task 7 production and test path.

## Compatibility and security review

- Added an exact ordinary-manifest regression comparing the centralized projection with the prior assembly order, descriptions, and first-emitted `confirm_action` definition.
- Canonical confirmation manifests are coordinated per projection so ordinary output remains legacy-compatible while owner duplicates are byte-equivalent.
- Re-read every changed production and test file, checked server aliases, authority provenance, signed-scope provenance, bypass auditing, projection/audit ordering, duplicate conflicts, schema validation, and fail-closed error handling.
- No forms, migrations, secrets, external writes, deployment, or unrelated application features were touched.

## Review fix round 1/5 — manifest/execution parity

Resolved every round-one review finding:

- Extended each registered suite with an execution resolver. The owner catalog now validates 62 projected manifests against exactly 62 unique executable descriptors, including schema equality; missing, extra, or conflicting resolvers fail closed before discovery.
- Kept base, finance, social, and administration `AiTool` mutations on the Task 5 coordinator. Write aliases resolve deterministically to canonical operations while retaining the advertised alias as immutable audit identity.
- Connected generation, video/media, and banner descriptors to their real runner/dependency factories. Supplemental mutations use a new execution-ledger coordinator that persists attempt and applicable bypass audit before schema, tenant/client scope, handler, provider, or pending-action claim; terminal audit and ledger state are coordinated afterward.
- Retained `confirm_action` with a real owner-audited execution path. It atomically claims existing actor-owned `source='mcp'` pending actions and dispatches write, finance, video, and banner confirmations through their existing executors/provider boundaries.
- Active owners may execute mutations from a signed read-only claim when write-scope enforcement is active. `mcp_scope` is persisted in attempt, dedicated bypass, and terminal audit events before dispatch. Ordinary users still receive `insufficient_scope`.
- Runtime-froze the suite registry and changed synthetic tests to inject suite lists. A synthetic suite registered once with projection plus execution becomes both discoverable and executable without mutating global state.
- Replaced the hard-coded projector module list with filesystem discovery of every `*Tools.ts` export plus the base projector module. Omitted suite projectors or execution resolvers now fail the contract.
- Replaced test environment mutation with `vi.stubEnv`/`vi.unstubAllEnvs`, corrected the obsolete scope wording, and added explicit attempt-insert failure coverage proving projection/provider dispatch never starts.

Round-one TDD and verification evidence:

- RED: 17 expected failures (10 direct-execution routing/scope contracts and 7 registry parity/freeze/injection contracts).
- Focused execution/MCP suite: 12 files passed, 180 tests passed.
- Broad Task 4–7, MCP, audit, config, inventory, and authority suite: 45 files passed, 425 passed and 10 skipped.
- Worker request-claim runtime compatibility: 1 file passed, 1 test passed.
- Live inventory probe: 6 frozen suites, 62 manifests, 62 resolvers, 62 unique names on each side.
- Fresh changed-path typecheck filter: zero diagnostics; the project-wide inherited TypeScript baseline remains unchanged.
- `git diff --check`, credential-pattern scan, and final security/diff review passed before the scoped fix commit.

## Review fix round 2/5 — supplemental durability and durable memory writes

Resolved all three round-two findings:

- Supplemental owner mutations now persist `execution_phase='dispatched'` immediately before the
  registered handler/provider/queue boundary and persist a bounded reference, result digest, and
  supplemental metadata as `result_captured` immediately after a successful response. Any throw,
  typed rejection, or result-capture failure after `dispatched` becomes `ambiguous`; transport retry
  returns the reconciliation outcome and never invokes the handler again. Definitive schema, scope,
  provider-preflight, and dispatch-checkpoint failures remain pre-dispatch `failed` outcomes.
- Reconciliation leaves dispatched supplemental operations unknown and alertable when no bounded
  provider result exists. Captured music job references are checked against the durable audio-asset
  record; a missing job remains unknown rather than being falsely closed as succeeded or failed.
- `remember` is now explicitly classified as a mutation and as a local-transactional direct mutation.
  Ordinary read-only signed claims neither discover nor execute it. An active owner with a signed
  read-only claim may execute it only through the owner coordinator, with `mcp_scope` present in the
  attempt/bypass/terminal audit identity before the write. Ordinary write-scoped MCP calls use an
  atomic transaction containing the idempotency claim, memory upsert, `ai_action_audit` insert, and
  terminal ledger update. Audit failure rolls back the memory; retry commits one durable row, and a
  completed retry replays without reinforcing or duplicating it. Vector indexing is intentionally
  omitted inside that transaction so a rollback cannot publish an orphan vector.
- Music generation now has a registered queue-provider preflight. A missing or structurally invalid
  `MUSIC_QUEUE` binding produces bounded `provider_unavailable` / HTTP 503 before the dispatched
  checkpoint and a failed terminal audit. The real runner also throws fail-closed if invoked without
  the binding; it can no longer return a successful `{ status: 'unavailable' }` payload. With a valid
  producer, dispatch and result capture proceed in order.
- The frozen registry remains six suites with exactly 62 owner manifests and 62 unique executable
  resolvers. The `remember` manifest changes execution strategy, not catalog cardinality; ordinary
  manifest compatibility changes only for its correct write-scope classification.

Round-two TDD evidence:

- Primary RED: 13 expected failures across six files while 93 assertions stayed green.
- Subsequent RED slices covered ordinary-memory atomic idempotency (3 failures), bounded music lookup
  (1), write-scoped ordinary discovery (1), missing local transaction handler (1), transactional
  vector suppression (1), and malformed queue binding preflight (1) before each implementation.

Round-two verification evidence:

- Final focused durability/scope/registry/audio suite: 13 files passed, 160 tests passed.
- Broad MCP, God-mode, config, inventory, authority, and audit suite: 34 files passed, 361 passed and
  10 environment-gated tests skipped.
- Adjacent God-mode middleware/audit suite: 9 files passed, 89 tests passed.
- Worker MCP authority unit suite: 1 file passed, 5 tests passed. Audio queue regressions: 2 files
  passed, 7 tests passed.
- Full Node 24 typecheck retains the inherited repository baseline; the fresh changed-path filter
  emitted zero diagnostics after the final fixes.
- `git diff --check`, credential-pattern scan, and final source/security review passed.
- The real workerd signer/verifier compatibility command could not be refreshed in this sandbox: the
  local-listener run did not return and was interrupted. Exact controller command:
  `pnpm exec vitest run test/workers/mcpRequestClaimRuntimeCompatibility.test.ts`.
- No migration, external secret, deployment, or unrelated application change was performed.
