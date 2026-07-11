import { describe, expect, it } from 'vitest'
import { filterMondayItemForMigration, isMondayItemInsideWindow } from '../../../server/utils/mondayMigration'

const item = {
  id: 'item-1',
  name: 'Approved task',
  updated_at: '2026-07-05T12:00:00.000Z',
  created_at: '2026-07-01T12:00:00.000Z',
  column_values: [
    { id: 'status', type: 'status', text: 'Working on it' },
    { id: 'person', type: 'people', text: 'Alex' },
    { id: 'private_notes', type: 'long_text', text: 'Do not import' },
  ],
} as any

describe('Monday migration governance', () => {
  it('retains only allowlisted column ids or approved semantic aliases', () => {
    const filtered = filterMondayItemForMigration({
      ...item,
      subitems: [{ ...item, id: 'subitem-1' }],
    }, ['status', 'assignee'])
    expect(filtered.column_values.map((column: any) => column.id)).toEqual(['status', 'person'])
    expect(filtered.subitems?.[0]?.column_values?.map((column: any) => column.id)).toEqual(['status', 'person'])
  })

  it('enforces both ends of the approved observation window', () => {
    expect(isMondayItemInsideWindow(item, '2026-07-01T00:00:00.000Z', '2026-07-31T23:59:59.999Z')).toBe(true)
    expect(isMondayItemInsideWindow(item, '2026-07-06T00:00:00.000Z', '2026-07-31T23:59:59.999Z')).toBe(false)
    expect(isMondayItemInsideWindow(item, '2026-07-01T00:00:00.000Z', '2026-07-04T23:59:59.999Z')).toBe(false)
  })
})
