import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const listRoute = readFileSync(new URL('../../server/api/agency/hr/roles/index.get.ts', import.meta.url), 'utf8')

describe('HR role questionnaire preview API contract', () => {
  it('returns the latest frozen questionnaire and quality report with each role', () => {
    expect(listRoute).toContain('questionnaire.questions AS questionnaire_questions')
    expect(listRoute).toContain('questionnaire.quality_report AS questionnaire_quality_report')
    expect(listRoute).toContain("questionnaire.template_key = 'role-' || rp.id::text")
    expect(listRoute).toContain('ORDER BY questionnaire.version DESC LIMIT 1')
  })

  it('remains restricted and non-cacheable', () => {
    expect(listRoute).toContain("setHeader(event, 'Cache-Control', 'private, no-store')")
    expect(listRoute).toContain('await requireHrAdmin(event)')
  })
})
