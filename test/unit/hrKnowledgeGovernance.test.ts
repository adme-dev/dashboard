import { describe, expect, it } from 'vitest'
import { hrKnowledgeEntrySchema } from '../../server/utils/hr/schemas'

const valid = {
  entryType: 'evidence_definition' as const,
  title: 'Task completion evidence',
  content: 'Task status can show recorded workflow state but cannot prove effort or capability by itself.',
  status: 'approved' as const,
  sourceRefs: [{ sourceType: 'standard' as const, sourceId: 'ops-1', label: 'Operations evidence standard' }],
  provenanceNote: 'Reviewed and approved by the business owner against the documented workflow.',
  confidentiality: 'restricted_hr' as const,
  permittedUses: ['evidence_interpretation' as const],
  limitations: ['Do not treat task counts as productivity.'],
  effectiveFrom: '2026-07-11',
  reviewDueAt: '2027-01-11',
}

describe('HR knowledge governance validation', () => {
  it('rejects approval without an authorised source citation', () => {
    const result = hrKnowledgeEntrySchema.safeParse({ ...valid, sourceRefs: [] })
    expect(result.success).toBe(false)
  })

  it('rejects prohibited original-contract and questionnaire-answer source types', () => {
    for (const sourceType of ['contract_document', 'questionnaire_answer', 'anonymous_response']) {
      const result = hrKnowledgeEntrySchema.safeParse({ ...valid, sourceRefs: [{ sourceType, sourceId: 'private-1', label: 'Private source' }] })
      expect(result.success).toBe(false)
    }
  })

  it('requires a reason for disputed knowledge', () => {
    const result = hrKnowledgeEntrySchema.safeParse({ ...valid, status: 'disputed', disputeNote: undefined })
    expect(result.success).toBe(false)
  })
})
