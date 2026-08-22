import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadClientFinancialDataset,
  type ClientFinancialDataset,
  type ClientFinancialRawXeroLine,
} from '~~/server/utils/clientFinancialRepository'
import { getClientFinancials } from '~~/server/utils/clientFinancials'

const dbMocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
}))

vi.mock('~~/server/utils/db', () => dbMocks)

const NOW = new Date('2026-08-22T00:00:00.000Z')

function makeDataset(
  overrides: Partial<ClientFinancialDataset> = {},
): ClientFinancialDataset {
  return {
    client: {
      id: 'client-astoria',
      name: 'Astoria Motors',
      xeroContactId: 'contact-astoria',
    },
    projects: [
      {
        id: 'project-web',
        name: 'Astoria website',
        status: 'active',
        budgetAmount: '10000.00',
      },
    ],
    xeroLines: [],
    savedXeroAllocations: [],
    mediaSpend: [],
    activeMediaConnection: { exists: false, updatedAt: null },
    timeEntries: [],
    timeSummaries: [],
    totalTimeEntries: 0,
    projectExpenses: [],
    invoices: [],
    trackingMapping: {
      trackingOptionId: 'tracking-astoria',
      trackingOptionName: 'Astoria Motors',
    },
    trackingOptions: [
      { tenantId: 'tenant-1', id: 'tracking-astoria', name: 'Astoria Motors', isActive: true },
    ],
    freshness: {
      xeroInvoices: '2026-08-22T00:00:00.000Z',
      xeroLines: '2026-08-22T00:00:00.000Z',
      media: '2026-08-22T00:00:00.000Z',
      timeEntries: '2026-08-22T00:00:00.000Z',
      projectExpenses: '2026-08-22T00:00:00.000Z',
    },
    ...overrides,
  }
}

function makeXeroLine(
  overrides: Partial<ClientFinancialRawXeroLine> = {},
): ClientFinancialRawXeroLine {
  return {
    lineItemId: 'line-revenue-1',
    invoiceId: 'invoice-revenue-1',
    invoiceNumber: 'INV-1001',
    invoiceType: 'ACCREC',
    invoiceDate: '2026-08-05',
    accountCode: '200',
    accountType: 'REVENUE',
    description: 'August creative retainer',
    lineExGstCents: '602000',
    trackingClient: null,
    contactId: 'contact-astoria',
    syncedAt: '2026-08-22T00:00:00.000Z',
    ...overrides,
  }
}

