import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinancialAllocationMutation } from '~~/shared/types/clientFinancials'

const dbMocks = vi.hoisted(() => ({
  transactionOnce: vi.fn(),
  transaction: vi.fn(),
  query: vi.fn(),
}))

vi.mock('~~/server/utils/db', () => ({
  transactionOnce: (...args: unknown[]) => dbMocks.transactionOnce(...args),
  transaction: (...args: unknown[]) => dbMocks.transaction(...args),
}))

import {
  applyClientFinancialAllocation,
  ClientFinancialAllocationError,
} from '~~/server/utils/clientFinancialAllocations'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const MEDIA_ID = '55555555-5555-4555-8555-555555555555'
const ACTOR_ID = '66666666-6666-4666-8666-666666666666'
const TENANT_ID = 'tenant-selected'
const CHANGED_AT = '2026-08-22T04:05:06.000Z'

interface FakeRow {
  [key: string]: unknown
}

function result(rows: FakeRow[] = [], rowCount = rows.length) {
  return { rows, rowCount }
}

function writeResult(rowCount = 1) {
  return result([], rowCount)
}

function sqlOf(call: unknown[]): string {
  return String(call[0]).replace(/\s+/g, ' ').trim()
}

function callsContaining(fragment: string): unknown[][] {
  return dbMocks.query.mock.calls.filter(call => sqlOf(call).includes(fragment))
}

function firstCallIndex(fragment: string): number {
  return dbMocks.query.mock.calls.findIndex(call => sqlOf(call).includes(fragment))
}

function mediaSource(overrides: FakeRow = {}): FakeRow {
  return {
    id: MEDIA_ID,
    clientId: CLIENT_ID,
    projectId: null,
    platform: 'meta',
    campaignName: 'August campaign',
    ...overrides,
  }
}

function xeroLine(overrides: FakeRow = {}): FakeRow {
  return {
    lineItemId: 'invoice-1:0',
    invoiceId: 'invoice-1',
    invoiceType: 'ACCREC',
    invoiceDate: '2026-08-05',
    invoiceStatus: 'AUTHORISED',
    invoiceContactId: 'contact-1',
    accountCode: '200',
    description: 'Creative retainer',
    lineExGstCents: '602000',
    trackingClient: null,
    ...overrides,
  }
}

