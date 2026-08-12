import { afterEach, describe, expect, it } from 'vitest'

import { createCatalogSourceForClientWithDb } from '../../../../server/utils/crm/catalogSourceService'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

describe('Supabase catalog source storage', () => {
  const originalKey = process.env.REPO_TOKEN_ENCRYPTION_KEY

  afterEach(() => {
    process.env.REPO_TOKEN_ENCRYPTION_KEY = originalKey
  })

  it('stores the API key only as encrypted credential bytes', async () => {
    process.env.REPO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
    const apiKey = 'supabase-secret-that-must-not-be-returned'
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const savedSource = {
      id: '22222222-2222-4222-8222-222222222222',
      client_id: CLIENT_ID,
      source_type: 'supabase',
      display_name: 'Northern inventory database',
      feed_url: 'https://northern.supabase.co/',
      connection_config: { schema: 'public', table: 'vehicles' }
    }
    const db = {
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params })
        if (sql.includes('SELECT id FROM agency_clients')) return { rows: [{ id: CLIENT_ID }] }
        if (sql.includes('INSERT INTO crm_catalog_sources')) return { rows: [savedSource] }
        if (sql.includes('INSERT INTO crm_catalog_source_credentials')) return { rows: [] }
        throw new Error(`Unexpected SQL: ${sql}`)
      }
    }

    const source = await createCatalogSourceForClientWithDb(db, CLIENT_ID, ACTOR_ID, {
      connector_type: 'supabase',
      display_name: 'Northern inventory database',
      project_url: 'https://northern.supabase.co',
      schema: 'public',
      table: 'vehicles',
      api_key: apiKey
    })

    expect(JSON.stringify(source)).not.toContain(apiKey)
    const sourceInsert = calls.find(call => call.sql.includes('INSERT INTO crm_catalog_sources'))
    expect(sourceInsert?.params).not.toContain(apiKey)

    const credentialInsert = calls.find(call => call.sql.includes('INSERT INTO crm_catalog_source_credentials'))
    expect(credentialInsert?.params[2]).toBeInstanceOf(Uint8Array)
    expect(credentialInsert?.params[3]).toBeInstanceOf(Uint8Array)
    expect(credentialInsert?.params).not.toContain(apiKey)
  })
})
