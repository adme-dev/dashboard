import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationPath = fileURLToPath(new URL(
  '../../server/database/migrations/331_nearby_automotive_market_discovery.sql',
  import.meta.url
))

describe('nearby automotive market discovery migration', () => {
  it('enforces tenant-scoped locations, candidates, and audit actors', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS client_market_locations/i)
    expect(sql).toMatch(/UNIQUE \(client_id, id\)/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS client_market_locations_one_primary[\s\S]*WHERE is_primary = TRUE/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS site_intelligence_candidates/i)
    expect(sql).toMatch(/UNIQUE \(client_id, market_location_id, google_place_id\)/i)
    expect(sql).toMatch(/state IN \('saved', 'nominated', 'approved', 'dismissed'\)/i)
    expect(sql).toMatch(/source IN \('agency', 'client_portal'\)/i)
    expect(sql).toMatch(/radius_km_at_decision IN \(10, 25, 50\)/i)
    expect(sql).toMatch(/FOREIGN KEY \(client_id, market_location_id\)[\s\S]*REFERENCES client_market_locations\(client_id, id\) ON DELETE CASCADE/i)
    expect(sql).toMatch(/FOREIGN KEY \(client_id, approved_domain_id\)[\s\S]*REFERENCES site_intelligence_domains\(client_id, id\) ON DELETE SET NULL \(approved_domain_id\)/i)
    expect(sql).toMatch(/FOREIGN KEY \(actor_id\) REFERENCES team_members\(id\) ON DELETE SET NULL/i)
    expect(sql).toMatch(/client_actor_id UUID REFERENCES client_users\(id\) ON DELETE SET NULL/i)
    expect(sql).toMatch(/NOT \(actor_id IS NOT NULL AND client_actor_id IS NOT NULL\)/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS can_nominate_competitors BOOLEAN NOT NULL DEFAULT FALSE/i)
  })
})
