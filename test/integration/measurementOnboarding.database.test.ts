import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresMeasurementHealthRepository } from '../../server/utils/measurement/healthRepository'
import { createMeasurementHealthService } from '../../server/utils/measurement/healthService'
import { createPostgresMeasurementProfileRepository } from '../../server/utils/measurement/profileRepository'

const databaseUrl = process.env.MEASUREMENT_DATABASE_SMOKE_URL
const runWithDatabase = databaseUrl ? it : it.skip

describe('measurement onboarding against PostgreSQL', () => {
  const clientId = crypto.randomUUID()
  const actorId = crypto.randomUUID()
  let client: pg.Client | null = null

  beforeAll(async () => {
    if (!databaseUrl) return
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query('BEGIN')
  })

  afterAll(async () => {
    if (!client) return
    await client.query('ROLLBACK')
    const residue = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM agency_clients WHERE id = $1',
      [clientId]
    )
    expect(residue.rows[0]?.count).toBe('0')
    await client.end()
  })

  runWithDatabase('creates a profile and validates an older destination after the profile advances', async () => {
    if (!client) throw new Error('Database smoke client was not initialized')

    await client.query(
      `INSERT INTO agency_clients (id, name, billing_type, industry, is_active)
       VALUES ($1, $2, 'project', 'automotive retail', false)`,
      [clientId, `ZZ_SCRATCH_measurement_smoke_${clientId}`]
    )

    const queryOne = async <T>(sql: string, params: unknown[] = []) => {
      const result = await client!.query(sql, params)
      return (result.rows[0] as T | undefined) ?? null
    }
    const transaction = async <T>(
      callback: (db: pg.Client) => Promise<T>
    ): Promise<T> => callback(client!)

    const profileRepository = createPostgresMeasurementProfileRepository({
      queryOne: queryOne as never,
      execute: (async (sql: string, params: unknown[] = []) => {
        const result = await client!.query(sql, params)
        return result.rowCount ?? 0
      }) as never,
      transaction: transaction as never
    })
    const profile = await profileRepository.getByClientId(
      clientId,
      { createIfMissing: true }
    )

    expect(profile).toMatchObject({
      clientId,
      enabled: false,
      environment: 'test',
      vertical: 'automotive retail',
      configVersion: 1
    })

    const destinationResult = await client.query<{ id: string }>(
      `INSERT INTO conversion_destinations (
         client_id, profile_id, platform, external_destination_id,
         credential_ref, enabled, environment, health_status, config_version
       ) VALUES ($1, $2, 'meta', 'smoke-dataset', $3, false, 'test', 'configured', 1)
       RETURNING id`,
      [clientId, profile!.id, 'MEASUREMENT_PROVIDER_META_SMOKE']
    )
    const destinationId = destinationResult.rows[0]!.id

    await client.query(
      `INSERT INTO conversion_destination_capabilities (
         client_id, destination_id, platform, mode, status,
         management_origin, can_zero_mutate, config_version
       ) VALUES ($1, $2, 'meta', 'meta_crm_capi', 'configured', 'zero', true, 1)`,
      [clientId, destinationId]
    )

    await client.query(
      `UPDATE client_measurement_profiles
          SET config_version = 2
        WHERE client_id = $1`,
      [clientId]
    )

    await client.query(
      `INSERT INTO conversion_destinations (
         client_id, profile_id, platform, external_destination_id,
         enabled, environment, health_status, config_version
       ) VALUES (
         $1, $2, 'google_data_manager', 'smoke-customer-2',
         false, 'test', 'configured', 2
       )`,
      [clientId, profile!.id]
    )

    await expect(queryOne<{
      profile_version: number
      destination_version: number
    }>(
      `SELECT p.config_version AS profile_version,
              d.config_version AS destination_version
         FROM client_measurement_profiles p
         JOIN conversion_destinations d
           ON d.client_id = p.client_id
          AND d.id = $2
        WHERE p.client_id = $1`,
      [clientId, destinationId]
    )).resolves.toEqual({
      profile_version: 2,
      destination_version: 1
    })

    const healthService = createMeasurementHealthService({
      repository: createPostgresMeasurementHealthRepository({
        transaction: transaction as never
      })
    })
    const evidence = await healthService.recordValidation({
      clientId,
      destinationId,
      expectedConfigVersion: 1,
      observedAt: new Date().toISOString(),
      capabilities: [{
        mode: 'meta_crm_capi',
        status: 'ready',
        blockingReason: null
      }],
      providerRequestId: 'measurement-smoke',
      errorClass: null,
      redactedError: null,
      actor: { type: 'team_member', id: actorId },
      reason: 'Rollback-only measurement onboarding database smoke'
    })

    expect(evidence).toMatchObject({
      configVersion: 1,
      healthStatus: 'ready'
    })
    await expect(queryOne<{ health_status: string }>(
      'SELECT health_status FROM conversion_destinations WHERE id = $1',
      [destinationId]
    )).resolves.toEqual({ health_status: 'ready' })
    await expect(queryOne<{ actor_type: string, config_version: number }>(
      `SELECT actor_type, config_version
         FROM measurement_config_audit
        WHERE client_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [clientId]
    )).resolves.toEqual({
      actor_type: 'team_member',
      config_version: 1
    })
  })
})