async function fingerprint(
  tenantId: string,
  line: ClientFinancialRawXeroLine,
): Promise<string> {
  const source = [
    tenantId,
    line.lineItemId,
    line.invoiceId,
    line.invoiceType,
    line.invoiceDate,
    line.accountCode ?? '',
    line.lineExGstCents,
    line.description ?? '',
  ].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function deps(dataset: ClientFinancialDataset) {
  return {
    loadDataset: async () => dataset,
    now: () => NOW,
  }
}

describe('getClientFinancials', () => {
  it('does not substitute capped detail when uncapped time summaries are missing', async () => {
    const invalidDataset = {
      ...makeDataset({
        timeEntries: [{
          id: 'time-1', projectId: 'project-web', projectName: 'Astoria website',
          date: '2026-08-10', userName: 'Alex', description: null,
          hours: '1.00', hourlyRate: '100.00', createdAt: '2026-08-10T01:00:00.000Z',
        }],
        totalTimeEntries: 520,
      }),
      timeSummaries: undefined,
    } as unknown as ClientFinancialDataset

    await expect(getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(invalidDataset))).rejects.toThrow()
  })

  it('keeps contact-scoped ACCREC in client totals while project rows use only valid allocations', async () => {
    const allocatedRevenue = makeXeroLine()
    const unallocatedRevenue = makeXeroLine({
      lineItemId: 'line-revenue-2',
      invoiceId: 'invoice-revenue-2',
      lineExGstCents: '100000',
    })
    const anotherContactRevenue = makeXeroLine({
      lineItemId: 'line-revenue-other-contact',
      invoiceId: 'invoice-revenue-other-contact',
      contactId: 'contact-someone-else',
      lineExGstCents: '500000',
    })
    const supplierCost = makeXeroLine({
      lineItemId: 'line-cost-1',
      invoiceId: 'invoice-cost-1',
      invoiceNumber: 'BILL-42',
      invoiceType: 'ACCPAY',
      accountCode: '310',
      accountType: 'DIRECTCOSTS',
      lineExGstCents: '30000',
      trackingClient: 'astoria motors',
    })
    const wrongTracking = makeXeroLine({
      lineItemId: 'line-cost-other',
      invoiceId: 'invoice-cost-other',
      invoiceType: 'ACCPAY',
      accountType: 'DIRECTCOSTS',
      lineExGstCents: '90000',
      trackingClient: 'Another Client',
    })
    const taggedOverhead = makeXeroLine({
      lineItemId: 'line-overhead-1',
      invoiceId: 'invoice-overhead-1',
      invoiceType: 'ACCPAY',
      accountCode: '400',
      accountType: 'EXPENSE',
      lineExGstCents: '8000',
      trackingClient: 'Astoria Motors',
    })
    const result = await getClientFinancials({
      tenantId: 'tenant-1',
      clientId: 'client-astoria',
      from: '2026-08-01',
      to: '2026-08-22',
      includeSources: true,
      canAllocate: true,
    }, deps(makeDataset({
      xeroLines: [
        allocatedRevenue,
        unallocatedRevenue,
        anotherContactRevenue,
        supplierCost,
        wrongTracking,
        taggedOverhead,
      ],
      savedXeroAllocations: [
        {
          lineItemId: allocatedRevenue.lineItemId,
          invoiceId: allocatedRevenue.invoiceId,
          projectId: 'project-web',
          sourceFingerprint: await fingerprint('tenant-1', allocatedRevenue),
          sourceInvoiceType: allocatedRevenue.invoiceType,
          sourceInvoiceDate: allocatedRevenue.invoiceDate,
          sourceAccountCode: allocatedRevenue.accountCode,
          sourceDescription: allocatedRevenue.description,
          sourceExGstCents: allocatedRevenue.lineExGstCents,
        },
        {
          lineItemId: supplierCost.lineItemId,
          invoiceId: supplierCost.invoiceId,
          projectId: 'project-web',
          sourceFingerprint: await fingerprint('tenant-1', supplierCost),
          sourceInvoiceType: supplierCost.invoiceType,
          sourceInvoiceDate: supplierCost.invoiceDate,
          sourceAccountCode: supplierCost.accountCode,
          sourceDescription: supplierCost.description,
          sourceExGstCents: supplierCost.lineExGstCents,
        },
      ],
    })))

    expect(result.summary).toMatchObject({ xeroRevenue: 7020, xeroSupplierCost: 300 })
    expect(result.projects[0]).toMatchObject({ xeroRevenue: 6020, xeroSupplierCost: 300 })
    expect(result.unallocated.xeroRevenue).toBe(1000)
    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'line-overhead-1', amount: 80, projectId: null }),
    ]))
  })

  it('marks absent and fingerprint-changed Xero allocations stale and excludes them from projects', async () => {
    const changedLine = makeXeroLine({ lineExGstCents: '700000' })
    const result = await getClientFinancials({
      tenantId: 'tenant-1',
      clientId: 'client-astoria',
      from: '2026-08-01',
      to: '2026-08-22',
      includeSources: true,
      canAllocate: true,
    }, deps(makeDataset({
      xeroLines: [changedLine],
      savedXeroAllocations: [
        {
          lineItemId: changedLine.lineItemId,
          invoiceId: changedLine.invoiceId,
          projectId: 'project-web',
          sourceFingerprint: 'fingerprint-before-Xero-change',
          sourceInvoiceType: changedLine.invoiceType,
          sourceInvoiceDate: changedLine.invoiceDate,
          sourceAccountCode: changedLine.accountCode,
          sourceDescription: changedLine.description,
          sourceExGstCents: '602000',
        },
        {
          lineItemId: 'line-deleted',
          invoiceId: 'invoice-deleted',
          projectId: 'project-web',
          sourceFingerprint: 'fingerprint-for-deleted-line',
          sourceInvoiceType: 'ACCREC',
          sourceInvoiceDate: '2026-08-06',
          sourceAccountCode: '200',
          sourceDescription: 'Deleted upstream',
          sourceExGstCents: '25000',
        },
      ],
    })))

    expect(result.summary.xeroRevenue).toBe(7000)
    expect(result.projects[0]?.xeroRevenue).toBe(0)
    expect(result.unallocated.xeroRevenue).toBe(7000)
    expect(result.warnings.filter(warning => warning.code === 'stale_allocation')).toHaveLength(2)
    expect(result.sources?.filter(source => source.isStale).map(source => source.sourceId).sort())
      .toEqual(['line-deleted', 'line-revenue-1'])
  })

  it('marks a joined allocation stale when its old snapshot date falls outside the range', async () => {
    const movedLine = makeXeroLine({
      invoiceDate: '2026-08-05',
      lineExGstCents: '700000',
      allocationProjectId: 'project-web',
      allocationFingerprint: 'fingerprint-from-july-snapshot',
    })
    const result = await getClientFinancials({
      tenantId: 'tenant-1',
      clientId: 'client-astoria',
      from: '2026-08-01',
      to: '2026-08-22',
      includeSources: true,
      canAllocate: true,
    }, deps(makeDataset({
      xeroLines: [movedLine],
      // The date-filtered allocation lookup cannot see the old July snapshot.
      savedXeroAllocations: [],
    })))

    expect(result.summary.xeroRevenue).toBe(7000)
    expect(result.projects[0]?.xeroRevenue).toBe(0)
    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'line-revenue-1',
        projectId: 'project-web',
        isStale: true,
      }),
    ]))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'stale_allocation',
        sourceId: 'line-revenue-1',
        projectId: 'project-web',
      }),
    ]))
  })

  it('uses daily spend as the authoritative amount for an arbitrary partial range', async () => {
    const result = await getClientFinancials({
      tenantId: 'tenant-1',
      clientId: 'client-astoria',
      from: '2026-08-10',
      to: '2026-08-20',
      includeSources: false,
      canAllocate: false,
    }, deps(makeDataset({
      activeMediaConnection: { exists: true, updatedAt: '2026-08-20T02:00:00.000Z' },
      mediaSpend: [{
        id: 'media-1',
        projectId: 'project-web',
        platform: 'meta',
        campaignName: 'Astoria EOFY',
        budgetAllocated: '4000.00',
        actualSpend: '2592.82',
        period: '2026-08',
        connectionId: 'connection-1',
        syncedAt: '2026-08-20T02:00:00.000Z',
        updatedAt: '2026-08-20T02:00:00.000Z',
        dailySpend: '410.25',
        dailyRowCount: 11,
      }],
    })))

    expect(result.summary.mediaSpend).toBe(410.25)
    expect(result.projects[0]?.mediaSpend).toBe(410.25)
    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'media_partial' }),
    ]))
  })

  it('falls back to monthly spend only for a full historical month or current month-to-date', async () => {
    const historical = makeDataset({
      activeMediaConnection: { exists: true, updatedAt: '2026-08-01T00:00:00.000Z' },
      mediaSpend: [{
        id: 'media-july',
        projectId: 'project-web',
        platform: 'google',
        campaignName: 'July search',
        budgetAllocated: '3000.00',
        actualSpend: '1200.55',
        period: '2026-07',
        connectionId: 'connection-1',
        syncedAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        dailySpend: null,
        dailyRowCount: 0,
      }],
    })
    const currentMtd = makeDataset({
      activeMediaConnection: { exists: true, updatedAt: '2026-08-22T00:00:00.000Z' },
      mediaSpend: [{
        id: 'media-august',
        projectId: null,
        platform: 'meta',
        campaignName: 'August social',
        budgetAllocated: '5000.00',
        actualSpend: '2592.82',
        period: '2026-08',
        connectionId: 'connection-1',
        syncedAt: '2026-08-22T00:00:00.000Z',
        updatedAt: '2026-08-22T00:00:00.000Z',
        dailySpend: null,
        dailyRowCount: 0,
      }],
    })

    const fullMonthResult = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-07-01', to: '2026-07-31', includeSources: false, canAllocate: false,
    }, deps(historical))
    const currentMtdResult = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(currentMtd))
    const unsupportedPartialResult = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-07-10', to: '2026-07-20', includeSources: false, canAllocate: false,
    }, deps(historical))

    expect(fullMonthResult.summary.mediaSpend).toBe(1200.55)
    expect(currentMtdResult.summary.mediaSpend).toBe(2592.82)
    expect(unsupportedPartialResult.summary.mediaSpend).toBe(0)
    expect(unsupportedPartialResult.activity.mediaCampaigns[0]).toMatchObject({
      actualSpend: 0,
      sourceState: 'partial',
    })
    expect(unsupportedPartialResult.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'media_partial', sourceId: 'media-july' }),
    ]))
  })

  it('caps time activity at 500 rows while preserving the independently counted total', async () => {
    const timeEntries = Array.from({ length: 500 }, (_, index) => ({
      id: `time-${index}`,
      projectId: 'project-web',
      projectName: 'Astoria website',
      date: '2026-08-10',
      userName: 'Alex',
      description: `Entry ${index}`,
      hours: '1.00',
      hourlyRate: '100.00',
      createdAt: '2026-08-10T01:00:00.000Z',
    }))
    const result = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(makeDataset({
      timeEntries,
      timeSummaries: [{ projectId: 'project-web', hours: '520.00', labourCost: '52000.00' }],
      totalTimeEntries: 520,
    })))

    expect(result.activity.timeEntries).toHaveLength(500)
    expect(result.activity.totalTimeEntries).toBe(520)
    expect(result.activity.truncated).toBe(true)
    expect(result.summary.hours).toBe(520)
    expect(result.summary.labourCost).toBe(52000)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'activity_truncated', source: 'activity' }),
    ]))
  })

  it('exposes source and tracking details only when includeSources is true', async () => {
    const dataset = makeDataset({ xeroLines: [makeXeroLine()] })
    const hidden = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: true,
    }, deps(dataset))
    const visible = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: true, canAllocate: true,
    }, deps(dataset))

    expect(hidden).not.toHaveProperty('sources')
    expect(hidden).not.toHaveProperty('tracking')
    expect(hidden.permissions).toEqual({ canViewSources: false, canAllocate: false })
    expect(visible.sources).toHaveLength(1)
    expect(visible.tracking).toMatchObject({
      selected: { id: 'tracking-astoria', name: 'Astoria Motors' },
    })
    expect(visible.permissions).toEqual({ canViewSources: true, canAllocate: true })
  })

  it('reports freshness independently for invoices, lines, media, time, and expenses', async () => {
    const result = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(makeDataset({
      activeMediaConnection: { exists: true, updatedAt: '2026-08-19T00:00:00.000Z' },
      freshness: {
        xeroInvoices: '2026-08-21T01:00:00.000Z',
        xeroLines: '2026-08-20T02:00:00.000Z',
        media: '2026-08-19T03:00:00.000Z',
        timeEntries: '2026-08-18T04:00:00.000Z',
        projectExpenses: '2026-08-17T05:00:00.000Z',
      },
    })))

    expect(result.freshness.map(item => [item.source, item.updatedAt])).toEqual([
      ['xero_invoices', '2026-08-21T01:00:00.000Z'],
      ['xero_revenue', '2026-08-20T02:00:00.000Z'],
      ['media_spend', '2026-08-19T03:00:00.000Z'],
      ['time_entries', '2026-08-18T04:00:00.000Z'],
      ['project_expenses', '2026-08-17T05:00:00.000Z'],
    ])
  })

  it('keeps operational financials when the client has no Xero contact', async () => {
    const result = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(makeDataset({
      client: { id: 'client-astoria', name: 'Astoria Motors', xeroContactId: null },
      activeMediaConnection: { exists: true, updatedAt: '2026-08-22T00:00:00.000Z' },
      mediaSpend: [{
        id: 'media-1', projectId: 'project-web', platform: 'meta', campaignName: 'Social',
        budgetAllocated: '200.00', actualSpend: '100.00', period: '2026-08',
        connectionId: 'connection-1', syncedAt: '2026-08-22T00:00:00.000Z',
        updatedAt: '2026-08-22T00:00:00.000Z', dailySpend: '100.00', dailyRowCount: 2,
      }],
      timeEntries: [{
        id: 'time-1', projectId: 'project-web', projectName: 'Astoria website',
        date: '2026-08-10', userName: 'Alex', description: null,
        hours: '2.00', hourlyRate: '100.00', createdAt: '2026-08-10T01:00:00.000Z',
      }],
      timeSummaries: [{ projectId: 'project-web', hours: '2.00', labourCost: '200.00' }],
      totalTimeEntries: 1,
    })))

    expect(result.summary).toMatchObject({ mediaSpend: 100, labourCost: 200, hours: 2 })
    expect(result.projects[0]).toMatchObject({ mediaSpend: 100, labourCost: 200, hours: 2 })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'xero_not_linked' }),
    ]))
  })

  it('preserves invoice-header activity when Xero line cache data is unavailable', async () => {
    const result = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(makeDataset({
      xeroLines: [],
      invoices: [{
        id: 'invoice-revenue-1', invoiceNumber: 'INV-1001', type: 'ACCREC',
        status: 'AUTHORISED', date: '2026-08-05', dueDate: '2026-09-05',
        totalCents: '662200', amountPaidCents: '200000', amountDueCents: '462200',
        currencyCode: 'AUD', syncedAt: '2026-08-22T00:00:00.000Z',
      }],
    })))

    expect(result.activity.invoices).toEqual([expect.objectContaining({
      id: 'invoice-revenue-1', total: 6622, amountPaid: 2000, amountDue: 4622,
    })])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'xero_lines_unavailable', source: 'xero_revenue' }),
    ]))
  })

  it('does not report line-cache absence when invoice activity contains only excluded headers', async () => {
    const result = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(makeDataset({
      xeroLines: [],
      invoices: [
        {
          id: 'invoice-draft', invoiceNumber: 'DRAFT-1', type: 'ACCREC', status: 'DRAFT',
          date: '2026-08-05', dueDate: null, totalCents: '10000', amountPaidCents: '0',
          amountDueCents: '10000', currencyCode: 'AUD', syncedAt: '2026-08-22T00:00:00.000Z',
        },
        {
          id: 'invoice-voided', invoiceNumber: 'VOID-1', type: 'ACCREC', status: 'VOIDED',
          date: '2026-08-06', dueDate: null, totalCents: '20000', amountPaidCents: '0',
          amountDueCents: '0', currencyCode: 'AUD', syncedAt: '2026-08-22T00:00:00.000Z',
        },
      ],
    })))

    expect(result.activity.invoices).toHaveLength(2)
    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'xero_lines_unavailable' }),
    ]))
  })

  it('distinguishes a connected confirmed zero from media not connected', async () => {
    const connected = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(makeDataset({
      activeMediaConnection: { exists: true, updatedAt: '2026-08-22T00:00:00.000Z' },
    })))
    const notConnected = await getClientFinancials({
      tenantId: 'tenant-1', clientId: 'client-astoria',
      from: '2026-08-01', to: '2026-08-22', includeSources: false, canAllocate: false,
    }, deps(makeDataset()))

    expect(connected.summary.mediaSpend).toBe(0)
    expect(connected.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'media_not_connected' }),
    ]))
    expect(connected.freshness.find(item => item.source === 'media_spend')?.status).toBe('fresh')
    expect(notConnected.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'media_not_connected' }),
    ]))
    expect(notConnected.freshness.find(item => item.source === 'media_spend')?.status)
      .toBe('not_connected')
  })
})

