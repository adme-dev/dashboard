# PID: AI Model Ops Copilot

## Objective
Give admins an AI control-center assistant inside AI Model Ops that can explain runtime readiness, compare Cloudflare catalog models, recommend safer assignments, and draft assignment changes without silently changing production behavior.

The first production slice is deterministic and auditable: the Copilot reads the same assignment map, runtime routing metadata, Cloudflare catalog, and provider readiness used by the dashboard. It can propose a model assignment, but the admin must still apply the draft and press Save through the existing assignment endpoint.

## Source Notes
- Cloudflare AI model search is available through the account AI Models API at `GET /accounts/{account_id}/ai/models/search`.
- Cloudflare Think is the target durable chat runtime for later phases. The docs describe it as a stateful agent harness with streaming, tool calling, persistence, Durable Object SQLite, WebSocket client chat, and sub-agent RPC.
- This repository already uses Nuxt 4.3.1, Vue 3, `@nuxt/ui`, Vitest, and server API routes for Model Ops.

## User Stories
- As an admin, I can ask "what needs attention?" and receive prioritized Model Ops findings.
- As an admin, I can choose a feature and ask for a recommendation, then apply the suggested model to the editable draft.
- As an admin, I can see why a recommendation is safe or blocked before changing runtime behavior.
- As an operator, I can verify that no Copilot response directly mutates assignments.

## Scope
Included in this slice:
- PID and task checklist.
- Read-only `/api/admin/ai/model-ops/copilot` endpoint.
- Pure recommendation utility with deterministic output.
- Dashboard Copilot panel with prompt input, feature picker, findings, and draft assignment application.
- Aggregate telemetry context for error rate, fallback rate, gateway routing, missing coverage, and agent run failures.
- Focused server and page tests.

Deferred:
- Installing `@cloudflare/think`, `@cloudflare/ai-chat`, and `agents`.
- Durable Object backed long-running chat sessions.
- Write-capable Copilot tools that save assignments directly.
- Cross-page Copilot surfaces for Finance, Video Studio, Banner Studio, and voice chat.

## Interface Contract
`POST /api/admin/ai/model-ops/copilot`

Input:
```ts
{
  prompt: string
  featureKey?: string | null
}
```

Output:
```ts
{
  mode: 'read_only'
  answer: string
  findings: Array<{ severity: 'critical' | 'warning' | 'info', title: string, detail: string, featureKey?: string }>
  recommendedActions: string[]
  proposedAssignment: null | {
    featureKey: string
    provider: string
    modelId: string
    fallbackModelId: string | null
    notes: string
    rationale: string[]
  }
  context: {
    runtimeControllableCount: number
    overrideCount: number
    catalogSource: 'cloudflare_api' | 'local_registry'
    catalogAvailable: boolean
  }
}
```

## Task List
- [x] Document PID and rollout scope.
- [x] Add deterministic Model Ops Copilot analyzer.
- [x] Add read-only admin Copilot endpoint.
- [x] Add dashboard Copilot panel and draft-apply action.
- [x] Add aggregate telemetry context and prompt presets.
- [x] Add focused server utility, API, and Vue page tests.
- [ ] Later: move chat runtime to Cloudflare Think Worker with Durable Object storage.
- [ ] Later: add read-only Think tools for assignments, catalog, telemetry, Graphify, and agent runs.
- [ ] Later: add human-confirmed write tools after audit and undo controls are in place.

## Acceptance Criteria
- Copilot endpoint requires `admin` or `owner`.
- Copilot never writes to assignment tables.
- Proposed assignments only target runtime-controllable, editable features.
- Proposed assignments use catalog-backed assignable recommendations.
- UI apply action only updates the local assignment draft; Save remains the mutation step.
- Tests cover analyzer output, endpoint auth/shape, UI render, submit, and draft apply.

## Verification Commands
- `pnpm vitest run test/server/utils/modelOpsCopilot.test.ts test/server/utils/cloudflareModelCatalog.test.ts test/server/utils/aiModelAssignments.test.ts test/server/api/adminAiModelOps.test.ts test/app/adminModelOpsPage.test.ts`
- `pnpm exec vue-tsc --noEmit --skipLibCheck --project tsconfig.json`

Run the production build only after the development slice is fully finished.
