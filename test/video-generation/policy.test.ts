import { afterEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

import { getTenantVideoGenerationSpendCents, loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL } from '~~/shared/video/generationLiability'

afterEach(() => {
  delete process.env.VIDEO_GENERATION_TEST_TENANT_ENABLED
  delete process.env.VIDEO_GENERATION_TEST_TENANT_ID
  delete process.env.VIDEO_GENERATION_TEST_TENANT_CAP_CENTS
})

describe('video generation tenant policy', () => {
  it('defaults disabled', async () => {
    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual({
      enabled: false,
      monthlyCapCents: 0,
      allowedModelIds: [],
    })
  })

  it('keeps the test policy disabled without an explicit test tenant id', async () => {
    process.env.VIDEO_GENERATION_TEST_TENANT_ENABLED = 'true'

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual({
      enabled: false,
      monthlyCapCents: 0,
      allowedModelIds: [],
    })
  })

  it('enables only the configured test tenant', async () => {
    process.env.VIDEO_GENERATION_TEST_TENANT_ENABLED = 'true'
    process.env.VIDEO_GENERATION_TEST_TENANT_ID = 'dealer-1'
    process.env.VIDEO_GENERATION_TEST_TENANT_CAP_CENTS = '2500'

    await expect(loadTenantVideoGenerationPolicy('dealer-2')).resolves.toEqual({
      enabled: false,
      monthlyCapCents: 0,
      allowedModelIds: [],
    })
    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toMatchObject({
      enabled: true,
      monthlyCapCents: 2500,
    })
  })

  it('supports a comma-separated test tenant allowlist', async () => {
    process.env.VIDEO_GENERATION_TEST_TENANT_ENABLED = 'true'
    process.env.VIDEO_GENERATION_TEST_TENANT_ID = 'agency, dealer-1'
    process.env.VIDEO_GENERATION_TEST_TENANT_CAP_CENTS = '1500'

    await expect(loadTenantVideoGenerationPolicy('agency')).resolves.toMatchObject({
      enabled: true,
      monthlyCapCents: 1500,
    })
    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toMatchObject({
      enabled: true,
      monthlyCapCents: 1500,
    })
    await expect(loadTenantVideoGenerationPolicy('dealer-2')).resolves.toEqual({
      enabled: false,
      monthlyCapCents: 0,
      allowedModelIds: [],
    })
  })

  it('reads the shared liability sum, which keeps unresolved charges across months', async () => {
    mockQueryOne.mockResolvedValueOnce({ total: '15' })

    await expect(getTenantVideoGenerationSpendCents('dealer-1')).resolves.toBe(15)
    expect(mockQueryOne).toHaveBeenCalledWith(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL, ['dealer-1'])
    expect(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL).toContain("liability_state IN ('reserved', 'uncertain')")
    expect(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL).toContain("liability_state = 'reported'")
    expect(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL).not.toContain("status IN ('queued','running','succeeded')")
    expect(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL).not.toContain('project_id')
  })
})
