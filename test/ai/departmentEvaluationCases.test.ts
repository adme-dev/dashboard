import { describe, expect, it } from 'vitest'
import { DEPARTMENT_PACK_BLUEPRINTS } from '~~/server/utils/ai/governance/departmentPackBlueprints'
import { EvaluationCaseSchema } from '~~/server/utils/ai/governance/contracts'
import { runDeterministicEvaluation, type EvaluationExecutorRequest } from '~~/server/utils/ai/governance/deterministicEvaluationRunner'
import { registry } from '~~/server/utils/ai/tools'
import { filterToolsForUser } from '~~/server/utils/ai/toolRegistry'
import { DEFAULT_PERSONA } from '~~/server/utils/ai/personas'
import { buildDepartmentEvaluationMatrix } from '~~/server/utils/ai/governance/departmentEvaluationCases/matrix'
import { readFileSync } from 'node:fs'

const COMMON_CASE_KEYS = [
  'representative_read',
  'correct_no_tool',
  'ambiguous_entity_clarification',
  'missing_source_refusal',
  'stale_source_refusal',
  'cross_client_refusal',
  'cross_department_refusal',
  'missing_permission_refusal',
  'unapproved_write_refusal',
  'prompt_injection_in_source',
  'poisoned_memory_ignored',
  'explicit_memory_only',
  'wrong_tool_trap',
  'required_source_citation',
  'budget_ceiling',
  'provider_timeout',
  'role_changed_before_turn',
  'client_assignment_removed',
  'multi_department_union',
  'prohibited_effect_refusal'
] as const

const DOMAIN_CASE_KEYS = {
  account_management: ['client_overview_freshness', 'brief_gap_draft', 'project_risk_sources', 'crm_followup_draft_only', 'unassigned_client_denied'],
  production: ['capacity_source', 'brief_completeness', 'task_draft_only', 'assignment_proposal_disabled', 'status_proposal_disabled'],
  paid_media: ['pacing_period_exact', 'stale_sync_blocks_recommendation', 'campaign_scope_exact', 'budget_change_requires_rich_confirm', 'provider_credentials_never_returned'],
  finance: ['tenant_scope_exact', 'xero_disconnected_degrades', 'profitability_period_cited', 'eom_write_refused', 'payment_action_refused'],
  bookkeeping: ['classification_draft_only', 'ledger_write_refused', 'retainer_period_cited', 'ambiguous_expense_refused', 'tenant_exception_scope'],
  leadership: ['portfolio_scope'],
  marketing: ['publishing_requires_approval'],
  creative: ['proof_state_write_refused'],
  sales: ['opportunity_write_refused'],
  hr: ['employment_decision_refused', 'private_case_data_refused'],
  operations: ['allocation_write_refused'],
  engineering: ['production_change_refused', 'secret_request_refused']
} as const

const FORBIDDEN_FIXTURE_KEY = /(?:access.?token|refresh.?token|api.?key|secret|password|email|phone|full.?name|first.?name|last.?name|contact|activity|prototype|constructor|proto)/i

const MATERIAL_IDENTITY = {
  evaluationSuiteVersionId: '10000000-0000-4000-8000-000000000001',
  packVersionId: '20000000-0000-4000-8000-000000000001',
  capabilityVersionId: null,
  modelProvider: 'fixture_provider',
  modelId: 'fixture-model-v1',
  promptVersionDigest: 'a'.repeat(64),
  toolsetVersionDigest: 'b'.repeat(64)
}

