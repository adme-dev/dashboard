import fs from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.MEASUREMENT_DATABASE_SMOKE_URL
const databaseTest = databaseUrl ? it : it.skip

describe('email conversion attribution constraint in PostgreSQL', () => {
  let client: pg.Client | null = null

  beforeAll(async () => {
    if (!databaseUrl) return
    client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 })
    await client.connect()
    await client.query('BEGIN')
    // A temporary table shadows public.conversion_events. No live records change.
    await client.query(`CREATE TEMP TABLE conversion_events (
      attribution jsonb NOT NULL,
      CONSTRAINT conversion_events_attribution_check CHECK (jsonb_typeof(attribution) = 'object'),
      CONSTRAINT conversion_events_attribution_check1 CHECK (
        NOT (attribution ?| ARRAY['email', 'phone', 'first_name', 'last_name', 'full_name'])
      ),
      CONSTRAINT conversion_events_attribution_check2 CHECK (
        attribution - ARRAY['browserEventId', 'metaLeadId', 'gclid', 'gbraid', 'wbraid',
          'gaClientId', 'fbc', 'fbp', 'ttclid', 'ttp', 'eventSourceUrl', 'clientUserAgent'] = '{}'::jsonb
      )
    ) ON COMMIT DROP`)
    const migration = new URL('../../server/database/migrations/451_email_conversion_attribution.sql', import.meta.url)
    const sql = fs.readFileSync(migration, 'utf8')
    await client.query(sql)
    await client.query(sql) // Reapplying must preserve the same boundary.
  }, 30_000)

  afterAll(async () => {
    if (!client) return
    await client.query('ROLLBACK')
    await client.end()
  })

  databaseTest('accepts the bounded metadata produced by email intake', async () => {
    const attribution = {
      browserEventId: null, metaLeadId: null, gclid: null, gbraid: null,
      wbraid: null, gaClientId: null,
      utm_source: 'generic', utm_medium: 'lead_ingest', provider: 'generic',
      email_endpoint_id: '11111111-1111-4111-8111-111111111111',
      parser: 'adf', confidence_band: 'high', transport: 'email'
    }
    await client!.query('SAVEPOINT email_metadata')
    try {
      const result = await client!.query(
        'INSERT INTO conversion_events (attribution) VALUES ($1::jsonb) RETURNING attribution',
        [JSON.stringify(attribution)]
      )
      expect(result.rows[0].attribution).toEqual(attribution)
    } finally {
      await client!.query('ROLLBACK TO SAVEPOINT email_metadata')
    }
  })

  databaseTest('keeps existing browser and advertising attribution valid', async () => {
    const attribution = { browserEventId: 'event-123', gaClientId: '123.456', fbc: 'fb.1.example',
      fbp: 'fb.1.example', ttclid: 'click-1', ttp: 'visitor-1',
      eventSourceUrl: 'https://example.test/vehicle', clientUserAgent: 'test browser' }
    const result = await client!.query(
      'INSERT INTO conversion_events (attribution) VALUES ($1::jsonb) RETURNING attribution',
      [JSON.stringify(attribution)]
    )
    expect(result.rows[0].attribution).toEqual(attribution)
  })

  for (const attribution of [{ email: 'private@example.test' }, { phone: '+61123456789' },
    { full_name: 'Private Person' }, { arbitrary_payload: 'unbounded' }, ['invalid']]) {
    databaseTest(`rejects disallowed attribution ${JSON.stringify(Object.keys(attribution))}`, async () => {
      await client!.query('SAVEPOINT invalid_metadata')
      try {
        await expect(client!.query('INSERT INTO conversion_events (attribution) VALUES ($1::jsonb)',
          [JSON.stringify(attribution)])).rejects.toMatchObject({ code: '23514' })
      } finally {
        await client!.query('ROLLBACK TO SAVEPOINT invalid_metadata')
      }
    })
  }
})
