import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL(
  '../../server/database/migrations/337_search_authority_content_disclaimer.sql',
  import.meta.url
), 'utf8')

describe('Search Authority content disclaimer migration', () => {
  it('binds a bounded explicit disclaimer to every immutable version', () => {
    expect(sql).toMatch(/ALTER TABLE search_authority_content_versions/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS disclaimer TEXT NOT NULL DEFAULT ''/i)
    expect(sql).toMatch(/char_length\(disclaimer\) <= 5000/i)
  })
})
