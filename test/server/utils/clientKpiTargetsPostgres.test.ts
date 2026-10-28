import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientKpiTargetsSchema, readClientKpiTargets, replaceClientKpiTargets } from '~~/server/utils/clients/kpiTargets'

const url = process.env.CLIENT_MARKETING_BOUNDARY_TEST_DATABASE_URL
if (url && (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || new URL(url).searchParams.has('host'))) throw new Error('Disposable localhost database required')
it('rejects duplicate types, invalid amounts and unbounded replacements', () => {
  const target = { resultType: 'lead', targetCostPerResult: 20 }
  expect(clientKpiTargetsSchema.safeParse([target, target]).success).toBe(false)
  expect(clientKpiTargetsSchema.safeParse([{ ...target, targetCtr: 101 }]).success).toBe(false)
  expect(clientKpiTargetsSchema.safeParse([{ ...target, targetCostPerResult: Infinity }]).success).toBe(false)
  expect(clientKpiTargetsSchema.safeParse(Array.from({ length: 101 }, (_, i) => ({ ...target, resultType: String(i) }))).success).toBe(false)
})
describe.runIf(Boolean(url))('client KPI targets on disposable PostgreSQL', () => {
  const schema = `client_kpi_${randomUUID().replaceAll('-', '')}`
  const clientId = randomUUID(), inactiveId = randomUUID()
  let db: pg.Client
  beforeAll(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
    await db.query(`CREATE SCHEMA ${schema}`)
    await db.query(`SET search_path TO ${schema}`)
    await db.query(`CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean); CREATE TABLE client_kpi_targets(client_id uuid,result_type varchar(40),target_cost_per_result numeric(10,2),target_ctr numeric(5,2),max_frequency numeric(5,2),UNIQUE(client_id,result_type)); CREATE TABLE media_spend(client_id uuid,result_type text)`)
    await db.query('INSERT INTO agency_clients VALUES ($1,TRUE),($2,FALSE)', [clientId, inactiveId])
    await db.query('INSERT INTO media_spend VALUES ($1,$2)', [clientId, 'lead'])
  })
  afterAll(async () => {
    await db.query(`DROP SCHEMA ${schema} CASCADE`)
    await db.end()
  })
  it('replaces exact reviewed values and rejects a stale overwrite without losing targets', async () => {
    const before = await readClientKpiTargets(db, clientId)
    expect(before.availableResultTypes).toEqual(['lead'])
    await db.query('BEGIN')
    const changed = await replaceClientKpiTargets(db, clientId, [{ resultType: 'lead', targetCostPerResult: 15, targetCtr: 2, maxFrequency: 3 }], before.revision)
    await db.query('COMMIT')
    expect(changed.revision).not.toBe(before.revision)
    await db.query('BEGIN')
    await expect(replaceClientKpiTargets(db, clientId, [], before.revision)).rejects.toMatchObject({ statusCode: 409 })
    await db.query('ROLLBACK')
    expect((await readClientKpiTargets(db, clientId)).targets).toHaveLength(1)
  })
  it('rejects inactive and foreign clients and rolls back invalid replacement', async () => {
    await expect(readClientKpiTargets(db, inactiveId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(readClientKpiTargets(db, randomUUID())).rejects.toMatchObject({ statusCode: 404 })
    await db.query('BEGIN')
    await expect(replaceClientKpiTargets(db, inactiveId, [], 'a'.repeat(64))).rejects.toMatchObject({ statusCode: 404 })
    await db.query('ROLLBACK')
    expect((await readClientKpiTargets(db, clientId)).targets[0]?.targetCostPerResult).toBe(15)
  })
})
