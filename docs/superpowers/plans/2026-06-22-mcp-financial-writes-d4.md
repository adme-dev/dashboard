# Financial Writes over MCP (#3 · D4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the 6 existing financial propose-tools to external AI hosts over MCP — confirm-tier, behind an independent flag, with rich_confirm `ack` enforced on the money-movers.

**Architecture:** Extend the existing 2c write mechanism in `server/utils/ai/mcp/writeTools.ts` (a parallel `MCP_FINANCIAL_ACTIONS` set + a financial branch in `executeWriteConfirm`) and wire it into `internal/mcp/{tools,call}.post.ts` behind `MCP_FINANCIAL_TOOLS_ENABLED`. The executors already exist and are registered (`executors/index.ts`); MCP confirm dispatches to them. No new files, no migration.

**Tech Stack:** Nitro, Zod, Vitest. Spec: `docs/superpowers/specs/2026-06-22-mcp-financial-writes-d4-design.md` (read §2 table + §4 mechanism + §8 map).

## Global Constraints
- **The 6 actions + permissions (each re-checked):** `propose_budget_change` (MEDIA_BUYING), `propose_eom_generate` (ADMIN), `propose_expense_approval` (FINANCE), `propose_quote` (MANAGEMENT), `propose_expense_classify` (FINANCE), `propose_budget_alert` (ADMIN).
- **Money-movers (MCP enforces `ack:true` regardless of executor tier):** `propose_budget_change`, `propose_eom_generate`, `propose_expense_approval`. The low-blast three do NOT require ack.
- **Independent flag `MCP_FINANCIAL_TOOLS_ENABLED`** (default `"false"`), separate from `MCP_WRITE_TOOLS_ENABLED`. A financial action must NEVER be projected or confirmed unless the financial flag is on — even if the 2c write flag is on.
- **Reuse the existing 2c machinery** (mirror `MCP_WRITE_SAFE_ACTIONS`/`projectWriteTools`/`executeWriteConfirm`). The 2c safe-set (`isSafeAction`) stays unchanged — financial is its own parallel branch. Executors dispatched via the existing `getExecutor`.
- **Audit `source='mcp'`; rate-limit** the financial proposes (add to the `call.post.ts` `rateLimited` set). Atomic single-use claim unchanged.
- **Imports** `~~/server/...`; pure logic in `writeTools.ts` is unit-tested; never throw to caller (typed outcomes).
- **Test commands:** `npx vitest run test/ai/mcpWriteTools.test.ts`; suite `npx vitest run test/ai/`.

---

### Task 1: `writeTools.ts` — financial set, projection, confirm branch

**Files:**
- Modify: `server/utils/ai/mcp/writeTools.ts`
- Test: `test/ai/mcpWriteTools.test.ts` (extend — add a `describe('financial actions over MCP')`)

