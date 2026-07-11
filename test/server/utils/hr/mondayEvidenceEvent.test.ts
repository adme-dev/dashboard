import { describe, expect, it } from 'vitest'
import { normalizeMondayEvidenceEvent } from '../../../../server/utils/hr/mondayEvidenceEvent'

describe('Monday HR evidence event normalization', () => {
  it('keeps allowlisted assignment and status change provenance without raw values', () => {
    expect(normalizeMondayEvidenceEvent('change_column_value', { event: { columnId: 'person', columnType: 'people' } }, ['assignee'])).toEqual({ changeKind: 'assignment', fieldId: 'person' })
    expect(normalizeMondayEvidenceEvent('change_column_value', { event: { columnId: 'status', columnType: 'status', value: { label: 'Late' } } }, ['status'])).toEqual({ changeKind: 'status', fieldId: 'status' })
  })

  it('rejects unapproved fields and communication events', () => {
    expect(normalizeMondayEvidenceEvent('change_column_value', { event: { columnId: 'private_notes', columnType: 'long_text' } }, ['status'])).toBeNull()
    expect(normalizeMondayEvidenceEvent('create_update', { event: { body: 'private comment' } }, ['updates'])).toBeNull()
  })

  it('preserves lifecycle provenance without source content', () => {
    expect(normalizeMondayEvidenceEvent('item_archived', { event: {} }, [])).toEqual({ changeKind: 'archived', fieldId: null })
  })
})
