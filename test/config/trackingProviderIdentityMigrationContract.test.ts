import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('tracking provider identity migration', () => {
  const sql = readFileSync(resolve(
    __dirname,
    '../../server/database/migrations/283_tracking_provider_identity.sql'
  ), 'utf8')

  it('backfills and constrains Podium organization and location allowlists', () => {
    expect(sql).toMatch(/organizationUid/)
    expect(sql).toMatch(/locationUids/)
    expect(sql).toMatch(/jsonb_typeof[^;]*organizationUid[^;]*string/s)
    expect(sql).toMatch(/jsonb_typeof[^;]*locationUids[^;]*array/s)
    expect(sql).toMatch(/jsonb_array_elements_text/s)
  })
})
