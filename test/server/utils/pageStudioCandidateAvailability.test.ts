import { beforeEach, expect, it, vi } from 'vitest'
import { productionCandidateAvailable } from '~~/server/utils/pageStudio/candidateAvailability'

const mocks = vi.hoisted(() => ({ services: vi.fn(), generation: vi.fn(), signing: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/astroBuildHttp', () => ({ resolveAstroBuildServices: mocks.services }))
vi.mock('~~/server/utils/pageStudio/sessions', () => ({ resolvePageStudioSessionEnvironment: mocks.signing }))
const event = () => ({ context: { cloudflare: { env: { PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME: 'review.example.invalid', PAGE_STUDIO_CHECKPOINTS: { get: vi.fn() } as { get?: unknown } } } } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.services.mockReturnValue({ environment: 'production', services: { selectGeneration: mocks.generation } })
  mocks.generation.mockResolvedValue({ environment: 'production' })
  mocks.signing.mockReturnValue({ issuer: 'https://studio.example.invalid', privateKey: 'configured-key' })
})
it('requires a selectable production compiler and valid signing/preview configuration', async () => {
  expect(await productionCandidateAvailable(event() as never)).toBe(true)
  expect(mocks.generation).toHaveBeenCalledWith('production')
  expect(mocks.signing).toHaveBeenCalledOnce()
})
it.each(['bindings', 'registry', 'signing', 'environment', 'hostname', 'storage'])('does not advertise preparation with unavailable %s', async (failure) => {
  const input = event()
  if (failure === 'bindings') mocks.services.mockImplementation(() => {
    throw new Error('Unavailable')
  })
  if (failure === 'registry') mocks.generation.mockRejectedValue(new Error('No approved compiler'))
  if (failure === 'signing') mocks.signing.mockImplementation(() => {
    throw new Error('Missing signing key')
  })
  if (failure === 'environment') mocks.services.mockReturnValue({ environment: 'staging', services: { selectGeneration: mocks.generation } })
  if (failure === 'hostname') input.context.cloudflare.env.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME = ''
  if (failure === 'storage') input.context.cloudflare.env.PAGE_STUDIO_CHECKPOINTS = {}
  expect(await productionCandidateAvailable(input as never)).toBe(false)
})