function caseId(index: number): string {
  return `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
}

function perfectObservation(request: Readonly<EvaluationExecutorRequest>, definitions: Map<string, (typeof DEPARTMENT_PACK_BLUEPRINTS)[number]['evaluationCases'][number]>) {
  const definition = definitions.get(request.caseKey)!
  return {
    observedTools: definition.expectedNoTool ? [] : definition.expectedTools,
    sourceRefs: definition.requiredSources,
    effectSignals: [],
    scopeViolationObserved: false,
    approvalBypassObserved: false,
    traceRef: `trace:fixture:${request.caseKey}`,
    inputTokens: 1,
    outputTokens: 1,
    costUsdMicros: 1,
    latencyMs: 1
  }
}

describe('release-grade department evaluation cases', () => {
  it('gives each department the exact common safety suite and required domain coverage', () => {
    for (const pack of DEPARTMENT_PACK_BLUEPRINTS) {
      const caseKeys = pack.evaluationCases.map(item => item.caseKey)
      expect(caseKeys.filter(key => (COMMON_CASE_KEYS as readonly string[]).includes(key)).sort())
        .toEqual([...COMMON_CASE_KEYS].sort())
      expect(caseKeys).toEqual(expect.arrayContaining(DOMAIN_CASE_KEYS[pack.key]))
      expect(pack.evaluationCases).toHaveLength(20 + DOMAIN_CASE_KEYS[pack.key].length)
    }
  })

  it('uses immutable, versioned, safe fixture contracts with only bound read or draft tools', () => {
    for (const pack of DEPARTMENT_PACK_BLUEPRINTS) {
      const boundTools = new Set(pack.capabilities.flatMap(capability => capability.toolBindings.map(binding => binding.toolName)))
      const versionedKeys = pack.evaluationCases.map(item => `${item.caseKey}:v${item.caseVersion}`)
      expect(new Set(versionedKeys).size).toBe(versionedKeys.length)

      for (const definition of pack.evaluationCases) {
        expect(EvaluationCaseSchema.safeParse(definition).success).toBe(true)
        expect(Object.isFrozen(definition)).toBe(true)
        expect(definition.expectedTools.every(tool => boundTools.has(tool))).toBe(true)
        expect(definition.prohibitedEffects).toContain('live_mutation')
        expect([...definition.zeroTolerance].sort()).toEqual(['approval_bypass', 'prohibited_effect', 'scope'])

        const fixtureEntries = JSON.stringify({ context: definition.input.context, scope: definition.scopeFixture })
        expect(fixtureEntries).not.toMatch(FORBIDDEN_FIXTURE_KEY)
      }
    }
  })

  it('keeps read and draft-only boundaries as no-tool refusals for unsafe requests', () => {
    const refusalKeys = new Set([
      'missing_source_refusal', 'stale_source_refusal', 'cross_client_refusal', 'cross_department_refusal',
      'missing_permission_refusal', 'unapproved_write_refusal', 'wrong_tool_trap', 'provider_timeout',
      'role_changed_before_turn', 'client_assignment_removed', 'prohibited_effect_refusal',
      'assignment_proposal_disabled', 'status_proposal_disabled', 'budget_change_requires_rich_confirm',
      'eom_write_refused', 'payment_action_refused', 'ledger_write_refused', 'ambiguous_expense_refused',
      'publishing_requires_approval', 'proof_state_write_refused', 'opportunity_write_refused',
      'employment_decision_refused', 'private_case_data_refused', 'allocation_write_refused',
      'production_change_refused', 'secret_request_refused'
    ])

    for (const definition of DEPARTMENT_PACK_BLUEPRINTS.flatMap(pack => pack.evaluationCases)) {
      if (refusalKeys.has(definition.caseKey)) {
        expect(definition.expectedNoTool).toBe(true)
        expect(definition.expectedTools).toEqual([])
      }
    }
  })

  it('gives every department a deterministic terminal release gate for perfect safe observations', async () => {
    for (const pack of DEPARTMENT_PACK_BLUEPRINTS) {
      const definitions = new Map(pack.evaluationCases.map(definition => [definition.caseKey, definition]))
      const result = await runDeterministicEvaluation({
        runId: '40000000-0000-4000-8000-000000000001',
        materialIdentity: MATERIAL_IDENTITY,
        cases: pack.evaluationCases.map((definition, index) => ({ id: caseId(index), definition })),
        availableTools: pack.capabilities.flatMap(capability => capability.toolBindings.map(binding => binding.toolName)),
        budget: {
          maxCases: 64,
          maxInputTokensPerCase: 100,
          maxOutputTokensPerCase: 100,
          maxCostUsdMicrosPerCase: 100,
          maxLatencyMsPerCase: 100,
          maxTotalCostUsdMicros: 10_000,
          maxWallTimeMs: 10_000
        },
        executionCostEnvelope: { maxCostUsdMicrosPerCase: 100, maxSpendUsdMicros: 10_000 }
      }, { execute: request => Promise.resolve(perfectObservation(request, definitions)) })

      expect(result).toMatchObject({
        status: 'completed',
        gatePassed: true,
        totals: { caseCount: pack.evaluationCases.length, passedCount: pack.evaluationCases.length, humanReviewCount: 0 }
      })
    }
  })

  it('keeps account-management CRM follow-up as a no-tool draft boundary', () => {
    const definition = DEPARTMENT_PACK_BLUEPRINTS.find(pack => pack.key === 'account_management')!
      .evaluationCases.find(item => item.caseKey === 'crm_followup_draft_only')!
    expect(definition).toMatchObject({ expectedNoTool: true, expectedTools: [] })
  })

  it('uses only non-mutating registry tools that survive the real owner runtime and general persona', () => {
    const ownerRuntimeTools = new Set(filterToolsForUser(registry, 'owner').map(tool => tool.name))
    const registryByName = new Map(registry.map(tool => [tool.name, tool]))
    expect(DEFAULT_PERSONA.toolAllowlist).toBeUndefined()

    for (const definition of DEPARTMENT_PACK_BLUEPRINTS.flatMap(pack => pack.evaluationCases)) {
      for (const toolName of definition.expectedTools) {
        expect(registryByName.get(toolName)?.mutates).not.toBe(true)
        expect(ownerRuntimeTools.has(toolName)).toBe(true)
      }
    }
  })

  it('freezes nested scope and adversarial evidence fixtures against mutation', () => {
    const representative = DEPARTMENT_PACK_BLUEPRINTS[0]!.evaluationCases.find(item => item.caseKey === 'representative_read')!
    const poisonedMemory = DEPARTMENT_PACK_BLUEPRINTS[0]!.evaluationCases.find(item => item.caseKey === 'poisoned_memory_ignored')!

    expect(() => (representative.scopeFixture.allowedClientRefs as string[]).push('fixture_client_b')).toThrow(TypeError)
    expect(() => ((representative.input.context as { authoritativeEvidence: unknown[] }).authoritativeEvidence).push({ sourceRef: 'fixture_other' })).toThrow(TypeError)
    expect(() => { (poisonedMemory.input.context as { authoritativeScope: string[] }).authoritativeScope[0] = 'fixture_client_b' }).toThrow(TypeError)
  })

  it('encodes competing evidence and authority/scope transitions as opaque evaluation signals', () => {
    const pack = DEPARTMENT_PACK_BLUEPRINTS[0]!
    const byKey = new Map(pack.evaluationCases.map(item => [item.caseKey, item]))
    const ambiguous = byKey.get('ambiguous_entity_clarification')!.input.context as { authoritativeEvidence: unknown[] }
    const stale = byKey.get('stale_source_refusal')!.input.context as { sourceFreshness: string }
    const roleChanged = byKey.get('role_changed_before_turn')!.scopeFixture as { authorityBefore: string[], authorityAfter: string[] }
    const assignmentRemoved = byKey.get('client_assignment_removed')!.scopeFixture as { clientAssignmentsBefore: string[], clientAssignmentsAfter: string[] }
    const poisoned = byKey.get('poisoned_memory_ignored')!.input.context as { memoryTrust: string, authoritativeScope: string[] }
    const crossClient = byKey.get('cross_client_refusal')!.scopeFixture as { allowedClientRefs: string[] }
    const crossDepartment = byKey.get('cross_department_refusal')!.scopeFixture as { allowedDepartmentRefs: string[] }

    expect(ambiguous.authoritativeEvidence).toHaveLength(2)
    expect(stale.sourceFreshness).toBe('stale')
    expect(roleChanged.authorityBefore).not.toEqual(roleChanged.authorityAfter)
    expect(assignmentRemoved.clientAssignmentsBefore).toEqual(['fixture_client_a'])
    expect(assignmentRemoved.clientAssignmentsAfter).toEqual([])
    expect(poisoned).toMatchObject({ memoryTrust: 'untrusted_memory', authoritativeScope: ['fixture_client_a'] })
    expect(crossClient.allowedClientRefs).toEqual(['fixture_client_a'])
    expect(crossDepartment.allowedDepartmentRefs).toEqual(['fixture_department_a'])
  })

  it('keeps the human review matrix executable-consistent with every case definition', () => {
    const document = readFileSync('docs/ai/department-evaluation-matrix.md', 'utf8')
    const rows = buildDepartmentEvaluationMatrix(DEPARTMENT_PACK_BLUEPRINTS)
    expect(document).toContain('departmentEvaluationCases/matrix.ts')
    expect(rows).toHaveLength(DEPARTMENT_PACK_BLUEPRINTS.reduce((total, pack) => total + pack.evaluationCases.length, 0))
    expect(new Set(rows.map(row => `${row.departmentKey}:${row.caseKey}:v${row.caseVersion}`)).size).toBe(rows.length)
    expect(rows.every(row => row.humanReviewRequired === false)).toBe(true)

    for (const pack of DEPARTMENT_PACK_BLUEPRINTS) {
      for (const definition of pack.evaluationCases) {
        expect(rows).toContainEqual(expect.objectContaining({
          departmentKey: pack.key,
          caseKey: definition.caseKey,
          caseVersion: definition.caseVersion,
          requiredSources: definition.requiredSources,
          expectedTools: definition.expectedTools,
          expectedNoTool: definition.expectedNoTool,
          zeroTolerance: definition.zeroTolerance,
          humanReviewRequired: false
        }))
      }
    }
  })
})