**Interfaces produced:**
- `const MCP_FINANCIAL_ACTIONS = ['propose_budget_change','propose_eom_generate','propose_expense_approval','propose_quote','propose_expense_classify','propose_budget_alert'] as const`
- `const MCP_FINANCIAL_RICH_CONFIRM = ['propose_budget_change','propose_eom_generate','propose_expense_approval'] as const`
- `isFinancialAction(name: string): boolean`
- `projectFinancialTools(registryTools, role, enabled): McpToolManifest[]` (mirror `projectWriteTools`: empty unless enabled; the 6 financial proposers filtered by each tool's own `requiredPermission`; + `confirm_action`)
- `ConfirmDeps` gains `financialEnabled?: boolean`
- `executeWriteConfirm` handles a claimed financial `tool_name`: financial-flag gate → ack gate (money-movers) → executor permission re-check → dispatch.

- [ ] **Step 1: Write the failing tests** (extend `test/ai/mcpWriteTools.test.ts` — read the existing file first to match its `ConfirmDeps` test helpers):

```ts
// add to test/ai/mcpWriteTools.test.ts
import {
  MCP_FINANCIAL_ACTIONS, MCP_FINANCIAL_RICH_CONFIRM, isFinancialAction, projectFinancialTools,
} from '~~/server/utils/ai/mcp/writeTools'
// (executeWriteConfirm + ConfirmDeps already imported in the file)

describe('financial actions over MCP (#3 / D4)', () => {
  const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as any

  it('projectFinancialTools is empty unless the financial flag is on', () => {
    expect(projectFinancialTools(REGISTRY, 'owner', false)).toEqual([])
    const names = projectFinancialTools(REGISTRY, 'owner', true).map(t => t.name)
    for (const a of MCP_FINANCIAL_ACTIONS) expect(names).toContain(a)
    expect(names).toContain('confirm_action')
  })

  it('role-filters by each tool’s own permission (eom_generate is ADMIN-only)', () => {
    // a MEDIA_BUYING-only role (media_buyer) must NOT see eom_generate/expense_* (ADMIN/FINANCE) but may see budget_change
    const names = projectFinancialTools(REGISTRY, 'media_buyer', true).map(t => t.name)
    expect(names).toContain('propose_budget_change')
    expect(names).not.toContain('propose_eom_generate')
    expect(names).not.toContain('propose_expense_approval')
  })

  it('confirm forbids a financial action when financialEnabled is off (even if write flag on)', async () => {
    const deps = { enabled: true, writeEnabled: true, financialEnabled: false,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_quote', resolved_payload: {} }),
      getExecutor: vi.fn() } as any
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('forbidden')
    expect(deps.getExecutor).not.toHaveBeenCalled()
  })

  it('money-mover requires ack:true', async () => {
    const exec = { execute: vi.fn().mockResolvedValue({ resultRef: '1', summary: 'ok' }), riskTier: 'rich_confirm' }
    const deps = { enabled: true, financialEnabled: true,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_budget_change', resolved_payload: {} }),
      getExecutor: vi.fn().mockReturnValue(exec) } as any
    const noAck = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(noAck.ok).toBe(false); expect((noAck as any).code).toBe('confirm_required')
    const withAck = await executeWriteConfirm({ proposalId: 'prop12345', ack: true }, ctx, deps)
    expect(withAck.ok).toBe(true)
  })

  it('expense_approval (executor tier=confirm) STILL requires ack at the MCP boundary (money-mover)', async () => {
    const exec = { execute: vi.fn(), riskTier: 'confirm' } // executor is only 'confirm'
    const deps = { enabled: true, financialEnabled: true,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_expense_approval', resolved_payload: {} }),
      getExecutor: vi.fn().mockReturnValue(exec) } as any
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('confirm_required')
    expect(exec.execute).not.toHaveBeenCalled()
  })

  it('low-blast financial (expense_classify) dispatches without ack', async () => {
    const exec = { execute: vi.fn().mockResolvedValue({ resultRef: '1', summary: 'ok' }), riskTier: 'confirm' }
    const deps = { enabled: true, financialEnabled: true,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_expense_classify', resolved_payload: {} }),
      getExecutor: vi.fn().mockReturnValue(exec) } as any
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(r.ok).toBe(true); expect(exec.execute).toHaveBeenCalled()
  })

  it('isFinancialAction + rich-confirm set are correct', () => {
    expect(isFinancialAction('propose_quote')).toBe(true)
    expect(isFinancialAction('create_task')).toBe(false)
    expect([...MCP_FINANCIAL_RICH_CONFIRM]).toEqual(['propose_budget_change','propose_eom_generate','propose_expense_approval'])
  })
})
```
(`REGISTRY` = the assembled `registry` from `~~/server/utils/ai/tools/index`; import it if the test file doesn't already. Match the existing file's `vi`/import style.)

- [ ] **Step 2: Run → fail** — `npx vitest run test/ai/mcpWriteTools.test.ts` (new symbols missing).

- [ ] **Step 3: Implement** in `writeTools.ts` (READ the file; mirror `MCP_WRITE_SAFE_ACTIONS`/`projectWriteTools`/`isSafeAction`):
  - Add `MCP_FINANCIAL_ACTIONS`, `MCP_FINANCIAL_RICH_CONFIRM`, `isFinancialAction(name)`.
  - `projectFinancialTools(registryTools, role, enabled)`: copy `projectWriteTools` but over `MCP_FINANCIAL_ACTIONS`; gate on `enabled`; filter each by its own `requiredPermission` via `filterToolsForUser`; map to `mcpProposeName` manifests + the shared `confirm_action` entry.
  - `ConfirmDeps`: add `financialEnabled?: boolean`.
  - In `executeWriteConfirm`, after the existing video/banner dispatch hooks and BEFORE (or beside) the 2c `writeEnabled`/`isSafeAction` branch, add: if `isFinancialAction(row.tool_name)` → if `!deps.financialEnabled` return `forbidden`; look up `getExecutor`; if `null` return `not_found`; if `row.tool_name` ∈ `MCP_FINANCIAL_RICH_CONFIRM` AND `!ack` return `confirm_required` (independent of `ex.riskTier`); also keep the existing `ex.riskTier === 'rich_confirm' && !ack` check (covers executor-tier rich_confirm); permission re-check (`ex.requiredPermission`); then `ex.execute(...)`. Return BEFORE the 2c safe-action branch so financial never falls through to it. The 2c `isSafeAction` set is unchanged.

- [ ] **Step 4: Run → pass** — `npx vitest run test/ai/mcpWriteTools.test.ts`.

- [ ] **Step 5: Commit** — `git add server/utils/ai/mcp/writeTools.ts test/ai/mcpWriteTools.test.ts && git commit -m "feat(mcp): financial action set + projection + confirm branch (#3/D4)"`

---

### Task 2: Wire into the MCP endpoints + flag + propose path

**Files:**
- Modify: `server/api/internal/mcp/tools.post.ts` (financial manifest, flag)
- Modify: `server/api/internal/mcp/call.post.ts` (route financial propose; `financialEnabled` into confirm deps; rate-limit; confirm_action gate)
- Modify: `wrangler.toml` (`MCP_FINANCIAL_TOOLS_ENABLED = "false"`)
- Test: `test/ai/mcpFinancialWiring.test.ts` (or extend an existing internal-mcp test)

**Interfaces:** consumes Task 1 (`projectFinancialTools`, `isFinancialAction`, `MCP_FINANCIAL_ACTIONS`).

- [ ] **Step 1: Write the failing test** — assert the propose-routing + flag seam at whatever layer the existing internal-mcp tests target (READ `test/ai/mcpProject.test.ts` / any `call.post`/`tools.post` test to match the harness). At minimum, a pure assertion that `tools.post`'s manifest builder includes the financial tools only when `MCP_FINANCIAL_TOOLS_ENABLED` is set. If the endpoints aren't unit-harnessed, add a focused test importing the manifest-assembly helper. Expected: FAIL initially.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Wire** (READ the current files + mirror how the 2c write tools + video tools are wired):
  - `tools.post.ts`: `const financialEnabled = process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true'`; add `...projectFinancialTools(registry, role, financialEnabled)` to the manifest (mirror the `projectWriteTools`/`projectVideoTools` lines). Dedupe by name handles the shared `confirm_action`.
  - `call.post.ts`: route a financial `propose_*` (use `isFinancialAction` / a `resolveFinancialProposeAction`) the SAME way 2c propose is executed today (run the registry tool's handler / the existing propose path), gated on `financialEnabled`; pass `financialEnabled` into the `executeWriteConfirm` deps; extend the `confirm_action`-offered condition to include `financialEnabled`; add the 6 financial `propose_*` names to the `rateLimited` set + the audit `names[]`.
  - `wrangler.toml`: add `MCP_FINANCIAL_TOOLS_ENABLED = "false"` to `[vars]`.

- [ ] **Step 4: Run → pass** + full suite — `npx vitest run test/ai/mcpFinancialWiring.test.ts` then `npx vitest run test/ai/` (all green; verify mcpWriteTools, mcpVideoTools, mcpProject, registry.assembly unaffected).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(mcp): wire financial tools into internal MCP endpoints + flag (#3/D4)"`

---

## Self-Review
**Spec coverage:** §2 6 actions + per-tool permission → Task 1 projection (role-filter) + Task 2 wiring; §3 independent flag → Task 1 `projectFinancialTools(enabled)` + Task 2 `financialEnabled`/`MCP_FINANCIAL_TOOLS_ENABLED`; §4 mechanism (set/projection/confirm branch/ack on money-movers/expense_approval elevation) → Task 1 (the expense_approval-still-needs-ack test pins it); §4 wiring + rate-limit → Task 2; §5 security (independent gate, ack, per-tool perm, audit, rate-limit) → Tasks 1+2 tests; §6 testing → both tasks; §7 no migration → none. ✓
**Placeholders:** Task 2 Step 1 references "match the existing internal-mcp test harness" because the test layer must match what exists — the implementer reads it; the assertions are specified. Task 1 has complete test + implementation guidance against the named mirror functions. No TBD.
**Type consistency:** `MCP_FINANCIAL_ACTIONS`/`MCP_FINANCIAL_RICH_CONFIRM`/`isFinancialAction`/`projectFinancialTools`/`financialEnabled` consistent across Tasks 1↔2; confirm codes (`forbidden`/`confirm_required`/`not_found`) reuse the existing `WriteConfirmOutcome` union.

## Execution Handoff
Pick an execution approach (see end of message).
