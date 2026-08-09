import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, unknown>
  params?: Record<string, string>
  context?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, unknown>
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OBJECT_ID = '22222222-2222-4222-8222-222222222222'
const RECORD_ID = '33333333-3333-4333-8333-333333333333'
const PERSON_ID = '44444444-4444-4444-8444-444444444444'

const fieldDefs = [{
  id: 'field-1', client_id: CLIENT_ID, object_def_id: OBJECT_ID,
  key: 'customer', label: 'Customer', field_type: 'relation', options: [],
  relation_target: 'person', is_required: false, is_title: false, position: 0
}]
const malformedRecord = {
  id: RECORD_ID,
  client_id: CLIENT_ID,
  object_def_id: OBJECT_ID,
  data: { customer: [PERSON_ID] },
  deleted_at: null
}

const mocks = vi.hoisted(() => ({
  requireClientAuth: vi.fn(),
  assertObjectVisible: vi.fn(),
  queryRows: vi.fn(),
  queryCount: vi.fn(),
  queryOne: vi.fn()
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args)
}))
vi.mock('~~/server/utils/crm/engine/resolveObjects', () => ({
  assertObjectVisible: (...args: unknown[]) => mocks.assertObjectVisible(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  queryCount: (...args: unknown[]) => mocks.queryCount(...args),
  queryOne: (...args: unknown[]) => mocks.queryOne(...args)
}))

const portalList = (await import('~~/server/api/client-portal/crm/records/index.get')).default
const portalGet = (await import('~~/server/api/client-portal/crm/records/[id].get')).default

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireClientAuth.mockResolvedValue({ clientId: CLIENT_ID })
  mocks.assertObjectVisible.mockResolvedValue({ id: OBJECT_ID, key: 'accounts' })
  mocks.queryRows.mockImplementation(async (sql: string) => {
    if (/FROM crm_field_defs/.test(sql)) return fieldDefs
    if (/FROM crm_records/.test(sql)) {
      return /data->>'customer'[\s\S]*FROM crm_people/.test(sql) ? [] : [malformedRecord]
    }
    return []
  })
  mocks.queryCount.mockImplementation(async (sql: string) =>
    /data->>'customer'[\s\S]*FROM crm_people/.test(sql) ? 0 : 1)
  mocks.queryOne.mockImplementation(async (sql: string) => {
    if (/FROM crm_records/.test(sql)) return malformedRecord
    if (/FROM crm_people/.test(sql)) return null
    return null
  })
})

describe('portal custom-record relation integrity', () => {
  it('filters malformed stored relation values before portal list projection and count', async () => {
    await expect(portalList({
      query: { objectKey: 'accounts' }, context: {}
    } as never)).resolves.toMatchObject({ items: [], total: 0 })
  })

  it('returns the canonical 404 instead of projecting malformed stored relation data', async () => {
    await expect(portalGet({
      params: { id: RECORD_ID }, context: {}
    } as never)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
  })
})
