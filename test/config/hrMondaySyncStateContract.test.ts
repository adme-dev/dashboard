import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/database/migrations/228_hr_monday_sync_state.sql', 'utf8')

describe('HR Monday sync state contract', () => {
  it('stores resumable state per approved scope and board', () => {
    expect(source).toContain('scope_id UUID NOT NULL REFERENCES hr_monday_evidence_scopes')
    expect(source).toContain('monday_board_id VARCHAR(100) NOT NULL')
    expect(source).toContain('UNIQUE(scope_id, monday_board_id)')
    expect(source).toContain('cursor TEXT')
  })

  it('tracks reconciliation outcomes and bounded execution status', () => {
    expect(source).toContain("status VARCHAR(20) NOT NULL DEFAULT 'idle'")
    expect(source).toContain('records_created INTEGER')
    expect(source).toContain('records_updated INTEGER')
    expect(source).toContain('records_archived INTEGER')
    expect(source).toContain('records_failed INTEGER')
  })
})
