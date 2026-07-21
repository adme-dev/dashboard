import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/269_send_multipart_geometry.sql', import.meta.url),
  'utf8'
)

describe('Send multipart geometry migration 269', () => {
  it('persists bounded server-owned geometry idempotently', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS multipart_part_size_bytes BIGINT')
    expect(migration).toContain('send_upload_intents_multipart_geometry_check')
    expect(migration).toContain('multipart_part_size_bytes BETWEEN 5242880 AND 5368709120')
    expect(migration).toContain('expected_size_bytes <= multipart_part_size_bytes * 10000')
    expect(migration).toContain(`upload_method = 'single' AND multipart_part_size_bytes IS NULL`)
    expect(migration).toContain('never select the object key or multipart upload ID')
  })
})
