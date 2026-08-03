import { describe, expect, it } from 'vitest'
import { DEPARTMENT_PACK_BLUEPRINTS } from '~~/server/utils/ai/governance/departmentPackBlueprints'
import { EvaluationCaseSchema } from '~~/server/utils/ai/governance/contracts'

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
})
