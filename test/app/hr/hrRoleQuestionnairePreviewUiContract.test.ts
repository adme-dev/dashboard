import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/pages/agency/hr/roles.vue', import.meta.url), 'utf8')

describe('HR role questionnaire preview UI', () => {
  it('lets an HR administrator inspect generated questions before publication or assignment', () => {
    expect(page).toContain('Preview questionnaire')
    expect(page).toContain('questionnaire_questions')
    expect(page).toContain('question.prompt')
    expect(page).toContain("question.required ? 'Required' : 'Optional'")
  })

  it('states that previewing is read-only and sends nothing', () => {
    expect(page).toContain('Read-only preview')
    expect(page).toContain('Nothing is published, assigned or sent from this preview.')
  })
})
