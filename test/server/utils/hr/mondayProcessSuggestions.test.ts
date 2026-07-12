import { describe, expect, it } from 'vitest'
import { buildMondayProcessSuggestions } from '~~/server/utils/hr/mondayProcessSuggestions'

const summary = {
  boardId: '22000', boardName: 'Delivery', itemCount: 12, blockedCount: 2,
  overdueCount: 1, statusNames: ['Working on it', 'Done'], sampleTitles: ['Prepare report', 'Client approval'],
}

describe('Monday process suggestions', () => {
  it('produces owner-reviewable process and question drafts without employee conclusions', () => {
    const suggestions = buildMondayProcessSuggestions(summary)
    expect(suggestions.map(item => item.kind)).toEqual(['process_profile', 'question_bank'])
    expect(suggestions[0].content).toContain('draft process description for owner validation')
    expect(suggestions[0].content).toContain('no conclusion about any individual')
    expect(suggestions.every(item => item.limitations.some(value => value.includes('not employee performance')))).toBe(true)
  })

  it('uses balanced optional choices and preserves an outside-visibility answer', () => {
    const question = JSON.parse(buildMondayProcessSuggestions(summary)[1].content)
    expect(question.required).toBe(false)
    expect(question.options.map((item: { value: string }) => item.value)).toContain('not_applicable')
    expect(question.interpretation).toContain('never a KPI result')
  })
})
