import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncXeroTrackingCategories } from '~~/server/utils/invoicing/tracking-categories'

const mocks = vi.hoisted(() => ({
  createXeroClient: vi.fn(),
  execute: vi.fn(),
  getActiveTokenForSession: vi.fn(),
  getSelectedTenant: vi.fn(),
  getTrackingCategories: vi.fn(),
  queryRows: vi.fn(),
}))

vi.mock('~~/server/utils/xeroClient', () => ({
  createXeroClient: mocks.createXeroClient,
}))

vi.mock('~~/server/utils/tokenStore', () => ({
  getActiveTokenForSession: mocks.getActiveTokenForSession,
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: mocks.getSelectedTenant,
}))

vi.mock('~~/server/utils/db', () => ({
  execute: mocks.execute,
  queryRows: mocks.queryRows,
}))

describe('syncXeroTrackingCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getActiveTokenForSession.mockResolvedValue({ access_token: 'test-token' })
    mocks.getSelectedTenant.mockResolvedValue('tenant-1')
    mocks.getTrackingCategories.mockResolvedValue({
      body: {
        trackingCategories: [{
          name: 'Client',
          trackingCategoryID: 'xero-category-client',
          options: [{
            name: 'Unused New Client',
            trackingOptionID: 'xero-option-unused',
            status: 'ACTIVE',
          }],
        }],
      },
    })
    mocks.createXeroClient.mockResolvedValue({
      accountingApi: { getTrackingCategories: mocks.getTrackingCategories },
    })
    mocks.execute.mockResolvedValue(undefined)
    mocks.queryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_tracking_categories')) return [{ id: 'category-db-1' }]
      if (sql.includes('FROM xero_tracking_options')) return []
      return []
    })
  })

  it('persists the selected tenant and resolves the category through that ownership', async () => {
    const result = await syncXeroTrackingCategories({} as H3Event)

    const categoryWrite = mocks.execute.mock.calls.find(([sql]) => (
      String(sql).includes('INSERT INTO xero_tracking_categories')
    ))
    const categoryRead = mocks.queryRows.mock.calls.find(([sql]) => (
      String(sql).includes('FROM xero_tracking_categories')
    ))

    expect(String(categoryWrite?.[0])).toContain('(tenant_id, xero_category_id, name, status, synced_at)')
    expect(String(categoryWrite?.[0])).toContain('tenant_id = COALESCE(xero_tracking_categories.tenant_id, EXCLUDED.tenant_id)')
    expect(String(categoryWrite?.[0])).toContain('xero_tracking_categories.tenant_id = EXCLUDED.tenant_id')
    expect(categoryWrite?.[1]).toEqual(['tenant-1', 'xero-category-client', 'Client'])
    expect(String(categoryRead?.[0])).toContain('tenant_id = $2')
    expect(categoryRead?.[1]).toEqual(['xero-category-client', 'tenant-1'])
    expect(result).toEqual({ synced: 0, added: 1, categories: ['Client'] })
  })

  it('keeps existing option enrichment fields untouched during sync', async () => {
    mocks.queryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM xero_tracking_categories')) return [{ id: 'category-db-1' }]
      if (sql.includes('FROM xero_tracking_options')) return [{ id: 'option-db-1' }]
      return []
    })

    const result = await syncXeroTrackingCategories({} as H3Event)
    const optionWrite = mocks.execute.mock.calls.find(([sql]) => (
      String(sql).includes('UPDATE xero_tracking_options')
    ))

    expect(String(optionWrite?.[0])).toContain('SET xero_option_id = $1, status = $2, synced_at = NOW()')
    expect(String(optionWrite?.[0])).not.toMatch(/coa_code|gst_type|description|vendors/)
    expect(result).toEqual({ synced: 1, added: 0, categories: ['Client'] })
  })
})
