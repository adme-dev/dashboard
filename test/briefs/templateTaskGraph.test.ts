import { describe, expect, it } from 'vitest'
import { templateTaskDescription, validateTemplateTaskGraph } from '~~/server/utils/briefConversion/taskGraph'

describe('template task graph', () => {
  it('accepts parallel production tasks converging on review', () => {
    expect(() => validateTemplateTaskGraph([
      { id: 'copy' }, { id: 'video' }, { id: 'review', depends_on_task_ids: ['copy', 'video'] }
    ])).not.toThrow()
  })
  it.each([
    [{ id: 'a' }, { id: 'a' }],
    [{ id: 'a', parent_task_id: 'missing' }],
    [{ id: 'a', parent_task_id: 'b' }, { id: 'b', parent_task_id: 'a' }],
    [{ id: 'a', depends_on_task_ids: ['b'] }, { id: 'b', depends_on_task_ids: ['a'] }],
    [{ id: 'a', depends_on_task_ids: ['foreign'] }]
  ])('rejects unsafe references %#', (...tasks) => {
    expect(() => validateTemplateTaskGraph(tasks)).toThrow()
  })
  it('copies acceptance criteria without inheriting completion state', () => {
    expect(templateTaskDescription('Review copy', [{ text: 'Client approved', checked: true }, 'Asset attached']))
      .toBe('Review copy\nAcceptance criteria:\n- Client approved\n- Asset attached')
    expect(templateTaskDescription(null, [null, {}, 42])).toBeNull()
  })
})
