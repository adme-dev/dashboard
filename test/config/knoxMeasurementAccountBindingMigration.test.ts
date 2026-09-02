import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/410_knox_ldv_measurement_account.sql', import.meta.url),
  'utf8'
)

describe('Knox LDV measurement account binding migration', () => {
  it('binds the exact client, connection, and operating customer without aggregation', () => {
    expect(migration).toContain("'2e15c35e-0f11-43ae-b13d-7fd1000570d4'::uuid")
    expect(migration).toContain("'6e252890-f426-498a-a074-0d25bf0f3bea'::uuid")
    expect(migration).toContain("'3892176492'")
    expect(migration).toMatch(/NULL,\s*'6e252890-f426-498a-a074-0d25bf0f3bea'::uuid,\s*'3892176492',\s*'dealer'/)
  })

  it('fails closed when canonical client or tenant-bound Google connection evidence differs', () => {
    expect(migration).toMatch(/LOWER\(name\) = LOWER\('Knox LDV'\)/)
    expect(migration).toMatch(/client_id = '2e15c35e-0f11-43ae-b13d-7fd1000570d4'::uuid/)
    expect(migration).toMatch(/platform = 'google'/)
    expect(migration).toMatch(/status = 'active'/)
    expect(migration).toMatch(/RAISE EXCEPTION 'Knox LDV measurement-account seed failed/)
  })

  it('appends seed evidence without storing credential material', () => {
    expect(migration).toContain('INSERT INTO google_ads_account_binding_events')
    expect(migration).toMatch(/'migration',\s*'410'/)
    expect(migration).not.toMatch(/access_token|refresh_token|developer_token/i)
  })
})
