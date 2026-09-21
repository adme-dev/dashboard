import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePageStudioHttpActor } from '~~/server/utils/pageStudio/httpActor'

const mocks = vi.hoisted(() => ({ agency: vi.fn(), portal: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
const event = {} as never
describe('shared native Page Studio HTTP actor framing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.agency.mockResolvedValue({ tenantId: 'native-tenant', user: { id: 'native-user' } })
    mocks.portal.mockResolvedValue({ id: 'native-client-user', clientId: 'native-client' })
  })
  it('requires EDIT directly for agency writes', async () => {
    expect(await resolvePageStudioHttpActor(event, 'agency', true)).toEqual({ role: 'agency', actorId: 'native-user', tenantId: 'native-tenant', canEdit: true })
    expect(mocks.agency.mock.calls).toEqual([[event, 'PAGE_STUDIO_EDIT']])
  })
  it('checks VIEW then EDIT for agency reads', async () => {
    expect(await resolvePageStudioHttpActor(event, 'agency', false)).toMatchObject({ canEdit: true })
    expect(mocks.agency.mock.calls).toEqual([[event, 'PAGE_STUDIO_VIEW'], [event, 'PAGE_STUDIO_EDIT']])
  })
  it('returns read-only actor only for a denied optional EDIT check', async () => {
    mocks.agency.mockResolvedValueOnce({ tenantId: 'native-tenant', user: { id: 'native-user' } })
      .mockRejectedValueOnce({ statusCode: 403 })
    expect(await resolvePageStudioHttpActor(event, 'agency', false)).toMatchObject({ canEdit: false })
  })
  it('propagates optional EDIT authority outages', async () => {
    mocks.agency.mockResolvedValueOnce({ tenantId: 'native-tenant', user: { id: 'native-user' } })
      .mockRejectedValueOnce({ statusCode: 503 })
    await expect(resolvePageStudioHttpActor(event, 'agency', false)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('does not downgrade denied agency writes to VIEW', async () => {
    mocks.agency.mockRejectedValue({ statusCode: 403 })
    await expect(resolvePageStudioHttpActor(event, 'agency', true)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.agency).toHaveBeenCalledTimes(1)
  })
  it.each([true, false])('uses native portal identity for writing=%s', async (writing) => {
    expect(await resolvePageStudioHttpActor(event, 'portal', writing)).toEqual({ role: 'client', actorId: 'native-client-user', clientId: 'native-client' })
    expect(mocks.agency).not.toHaveBeenCalled()
  })
})
