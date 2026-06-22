# Design — Financial writes over MCP (#3 · D4 resolved)

**Date:** 2026-06-22 · **Status:** design (awaiting review) · **Owner:** agent build
**Roadmap:** sub-project **#3** of "build the other missing MCPs". Final piece. **D4 decision: YES — all 6 financial
proposers over MCP, hardened (rich_confirm on the money-movers).**

## 1. Goal & context
Expose the 6 financial propose-tools (currently in the in-app agent registry but **excluded from MCP** by decision D4)
to external AI hosts over MCP, **confirm-tier**, with extra hardening on the money-movers. Nothing executes until a human
confirms; the money-movers additionally require an explicit `ack`. This mirrors the existing 2c write mechanism
(`writeTools.ts`) — the executors **already exist and are registered** (`server/utils/ai/executors/index.ts`), so MCP
confirm dispatches to the same code the in-app confirm uses. **No new files, no migration.**

> ⚠️ This is the highest-stakes MCP surface: external hosts can *propose* live ad-budget changes and client invoices.
> Every safeguard below is load-bearing. Build carefully; run the whole-branch review with budget to spare.

## 2. The 6 actions (verified permissions + tiers)
| Action | requiredPermission | Executor tier | MCP rich_confirm? |
|---|---|---|---|
| `propose_budget_change` (live Meta/Google ad budget) | MEDIA_BUYING | rich_confirm | **yes** (money-mover) |
| `propose_eom_generate` (client invoices in Xero) | ADMIN | rich_confirm | **yes** (money-mover) |
| `propose_expense_approval` | FINANCE | confirm | **yes** (money-mover — MCP elevates) |
| `propose_quote` | MANAGEMENT | confirm | no |
| `propose_expense_classify` | FINANCE | confirm | no |
| `propose_budget_alert` | ADMIN | confirm | no |

Each keeps its **own** `requiredPermission` (re-checked at projection AND confirm — same ceiling as in-app). Note
`expense_approval`'s executor is `confirm` tier, but D4 classes it a money-mover → the MCP layer enforces `ack` for it
regardless of executor tier (see §4).

## 3. Gating — a SEPARATE flag (critical for safe rollout)
New flag **`MCP_FINANCIAL_TOOLS_ENABLED`** (default off), **independent** of `MCP_WRITE_TOOLS_ENABLED`. Financial must be
flippable on its own — you can run 2c non-financial writes without ever enabling financial, and enable/disable financial
without touching the rest. Mirrors how `MCP_VIDEO_GEN_ENABLED` is separate from `MCP_VIDEO_TOOLS_ENABLED`.

## 4. Mechanism (extend `writeTools.ts` + wiring; no new files)
- **`MCP_FINANCIAL_ACTIONS`** (new const in `writeTools.ts`): the 6 action names above. `MCP_FINANCIAL_RICH_CONFIRM`
  (new const): `['propose_budget_change','propose_eom_generate','propose_expense_approval']`.
- **`projectFinancialTools(registryTools, role, enabled)`** (new, parallel to `projectWriteTools`): empty unless
  `enabled`; else the 6 financial proposers filtered by each tool's own `requiredPermission`, mapped to `propose_<action>`
  manifests + the shared `confirm_action`. (Description flags money-movers as requiring `ack:true`.)
- **`ConfirmDeps`** gains `financialEnabled?: boolean`. In `executeWriteConfirm`, after the existing video/banner dispatch
  hooks and the 2c `writeEnabled` gate, add a **financial path**: if `isFinancialAction(row.tool_name)` →
  require `deps.financialEnabled` (else `forbidden`); if the action is in `MCP_FINANCIAL_RICH_CONFIRM` require
  `ack:true` (else `confirm_required`) **regardless of executor tier**; then the existing executor permission re-check +
  `getExecutor(row.tool_name).execute(...)`. The 2c `isSafeAction` set stays unchanged (financial is its own branch).
