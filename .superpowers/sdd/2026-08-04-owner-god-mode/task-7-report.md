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
