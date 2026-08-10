# Task 14 Report — Authorized Agency AI CRM Assist

## Result

Task 14 is complete. The `search_crm` AI tool now resolves fresh server-owned agency-AI authority and calls the shared Task 13 retrieval coordinator directly. It no longer has a separate keyword-array execution contract or any internal HTTP hop. Keyword, assist, privacy, and semantic fallback outcomes all map to the same recoverable compact `ToolResult` boundary.

## Implemented Trust Boundary

- Normalizes and bounds the client selector and query before authority or retrieval work.
- Passes only the normalized selector plus the fixed `agency_ai` surface to the fresh resolver.
- Requires the resolved actor to match the authenticated `ToolContext.userId`, current `CLIENTS` permission, `staff` actor type, `agency_ai` surface, and a non-empty fresh assistant assignment containing the selected client.
- Does not accept model-supplied organisation or client authority fields; the strict tool schema rejects them and the direct handler never projects them into retrieval input.
- Creates retrieval dependencies from the authenticated H3 event only after resolution succeeds, then invokes `retrieveCrm` directly with the canonical `CrmSearchContext`.
- Projects only client name plus current authorized result `type`, `id`, `title`, and `subtitle`; rank, score, fallback reason, and provider metadata never enter serialized tool output.
- Converts primary keyword/storage failures to a generic recoverable `ToolResult` without echoing query, table, provider, or scope details.

Portal behavior and the shared `ToolContext` signature remain unchanged.

## Authorization Inventory Repair

The canonical record-access inventory now explicitly classifies all 35 Task 7–13 CRM search retrieval, indexing, repository, and cron services discovered by the existing filesystem scan. No search module was blanket-excluded. A focused drift test dynamically discovers search-indexing/retrieval services and fails if any future module lacks an explicit reviewed inventory entry.

## Strict TDD Evidence

### Direct Assist RED → GREEN

The initial three Task 14 suites failed 17 cases against the keyword-only adapter. Failures proved the missing direct retrieval result mapping, fixed `agency_ai` resolver input, pre-resolution normalized bounds, uniform non-disclosing resolution result, authenticated-event dependency creation, and fresh assignment/context checks. The minimal direct adapter then made all three suites green.

### Inventory RED → GREEN

The inventory regression initially reported exactly 35 unclassified Task 7–13 search services. After adding the focused future-drift assertion and explicit reviewed entries, the inventory suite passed all 9 cases.

### Normalized Admission RED → GREEN

A schema regression proved that pre-normalization length checks could accept NFKC-expanding selector/query input and reject raw control-heavy input whose normalized query is safely bounded. Schema admission now uses the canonical normalizers; the regression is green.

## Verification

Fresh verification ran on HEAD `a3e9dbfd54c823f5b5004a34423486f960399564` with the coordinated Task 13 review fixes present but excluded from Task 14 staging:

- Frozen Task 14/AI/retrieval/context/inventory gate: 10 files passed, 159 tests passed, 0 failed. The count is two above the earlier frozen 157 because the coordinated Task 13 review added two regression cases.
- Normal ESLint: Task 14 tool source, three AI tests, and the inventory test passed with zero diagnostics.
- Inventory manifest lint: zero non-baseline diagnostics when disabling only its pre-existing generated-snapshot quote/comma/member-style rules.
- Strict TypeScript overlay: `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` reported zero diagnostics for all six Task 14/inventory implementation/test paths. The full generated program still exits on established unrelated repository baseline diagnostics.
- `git diff --check` and exact-path staged audits passed before commit.

## Deep Review

Every one of the six owned implementation/test paths was reread end-to-end. The five-axis review found no required correctness, readability, architecture, security, or performance changes. The direct dependency direction remains server-only, provider results remain subordinate to Task 13 Postgres join-back, inputs are bounded, outputs are explicitly projected, and no network client, SQL construction, secret, or unbounded result path was introduced.

## External-State Boundary

No external provider, network, database, migration, deployment, or production action was performed. Assist remains governed by the existing fail-closed analytics, infrastructure, policy, budget, evaluation, and rollout gates.