async function fingerprint(line: FakeRow): Promise<string> {
  const source = [
    TENANT_ID,
    line.lineItemId,
    line.invoiceId,
    line.invoiceType,
    line.invoiceDate,
    line.accountCode ?? '',
    Number(line.lineExGstCents),
    line.description ?? '',
  ].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function invoke(mutation: FinancialAllocationMutation) {
  return applyClientFinancialAllocation({
    tenantId: mutation.sourceType === 'media_spend' ? null : TENANT_ID,
    clientId: CLIENT_ID,
    actorId: ACTOR_ID,
    mutation,
  })
}

describe('applyClientFinancialAllocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.transactionOnce.mockImplementation(async (callback: (db: { query: typeof dbMocks.query }) => unknown) => (
      callback({ query: dbMocks.query })
    ))
    dbMocks.transaction.mockImplementation(async (callback: (db: { query: typeof dbMocks.query }) => unknown) => (
      callback({ query: dbMocks.query })
    ))
  })

  it('locks and assigns a client-owned media source, then appends one audit row', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM media_spend')) return result([mediaSource()])
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('UPDATE media_spend')) return writeResult()
      if (sql.includes('INSERT INTO financial_allocation_audit')) return result([{ changedAt: CHANGED_AT }])
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(applyClientFinancialAllocation({
      tenantId: TENANT_ID,
      clientId: CLIENT_ID,
      actorId: ACTOR_ID,
      mutation: {
        sourceType: 'media_spend',
        sourceId: MEDIA_ID,
        projectId: PROJECT_ID,
      },
    })).resolves.toEqual({
      sourceType: 'media_spend',
      sourceId: MEDIA_ID,
      previousProjectId: null,
      projectId: PROJECT_ID,
      changedAt: CHANGED_AT,
    })

    expect(dbMocks.transactionOnce).toHaveBeenCalledOnce()
    expect(dbMocks.transaction).not.toHaveBeenCalled()
    expect(sqlOf(callsContaining('FROM media_spend')[0]!)).toContain('FOR UPDATE')
    expect(sqlOf(callsContaining('FROM projects')[0]!)).toContain('FOR UPDATE')
    expect(callsContaining('UPDATE media_spend')[0]?.[1]).toEqual([MEDIA_ID, PROJECT_ID])
    const audits = callsContaining('INSERT INTO financial_allocation_audit')
    expect(audits).toHaveLength(1)
    expect(audits[0]?.[1]).toEqual(expect.arrayContaining([
      'media_spend', null, MEDIA_ID, CLIENT_ID, null, PROJECT_ID, ACTOR_ID,
    ]))
  })

  it('rolls back and does not audit when a locked media update affects zero rows', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM media_spend')) return result([mediaSource()])
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('UPDATE media_spend')) return writeResult(0)
      if (sql.includes('INSERT INTO financial_allocation_audit')) {
        return result([{ changedAt: CHANGED_AT }])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    })).rejects.toThrow(/media allocation update/i)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('rolls back the media update when the audit insert affects zero rows', async () => {
    const committed = { projectId: null as string | null, audits: 0 }
    dbMocks.transactionOnce.mockImplementation(async (callback: (db: { query: Function }) => Promise<unknown>) => {
      const pending = { ...committed }
      const transactionalDb = {
        query: async (sql: string) => {
          if (sql.includes('FROM media_spend')) {
            return result([mediaSource({ projectId: pending.projectId })])
          }
          if (sql.includes('FROM projects')) {
            return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
          }
          if (sql.includes('UPDATE media_spend')) {
            pending.projectId = PROJECT_ID
            return writeResult()
          }
          if (sql.includes('INSERT INTO financial_allocation_audit')) {
            return result([{ changedAt: CHANGED_AT }], 0)
          }
          throw new Error(`Unexpected query: ${sql}`)
        },
      }
      const value = await callback(transactionalDb)
      Object.assign(committed, pending)
      return value
    })

    await expect(invoke({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    })).rejects.toThrow(/audit insert/i)
    expect(committed).toEqual({ projectId: null, audits: 0 })
  })

  it('rejects a cross-client media project before updating the source', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM media_spend')) return result([mediaSource()])
      if (sql.includes('FROM projects')) return result([{ id: OTHER_PROJECT_ID, clientId: OTHER_CLIENT_ID }])
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: OTHER_PROJECT_ID,
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    expect(callsContaining('UPDATE media_spend')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('rejects a media source owned by another client before updating it', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM media_spend')) {
        return result([mediaSource({ clientId: OTHER_CLIENT_ID })])
      }
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    expect(callsContaining('UPDATE media_spend')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('returns source_not_found when a media source does not exist', async () => {
    dbMocks.query.mockResolvedValue(result())

    await expect(invoke({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: null,
    })).rejects.toEqual(new ClientFinancialAllocationError('source_not_found'))
  })

  it('assigns an eligible client-owned Xero line with a server-derived snapshot and audit', async () => {
    const line = xeroLine()
    dbMocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('FROM xero_project_allocations')) return result()
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      if (sql.includes('INSERT INTO xero_project_allocations')) return writeResult()
      if (sql.includes('INSERT INTO financial_allocation_audit')) return result([{ changedAt: CHANGED_AT }])
      throw new Error(`Unexpected query: ${sql} ${JSON.stringify(params)}`)
    })

    const expectedFingerprint = await fingerprint(line)
    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).resolves.toEqual({
      sourceType: 'xero_line',
      sourceId: 'invoice-1:0',
      previousProjectId: null,
      projectId: PROJECT_ID,
      changedAt: CHANGED_AT,
    })

    expect(sqlOf(callsContaining('FROM xero_invoice_lines_cache')[0]!)).toContain('FOR UPDATE')
    expect(sqlOf(callsContaining('FROM xero_project_allocations')[0]!)).toContain('FOR UPDATE')
    expect(callsContaining('FROM xero_invoice_lines_cache')[0]?.[1]).toEqual([
      TENANT_ID, 'invoice-1:0',
    ])
    expect(callsContaining('FROM xero_project_allocations')[0]?.[1]).toEqual([
      TENANT_ID, 'invoice-1:0',
    ])
    expect(firstCallIndex('FROM xero_invoice_lines_cache'))
      .toBeLessThan(firstCallIndex('FROM xero_project_allocations'))
    expect(firstCallIndex('FROM xero_project_allocations'))
      .toBeLessThan(firstCallIndex('FROM projects'))
    expect(firstCallIndex('FROM projects')).toBeLessThan(firstCallIndex('FROM agency_clients'))
    expect(firstCallIndex('FROM agency_clients'))
      .toBeLessThan(firstCallIndex('INSERT INTO xero_project_allocations'))
    expect(firstCallIndex('INSERT INTO xero_project_allocations'))
      .toBeLessThan(firstCallIndex('INSERT INTO financial_allocation_audit'))
    const upsertParams = callsContaining('INSERT INTO xero_project_allocations')[0]?.[1] as unknown[]
    expect(upsertParams).toEqual([
      TENANT_ID,
      'invoice-1:0',
      'invoice-1',
      CLIENT_ID,
      PROJECT_ID,
      'ACCREC',
      '2026-08-05',
      '200',
      'Creative retainer',
      602000,
      expectedFingerprint,
      ACTOR_ID,
    ])
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(1)
  })

  it('records the previous and new project when reassigning an eligible Xero line', async () => {
    const line = xeroLine()
    const currentFingerprint = await fingerprint(line)
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('FROM xero_project_allocations')) {
        return result([{ clientId: CLIENT_ID, projectId: OTHER_PROJECT_ID, sourceFingerprint: currentFingerprint }])
      }
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      if (sql.includes('INSERT INTO xero_project_allocations')) return writeResult()
      if (sql.includes('INSERT INTO financial_allocation_audit')) return result([{ changedAt: CHANGED_AT }])
      throw new Error(`Unexpected query: ${sql}`)
    })

    const allocation = await invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })

    expect(allocation).toMatchObject({ previousProjectId: OTHER_PROJECT_ID, projectId: PROJECT_ID })
    expect(callsContaining('INSERT INTO financial_allocation_audit')[0]?.[1]).toEqual(expect.arrayContaining([
      'xero_line', TENANT_ID, 'invoice-1:0', CLIENT_ID, OTHER_PROJECT_ID, PROJECT_ID, ACTOR_ID,
    ]))
  })

  it('does not audit when a Xero allocation upsert affects zero rows', async () => {
    const line = xeroLine()
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('FROM xero_project_allocations')) return result()
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) {
        return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      }
      if (sql.includes('INSERT INTO xero_project_allocations')) return writeResult(0)
      if (sql.includes('INSERT INTO financial_allocation_audit')) {
        return result([{ changedAt: CHANGED_AT }])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).rejects.toThrow(/Xero allocation upsert/i)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('deletes an eligible Xero mapping on explicit unassignment and audits its previous project', async () => {
    const line = xeroLine()
    const currentFingerprint = await fingerprint(line)
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('DELETE FROM xero_project_allocations')) return writeResult()
      if (sql.includes('FROM xero_project_allocations')) {
        return result([{ clientId: CLIENT_ID, projectId: PROJECT_ID, sourceFingerprint: currentFingerprint }])
      }
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      if (sql.includes('INSERT INTO financial_allocation_audit')) return result([{ changedAt: CHANGED_AT }])
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: null,
    })).resolves.toMatchObject({ previousProjectId: PROJECT_ID, projectId: null })
    expect(callsContaining('DELETE FROM xero_project_allocations')[0]?.[1])
      .toEqual([TENANT_ID, 'invoice-1:0', CLIENT_ID])
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(1)
  })

  it('does not audit when an expected Xero delete affects zero rows', async () => {
    const line = xeroLine()
    const currentFingerprint = await fingerprint(line)
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('DELETE FROM xero_project_allocations')) return writeResult(0)
      if (sql.includes('FROM xero_project_allocations')) {
        return result([{ clientId: CLIENT_ID, projectId: PROJECT_ID, sourceFingerprint: currentFingerprint }])
      }
      if (sql.includes('FROM agency_clients')) {
        return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      }
      if (sql.includes('INSERT INTO financial_allocation_audit')) {
        return result([{ changedAt: CHANGED_AT }])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: null,
    })).rejects.toThrow(/Xero allocation delete/i)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('allows a zero-row Xero delete when the locked mapping did not exist', async () => {
    const line = xeroLine()
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('DELETE FROM xero_project_allocations')) return writeResult(0)
      if (sql.includes('FROM xero_project_allocations')) return result()
      if (sql.includes('FROM agency_clients')) {
        return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      }
      if (sql.includes('INSERT INTO financial_allocation_audit')) {
        return result([{ changedAt: CHANGED_AT }])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: null,
    })).resolves.toMatchObject({ previousProjectId: null, projectId: null })
    expect(callsContaining('DELETE FROM xero_project_allocations')[0]?.[1])
      .toEqual([TENANT_ID, 'invoice-1:0', CLIENT_ID])
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(1)
  })

  it('rejects a Xero line that is not currently eligible for the selected client', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) {
        return result([xeroLine({ invoiceContactId: 'other-contact' })])
      }
      if (sql.includes('FROM xero_project_allocations')) return result()
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    expect(callsContaining('INSERT INTO xero_project_allocations')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('rejects an excluded-status Xero line before writing an allocation', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) {
        return result([xeroLine({ invoiceStatus: 'VOIDED' })])
      }
      if (sql.includes('FROM xero_project_allocations')) return result()
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) {
        return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      }
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    expect(callsContaining('INSERT INTO xero_project_allocations')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('rejects a Xero line mapping owned by another client', async () => {
    const line = xeroLine()
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('FROM xero_project_allocations')) {
        return result([{
          clientId: OTHER_CLIENT_ID,
          projectId: OTHER_PROJECT_ID,
          sourceFingerprint: 'foreign-fingerprint',
        }])
      }
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) {
        return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      }
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    expect(callsContaining('INSERT INTO xero_project_allocations')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('requires an ACCPAY line to match the selected client tracking mapping', async () => {
    const line = xeroLine({
      invoiceType: 'ACCPAY',
      invoiceContactId: 'supplier-contact',
      trackingClient: 'Astoria Motors',
    })
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('FROM xero_project_allocations')) return result()
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) {
        return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      }
      if (sql.includes('FROM agency_client_xero_tracking_mappings')) {
        return sql.includes('LOWER($3::text) = LOWER(mapping.tracking_option_name)')
          ? result()
          : result([{ trackingOptionId: 'other', trackingOptionName: 'Other client' }])
      }
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    expect(callsContaining('INSERT INTO xero_project_allocations')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('does not trim ACCPAY tracking values beyond Task 3 SQL equality semantics', async () => {
    const line = xeroLine({
      invoiceType: 'ACCPAY',
      invoiceContactId: 'supplier-contact',
      trackingClient: ' Astoria Motors ',
    })
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('FROM xero_project_allocations')) return result()
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) {
        return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      }
      if (sql.includes('FROM agency_client_xero_tracking_mappings')) {
        return sql.includes('LOWER($3::text) = LOWER(mapping.tracking_option_name)')
          ? result()
          : result([{ trackingOptionId: 'tracking-astoria', trackingOptionName: 'Astoria Motors' }])
      }
      if (sql.includes('INSERT INTO xero_project_allocations')) return writeResult()
      if (sql.includes('INSERT INTO financial_allocation_audit')) {
        return result([{ changedAt: CHANGED_AT }])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    const mappingCall = callsContaining('FROM agency_client_xero_tracking_mappings')[0]!
    expect(sqlOf(mappingCall)).toContain('LOWER($3::text) = LOWER(mapping.tracking_option_name)')
    expect(mappingCall[1]).toEqual([TENANT_ID, CLIENT_ID, ' Astoria Motors '])
    expect(callsContaining('INSERT INTO xero_project_allocations')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('rejects a stale Xero fingerprint and writes no allocation or audit row', async () => {
    const line = xeroLine({ lineExGstCents: '700000' })
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_invoice_lines_cache')) return result([line])
      if (sql.includes('FROM xero_project_allocations')) {
        return result([{ clientId: CLIENT_ID, projectId: OTHER_PROJECT_ID, sourceFingerprint: 'before-change' }])
      }
      if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID, xeroContactId: 'contact-1' }])
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    })).rejects.toEqual(new ClientFinancialAllocationError('stale_source'))
    expect(callsContaining('INSERT INTO xero_project_allocations')).toHaveLength(0)
    expect(callsContaining('DELETE FROM xero_project_allocations')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('validates an active tenant-owned Client tracking option before upserting the mapping', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID }])
      if (sql.includes('FROM agency_client_xero_tracking_mappings')) return result()
      if (sql.includes('FROM xero_tracking_categories')) {
        return result([{ optionId: 'tracking-astoria', optionName: 'Astoria Motors' }])
      }
      if (sql.includes('INSERT INTO agency_client_xero_tracking_mappings')) return writeResult()
      if (sql.includes('INSERT INTO financial_allocation_audit')) return result([{ changedAt: CHANGED_AT }])
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'client_tracking',
      trackingOptionId: 'tracking-astoria',
      trackingOptionName: 'Astoria Motors',
    })).resolves.toEqual({
      sourceType: 'client_tracking',
      sourceId: CLIENT_ID,
      previousProjectId: null,
      projectId: null,
      changedAt: CHANGED_AT,
    })

    const optionSql = sqlOf(callsContaining('FROM xero_tracking_categories')[0]!)
    expect(optionSql).toContain('category.tenant_id = $1')
    expect(optionSql).toContain("LOWER(category.name) = LOWER('Client')")
    expect(optionSql).toContain("UPPER(COALESCE(option.status, 'ACTIVE')) = 'ACTIVE'")
    expect(optionSql).toContain('FOR UPDATE')
    expect(callsContaining('INSERT INTO agency_client_xero_tracking_mappings')[0]?.[1]).toEqual([
      TENANT_ID, CLIENT_ID, 'tracking-astoria', 'Astoria Motors', ACTOR_ID,
    ])
    expect(callsContaining('FROM agency_client_xero_tracking_mappings')[0]?.[1])
      .toEqual([TENANT_ID, CLIENT_ID])
    expect(callsContaining('FROM xero_tracking_categories')[0]?.[1])
      .toEqual([TENANT_ID, 'tracking-astoria', 'Astoria Motors'])
    expect(firstCallIndex('FROM agency_clients'))
      .toBeLessThan(firstCallIndex('FROM agency_client_xero_tracking_mappings'))
    expect(firstCallIndex('FROM agency_client_xero_tracking_mappings'))
      .toBeLessThan(firstCallIndex('FROM xero_tracking_categories'))
    expect(firstCallIndex('FROM xero_tracking_categories'))
      .toBeLessThan(firstCallIndex('INSERT INTO agency_client_xero_tracking_mappings'))
    expect(firstCallIndex('INSERT INTO agency_client_xero_tracking_mappings'))
      .toBeLessThan(firstCallIndex('INSERT INTO financial_allocation_audit'))
  })

  it('does not audit when a client tracking allocation upsert affects zero rows', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID }])
      if (sql.includes('FROM agency_client_xero_tracking_mappings')) return result()
      if (sql.includes('FROM xero_tracking_categories')) {
        return result([{ optionId: 'tracking-astoria', optionName: 'Astoria Motors' }])
      }
      if (sql.includes('INSERT INTO agency_client_xero_tracking_mappings')) return writeResult(0)
      if (sql.includes('INSERT INTO financial_allocation_audit')) {
        return result([{ changedAt: CHANGED_AT }])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'client_tracking',
      trackingOptionId: 'tracking-astoria',
      trackingOptionName: 'Astoria Motors',
    })).rejects.toThrow(/Client tracking allocation upsert/i)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('rejects a foreign or inactive tracking option before replacing the mapping', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID }])
      if (sql.includes('FROM agency_client_xero_tracking_mappings')) return result()
      if (sql.includes('FROM xero_tracking_categories')) return result()
      throw new Error(`Mutation query must not run: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'client_tracking',
      trackingOptionId: 'foreign-option',
      trackingOptionName: 'Foreign option',
    })).rejects.toMatchObject({ code: 'invalid_assignment' })
    expect(callsContaining('INSERT INTO agency_client_xero_tracking_mappings')).toHaveLength(0)
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(0)
  })

  it('deletes a client tracking mapping on explicit null and audits authoritative previous values', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID }])
      if (sql.includes('DELETE FROM agency_client_xero_tracking_mappings')) return writeResult()
      if (sql.includes('FROM agency_client_xero_tracking_mappings')) {
        return result([{ trackingOptionId: 'tracking-old', trackingOptionName: 'Old client' }])
      }
      if (sql.includes('INSERT INTO financial_allocation_audit')) return result([{ changedAt: CHANGED_AT }])
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'client_tracking',
      trackingOptionId: null,
      trackingOptionName: 'ignored browser snapshot',
    })).resolves.toMatchObject({ sourceId: CLIENT_ID, projectId: null })
    expect(callsContaining('DELETE FROM agency_client_xero_tracking_mappings')[0]?.[1])
      .toEqual([TENANT_ID, CLIENT_ID])
    const auditParams = callsContaining('INSERT INTO financial_allocation_audit')[0]?.[1] as unknown[]
    expect(auditParams.slice(0, 7)).toEqual([
      'client_tracking', TENANT_ID, CLIENT_ID, CLIENT_ID, null, null, ACTOR_ID,
    ])
    expect(JSON.parse(String(auditParams[7]))).toEqual({
      previousTrackingOptionId: 'tracking-old',
      previousTrackingOptionName: 'Old client',
      newTrackingOptionId: null,
      newTrackingOptionName: null,
    })
  })

  it('allows a zero-row client tracking delete when the locked mapping did not exist', async () => {
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients')) return result([{ id: CLIENT_ID }])
      if (sql.includes('DELETE FROM agency_client_xero_tracking_mappings')) return writeResult(0)
      if (sql.includes('FROM agency_client_xero_tracking_mappings')) return result()
      if (sql.includes('INSERT INTO financial_allocation_audit')) {
        return result([{ changedAt: CHANGED_AT }])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(invoke({
      sourceType: 'client_tracking',
      trackingOptionId: null,
      trackingOptionName: 'ignored browser snapshot',
    })).resolves.toMatchObject({ sourceId: CLIENT_ID, projectId: null })
    expect(callsContaining('DELETE FROM agency_client_xero_tracking_mappings')[0]?.[1])
      .toEqual([TENANT_ID, CLIENT_ID])
    expect(callsContaining('INSERT INTO financial_allocation_audit')).toHaveLength(1)
  })

  it('rolls back the source update when the append-only audit insert fails', async () => {
    const committed = { projectId: null as string | null, audits: 0 }
    dbMocks.transactionOnce.mockImplementation(async (callback: (db: { query: Function }) => Promise<unknown>) => {
      const pending = { ...committed }
      const transactionalDb = {
        query: async (sql: string) => {
          if (sql.includes('FROM media_spend')) return result([mediaSource({ projectId: pending.projectId })])
          if (sql.includes('FROM projects')) return result([{ id: PROJECT_ID, clientId: CLIENT_ID }])
          if (sql.includes('UPDATE media_spend')) {
            pending.projectId = PROJECT_ID
            return writeResult()
          }
          if (sql.includes('INSERT INTO financial_allocation_audit')) throw new Error('audit unavailable')
          throw new Error(`Unexpected query: ${sql}`)
        },
      }
      const value = await callback(transactionalDb)
      Object.assign(committed, pending)
      return value
    })

    await expect(invoke({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    })).rejects.toThrow('audit unavailable')
    expect(committed).toEqual({ projectId: null, audits: 0 })
  })
})
