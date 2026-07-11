import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('app/pages/agency/hr/reviews.vue', 'utf8')

describe('HR questionnaire commissioning UI', () => {
  it('requires preview and explicit approval before sending', () => {
    expect(source).toContain("'/api/agency/hr/reviews/preview'")
    expect(source).toContain('Review questionnaires')
    expect(source).toContain('Approve and send')
    expect(source).toContain('ownerConfirmed: true')
    expect(source).toContain('recommendationReason')
    expect(source).toContain('sourceRefs')
    expect(source).toContain('Remove question')
    expect(source).toContain('Add question')
  })
})
