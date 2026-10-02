import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'

const database = vi.hoisted(() => ({ queryOne: vi.fn(), queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => database)

const disabledPolicy = { enabled: false, monthlyCapCents: 0, allowedModelIds: [] }
const clientProfile = {
  enabled: true,
  monthly_cap_cents: '4500',
  allowed_model_ids: ['aigateway/seedance-i2v', 'muapi/seedance-2.0']
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ENABLED', '')
  vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ID', '')
  vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_CAP_CENTS', '')
  database.queryOne.mockResolvedValue(null)
  database.queryOneFresh.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('client video generation policy', () => {
  it('enables a production client with its saved cap and model allowlist', async () => {
    database.queryOneFresh.mockResolvedValue(clientProfile)

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual({
      enabled: true,
      monthlyCapCents: 4500,
      allowedModelIds: clientProfile.allowed_model_ids
    })
  })

  it('keeps a client without a saved profile disabled', async () => {
    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual(disabledPolicy)
  })

  it('keeps an explicitly disabled profile disabled regardless of its stored cap', async () => {
    database.queryOneFresh.mockResolvedValue({ ...clientProfile, enabled: false })

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual(disabledPolicy)
  })

  it('uses the current profile when a previously enabled client is disabled', async () => {
    database.queryOneFresh.mockResolvedValueOnce(clientProfile)
    database.queryOneFresh.mockResolvedValueOnce({ ...clientProfile, enabled: false })

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toMatchObject({ enabled: true })
    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual(disabledPolicy)
  })

  it('does not substitute another client profile for the agency or an unconfigured client', async () => {
    database.queryOneFresh.mockImplementation(async (_sql: string, params: unknown[]) => (
      params[0] === 'dealer-1' ? clientProfile : null
    ))

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toMatchObject({ enabled: true })
    await expect(loadTenantVideoGenerationPolicy('dealer-2')).resolves.toEqual(disabledPolicy)
    await expect(loadTenantVideoGenerationPolicy('agency')).resolves.toEqual(disabledPolicy)
  })

  it('retains the explicit environment test tenant fallback when no saved profile exists', async () => {
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ENABLED', 'true')
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ID', 'agency, dealer-1')
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_CAP_CENTS', '1500')

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toMatchObject({ enabled: true, monthlyCapCents: 1500 })
    await expect(loadTenantVideoGenerationPolicy('agency')).resolves.toMatchObject({ enabled: true, monthlyCapCents: 1500 })
    await expect(loadTenantVideoGenerationPolicy('dealer-2')).resolves.toEqual(disabledPolicy)
  })

  it('does not let the environment test fallback override an explicitly disabled profile', async () => {
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ENABLED', 'true')
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ID', 'dealer-1')
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_CAP_CENTS', '1500')
    database.queryOneFresh.mockResolvedValue({ ...clientProfile, enabled: false })

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual(disabledPolicy)
  })

  it('uses the saved client cap and models ahead of the environment test fallback', async () => {
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ENABLED', 'true')
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_ID', 'dealer-1')
    vi.stubEnv('VIDEO_GENERATION_TEST_TENANT_CAP_CENTS', '1500')
    database.queryOneFresh.mockResolvedValue(clientProfile)

    await expect(loadTenantVideoGenerationPolicy('dealer-1')).resolves.toEqual({
      enabled: true,
      monthlyCapCents: 4500,
      allowedModelIds: clientProfile.allowed_model_ids
    })
  })
})
