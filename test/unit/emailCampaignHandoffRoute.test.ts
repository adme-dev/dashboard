import { beforeEach, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/design/roundtrip.post'
import { structuredDesign } from '../fixtures/email-design/structured'

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), publisher: vi.fn(), execute: vi.fn(), body: vi.fn(), headers: {} as Record<string, string> }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), defineEventHandler: (f: unknown) => f, getCookie: () => 'token', getHeader: (_e: unknown, key: string) => mocks.headers[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: mocks.access, assertFreshDesignPublisher: mocks.publisher }))
vi.mock('~~/server/utils/email-marketing/designHandoffs', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designHandoffs')>()), executeDesignRoundtrip: mocks.execute }))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({ createEmailRenderer: () => ({}) }))
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designRequest')>()), readBoundedJson: mocks.body }))
const id = '10000000-0000-4000-8000-000000000001'
const event = () => ({ context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' } } } }) as unknown as Parameters<typeof handler>[0]
beforeEach(() => {
  vi.resetAllMocks()
  mocks.headers = { 'origin': 'https://app.xeroflow.io', 'content-type': 'application/json' }
  mocks.session.mockResolvedValue({ id })
  mocks.access.mockResolvedValue('designer')
  mocks.body.mockResolvedValue({ command: 'lookup', owner: { kind: 'campaign', id } })
  mocks.execute.mockResolvedValue({ owner: { kind: 'campaign', id }, mutable: true, clientId: id, draft: null })
})
it('discovers legacy campaign entry through fresh authority without creating a baseline', async () => {
  expect(await handler(event())).toMatchObject({ draft: null, campaignAuthoring: { available: true, contentImagesAvailable: false } })
  expect(mocks.access).toHaveBeenCalledWith('token', id, id, 'write')
  expect(mocks.execute.mock.calls[0][0]).toEqual({ command: 'lookup', owner: { kind: 'campaign', id } })
})
it('keeps staff structure unavailable while advertising only registered image replacement for a current campaign', async () => {
  mocks.access.mockResolvedValue('staff')
  const design = { ...structuredDesign(), kind: 'campaign-draft' }
  mocks.execute.mockResolvedValue({ owner: { kind: 'campaign', id }, mutable: true, clientId: id, draft: { state: 'structured', source: design } })
  expect(await handler(event())).toMatchObject({ campaignAuthoring: { available: false, contentImagesAvailable: true }, designerAuthoring: { available: false }, libraryAuthoring: { available: false } })
})
it('refuses frozen, revoked and disabled campaign authoring discovery', async () => {
  mocks.execute.mockResolvedValueOnce({ owner: { kind: 'campaign', id }, mutable: false, clientId: id, draft: null })
  expect(await handler(event())).toMatchObject({ campaignAuthoring: { available: false, contentImagesAvailable: false } })
  mocks.access.mockRejectedValueOnce(Object.assign(new Error('revoked'), { statusCode: 403 }))
  expect(await handler(event())).toMatchObject({ campaignAuthoring: { available: false } })
  const disabled = event()
  disabled.context.cloudflare!.env.FIGFLOW_EDM_DESIGNER_ENABLED = 'false'
  expect(await handler(disabled)).toMatchObject({ campaignAuthoring: { available: false } })
})