- **Propose** reuses the same registry propose-handlers via the existing `executeWritePropose`-equivalent path
  (the financial proposers are normal `mutates` registry tools; `proposeAction(ctx, null, action, payload)` stamps
  `source='mcp'`). The 2c propose machinery already handles arbitrary safe/financial actions given the projected set —
  confirm whether `executeWritePropose` keys off `MCP_WRITE_SAFE_ACTIONS` (if so, generalize it to also accept the
  financial set when `financialEnabled`, or add a parallel `executeFinancialPropose`).
- **Wiring:** `tools.post.ts` adds `...projectFinancialTools(registry, role, financialEnabled)` (flag from
  `process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true'`); `call.post.ts` routes financial `propose_*` and passes
  `financialEnabled` into the `executeWriteConfirm` deps; `confirm_action` offered when financial is on too;
  `propose_*` financial actions added to the `rateLimited` set. `wrangler.toml`: `MCP_FINANCIAL_TOOLS_ENABLED = "false"`.

## 5. Security (load-bearing)
- Independent flag (off by default); per-tool `requiredPermission` re-checked at projection + confirm; money-movers
  require `ack:true` at the MCP boundary even if the executor is `confirm` tier; atomic single-use claim
  (`status='proposed' AND source='mcp' AND not expired`); audit row `source='mcp'`; rate-limited propose.
- The host only ever *proposes*; a human in the app confirms (and for money-movers, acks the rich card). No host can
  execute a financial action directly.
- Resolution runs server-side under the actor (never trusts host-supplied ids without a scoped re-resolve in the
  proposer's own handler — unchanged from in-app).

## 6. Testing (TDD — extra rigor for financial)
- Projection: financial set appears ONLY when `MCP_FINANCIAL_TOOLS_ENABLED`; each tool role-filtered by its own
  permission (e.g. an ADMIN-only `eom_generate` hidden from a MEDIA_BUYING-only actor); `confirm_action` present.
- Confirm: financial action with `financialEnabled=false` → `forbidden`; money-mover without `ack` → `confirm_required`;
  money-mover with `ack:true` → dispatches to the executor; low-blast financial with no ack → dispatches; a financial
  action is NEVER dispatched when only the 2c write flag (not financial) is on (independent-gate test).
- Audit `source='mcp'` stamped; rate-limit applies.
- Full `test/ai/` green.

## 7. Rollout (operator-gated; financial — extra caution)
No migration. Ships behind `MCP_FINANCIAL_TOOLS_ENABLED='false'`. **Never flip without explicit owner sign-off.** When
flipping: start in a controlled test (one low-blast action, e.g. `propose_quote`, from a Claude host → confirm in-app →
verify audit), then expand. Marketing/connector copy + `mcp-server-guide.md` note that external hosts can propose
financial actions (human-confirmed) once enabled.

## 8. Implementation map (validated signatures)
- Extend `server/utils/ai/mcp/writeTools.ts`: add `MCP_FINANCIAL_ACTIONS`, `MCP_FINANCIAL_RICH_CONFIRM`,
  `projectFinancialTools`, `isFinancialAction`; extend `ConfirmDeps` (`financialEnabled`) + the `executeWriteConfirm`
  branch (financial gate + ack enforcement, dispatch via existing `getExecutor`).
- Executors already registered: `server/utils/ai/executors/index.ts` (e.g. `quoteExecutor`, `proposeBudgetChange`,
  `financeActions` {expense_approval, eom_generate, expense_classify}, `proposeBudgetAlert`). Verify all 6 toolName keys
  are present in the executor index at build time.
- Wiring: `server/api/internal/mcp/tools.post.ts` (+financial manifest, flag), `call.post.ts` (route financial propose;
  `financialEnabled` into confirm deps; rate-limit; confirm_action gate). `wrangler.toml` `[vars]` += flag.
- Propose handlers: the 6 `propose*` tools in `server/utils/ai/tools/{proposeBudgetChange,proposeBudgetAlert,financeActions,crmActions}.ts` (unchanged — reused).
- RBAC per §2; flag per §3; tiers per §4.
