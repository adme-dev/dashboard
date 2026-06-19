import { afterEach, describe, expect, it } from 'vitest'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'

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
})
