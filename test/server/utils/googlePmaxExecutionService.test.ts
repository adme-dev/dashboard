import { describe, expect, it, vi } from 'vitest'
import {
  executeGooglePmaxActivation,
  executeGooglePmaxPausedCreate,
  googlePmaxExecutionPolicy
} from '~~/server/utils/googlePmaxExecutionService'

const input = {
  event: {} as never,
  launchId: '5c4ca47b-df3a-43cd-b82f-a23a3f03a781',
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  actorId: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

describe('Google PMax execution kill switches', () => {
  it('keeps all provider writes dormant by default and activation independently gated', () => {
    expect(googlePmaxExecutionPolicy({})).toEqual({
      providerWritesEnabled: false, activationEnabled: false
    })
    expect(googlePmaxExecutionPolicy({ GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true' })).toEqual({
      providerWritesEnabled: true, activationEnabled: false
    })
    expect(googlePmaxExecutionPolicy({
      GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true', GOOGLE_PMAX_ACTIVATION_ENABLED: 'true'
    })).toEqual({ providerWritesEnabled: true, activationEnabled: true })
  })

  it('never invokes the executor while the corresponding gate is closed', async () => {
    const executor = {
      createAndVerify: vi.fn(), activateAndVerify: vi.fn()
    } as never
    await expect(executeGooglePmaxPausedCreate(input, {
      env: () => ({}), executor
    })).rejects.toMatchObject({ code: 'PMAX_PROVIDER_WRITES_DISABLED' })
    await expect(executeGooglePmaxActivation(input, {
      env: () => ({ GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true' }), executor
    })).rejects.toMatchObject({ code: 'PMAX_ACTIVATION_DISABLED' })
    expect((executor as { createAndVerify: ReturnType<typeof vi.fn> }).createAndVerify).not.toHaveBeenCalled()
    expect((executor as { activateAndVerify: ReturnType<typeof vi.fn> }).activateAndVerify).not.toHaveBeenCalled()
  })

  it('routes paused creation and activation through distinct executor methods', async () => {
    const executor = {
      createAndVerify: vi.fn().mockResolvedValue({ launch: { state: 'VERIFIED_PAUSED' } }),
      activateAndVerify: vi.fn().mockResolvedValue({ launch: { state: 'ENABLED_VERIFIED' } })
    } as never
    await expect(executeGooglePmaxPausedCreate(input, {
      env: () => ({ GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true' }), executor
    })).resolves.toMatchObject({ launch: { state: 'VERIFIED_PAUSED' } })
    await expect(executeGooglePmaxActivation(input, {
      env: () => ({
        GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true', GOOGLE_PMAX_ACTIVATION_ENABLED: 'true'
      }), executor
    })).resolves.toMatchObject({ launch: { state: 'ENABLED_VERIFIED' } })
  })
})