describe('loadClientFinancialDataset query ownership', () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset()
    dbMocks.queryRows.mockReset()
    dbMocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients client')) {
        return { id: 'client-astoria', name: 'Astoria Motors', xeroContactId: 'contact-astoria' }
      }
      if (sql.includes('FROM social_connections connection')) {
        return { exists: false, updatedAt: null }
      }
      if (sql.includes('SELECT COUNT(*) AS count')) return { count: '0' }
      if (sql.includes('FROM agency_client_xero_tracking_mappings m')) return null
      if (sql.includes('AS "xeroInvoices"')) {
        return {
          xeroInvoices: null,
          xeroLines: null,
          media: null,
          timeEntries: null,
          projectExpenses: null,
        }
      }
      throw new Error(`Unexpected queryOne SQL: ${sql}`)
    })
    dbMocks.queryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_tracking_categories category')) {
        return [{ tenantId: 'tenant-1', id: 'option-1', name: 'Astoria Motors', isActive: true }]
      }
      if (sql.includes('FROM xero_invoice_lines_cache l')) {
        return [{
          lineItemId: 'line-cost-no-header',
          invoiceId: 'bill-no-header',
          invoiceNumber: null,
          invoiceType: 'ACCPAY',
          invoiceDate: '2026-08-10',
          accountCode: '310',
          accountType: 'DIRECTCOSTS',
          description: 'Mapped supplier line',
          lineExGstCents: '30000',
          trackingClient: 'Astoria Motors',
          contactId: null,
          syncedAt: '2026-08-22T00:00:00.000Z',
          allocationProjectId: null,
          allocationFingerprint: null,
        }]
      }
      return []
    })
  })

  it('keeps mapped ACCPAY line-cache rows independent of invoice headers', async () => {
    const result = await loadClientFinancialDataset({
      tenantId: 'tenant-1',
      clientId: 'client-astoria',
      from: '2026-08-01',
      to: '2026-08-22',
      includeSources: true,
    })

    const xeroCall = dbMocks.queryRows.mock.calls.find(([sql]) => (
      String(sql).includes('FROM xero_invoice_lines_cache l')
    ))
    const freshnessCall = dbMocks.queryOne.mock.calls.find(([sql]) => (
      String(sql).includes('AS "xeroLines"')
    ))
    expect(result.xeroLines).toEqual([
      expect.objectContaining({ lineItemId: 'line-cost-no-header', contactId: null }),
    ])
    expect(String(xeroCall?.[0])).toContain('LEFT JOIN xero_invoices_cache i')
    expect(String(xeroCall?.[0])).toContain('UPPER(l.invoice_status)')
    expect(xeroCall?.[1]).toEqual([
      'tenant-1', 'client-astoria', '2026-08-01', '2026-08-22', 'contact-astoria',
    ])
    expect(String(freshnessCall?.[0])).toContain('LEFT JOIN xero_invoices_cache invoice')
    expect(String(freshnessCall?.[0])).toContain('UPPER(line.invoice_status)')
  })

  it('scopes active Client tracking options to the selected tenant', async () => {
    const result = await loadClientFinancialDataset({
      tenantId: 'tenant-1',
      clientId: 'client-astoria',
      from: '2026-08-01',
      to: '2026-08-22',
      includeSources: true,
    })

    const trackingCall = dbMocks.queryRows.mock.calls.find(([sql]) => (
      String(sql).includes('FROM xero_tracking_categories category')
    ))
    expect(String(trackingCall?.[0])).toContain('line.tenant_id = $1')
    expect(trackingCall?.[1]).toEqual(['tenant-1'])
    expect(result.trackingOptions).toEqual([
      { tenantId: 'tenant-1', id: 'option-1', name: 'Astoria Motors', isActive: true },
    ])
  })
})
