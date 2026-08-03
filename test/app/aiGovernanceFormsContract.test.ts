import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

const sources = [
  source('app/components/ai/DepartmentDraftSeedDialog.vue'),
  source('app/components/ai/governance/EvaluationRunPanel.vue'),
  source('app/components/ai/governance/CatalogReleasePanel.vue'),
  source('app/components/ai/governance/PilotMembershipDialog.vue')
]

describe('AI governance form contracts', () => {
  it('uses UFormField for every editable field and no native form controls', () => {
    expect(sources.every(source => source.includes('UFormField'))).toBe(true)
    expect(sources.join('\n')).not.toMatch(/<(?:input|select|textarea|button|dialog)\b/i)
    expect(sources.join('\n')).not.toMatch(/\b(?:confirm|alert|prompt)\s*\(/)
  })

  it('keeps modal forms container-responsive and makes confirmations explicit', () => {
    expect(sources.join('\n')).toContain('@container')
    expect(sources.join('\n')).toContain('UCheckbox')
    expect(sources.join('\n')).toContain('class="w-full"')
  })
})
