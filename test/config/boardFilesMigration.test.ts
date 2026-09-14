import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'server/database/migrations/341_board_files_library.sql'

describe('board files migration', () => {
  it('creates board-scoped, attributable, duplicate-resistant file storage', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS board_files/i)
    expect(sql).toMatch(/department_id UUID NOT NULL REFERENCES departments\(id\) ON DELETE CASCADE/i)
    expect(sql).toMatch(/uploaded_by UUID REFERENCES team_members\(id\) ON DELETE SET NULL/i)
    expect(sql).toMatch(/CHECK \(category IN \('reference', 'policy', 'template', 'other'\)\)/i)
    expect(sql).toMatch(/CHECK \(source IN \('xeroflow', 'monday', 'xero'\)\)/i)
    expect(sql).toMatch(/checksum_sha256 CHAR\(64\) NOT NULL/i)
    expect(sql).toMatch(/UNIQUE \(department_id, checksum_sha256\)/i)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_board_files_department/i)
  })
})
