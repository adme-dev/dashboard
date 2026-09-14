import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), attach: vi.fn(), verify: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/domainManagementClient', () => ({ callDomainManagement: mocks.rpc, attachPageStudioDomain: mocks.attach, refreshPageStudioDomain: mocks.verify }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), getHeader: (event: Event, key: string) => event.headers?.[key], getRequestWebStream: (event: Event) => event.stream ?? (event.raw === undefined
  ? undefined
  : new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(event.raw))
      controller.close()
    } })) }))
const siteId = '50000000-0000-4000-8000-000000000001'
const domainId = '60000000-0000-4000-8000-000000000001'
const user = { id: '30000000-0000-4000-8000-000000000001', clientId: '40000000-0000-4000-8000-000000000001', role: 'manager' }
interface Event { params: Record<string, string>, query: Record<string, unknown>, raw?: string, stream?: ReadableStream, headers?: Record<string, string> }
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: Event, key: string) => event.params[key])
vi.stubGlobal('getQuery', (event: Event) => event.query)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('setResponseStatus', vi.fn())
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input))
const { default: list } = await import('~~/server/api/portal/page-studio/sites/[siteId]/domains/index.get')
const { default: attach } = await import('~~/server/api/portal/page-studio/sites/[siteId]/domains/index.post')
const { default: verify } = await import('~~/server/api/portal/page-studio/sites/[siteId]/domains/[domainId]/verify.post')
const event = (): Event => ({ params: { siteId, domainId }, query: {}, raw: JSON.stringify({ hostname: 'www.customer.example' }) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(user)
  mocks.rpc.mockResolvedValue({ siteId, canManage: false, domains: [] })
  mocks.attach.mockResolvedValue({ id: domainId })
  mocks.verify.mockResolvedValue({ id: domainId })
})
describe('portal domain HTTP boundaries', () => {
  it.each([list, attach, verify])('authenticates before private management execution', async (handler) => {
    mocks.auth.mockRejectedValue(Object.assign(new Error('Denied'), { statusCode: 401 }))
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('sends selected client identity while tenant is derived inside the private Worker', async () => {
    const input = event()
    await expect(attach(input as never)).resolves.toEqual({ domain: { id: domainId } })
    expect(mocks.attach).toHaveBeenCalledExactlyOnceWith({ kind: 'portal', actorId: user.id, clientId: user.clientId, siteId, event: input, hostname: 'www.customer.example' })
  })
  it.each([{ hostname: 'customer.example', tenantId: 'foreign' }, { hostname: 'customer.example', kind: 'agency' }, { hostname: 'customer.example', clientId: 'foreign' }])('rejects supplied scope before RPC', async (body) => {
    await expect(attach({ ...event(), raw: JSON.stringify(body) } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.attach).not.toHaveBeenCalled()
  })
  it.each(['not-json', 'x'.repeat(2049), JSON.stringify({ hostname: 'https://customer.example' })])('rejects invalid or oversized bodies', async (raw) => {
    await expect(attach({ ...event(), raw } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.attach).not.toHaveBeenCalled()
  })
  it.each([list, attach, verify])('rejects supplied scope in query', async (handler) => {
    await expect(handler({ ...event(), query: { tenantId: 'foreign' } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('preserves the private service viewer capability and selected scope', async () => {
    const input = event()
    await expect(list(input as never)).resolves.toEqual({ siteId, canManage: false, domains: [] })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(input, { operation: 'list', actor: { kind: 'portal', actorId: user.id, clientId: user.clientId }, siteId })
  })
  it('rejects scope in verification body', async () => {
    await expect(verify({ ...event(), raw: JSON.stringify({ tenantId: 'foreign' }) } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('returns the saved verification identity and marks responses private', async () => {
    const input = { ...event(), raw: undefined }
    await expect(verify(input as never)).resolves.toEqual({ domain: { id: domainId } })
    expect(setHeader).toHaveBeenCalledWith(input, 'cache-control', 'private, no-store')
    expect(mocks.verify).toHaveBeenCalledWith({ kind: 'portal', actorId: user.id, clientId: user.clientId, event: input, domainId, siteId })
  })
  it('cancels chunked input immediately at the observed limit without content-length', async () => {
    let pulls = 0
    const cancel = vi.fn()
    const stream = new ReadableStream({ pull(controller) {
      pulls++
      controller.enqueue(new Uint8Array(1024))
    }, cancel }, { highWaterMark: 0 })
    await expect(attach({ ...event(), stream } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(pulls).toBe(3)
    expect(cancel).toHaveBeenCalledOnce()
    expect(mocks.attach).not.toHaveBeenCalled()
  })
  it('rejects invalid UTF-8 instead of repairing it into a different payload', async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([0xc3, 0x28]))
      controller.close()
    } })
    await expect(attach({ ...event(), stream } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.attach).not.toHaveBeenCalled()
  })
  it('rejects excessive declared length before reading bytes', async () => {
    const pull = vi.fn()
    const stream = new ReadableStream({ pull }, { highWaterMark: 0 })
    await expect(attach({ ...event(), stream, headers: { 'content-length': '2049' } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(pull).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })
  it('does not leak unknown provider failures', async () => {
    mocks.attach.mockRejectedValue(new Error('provider-secret credentials'))
    await expect(attach(event() as never)).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Page Studio request failed' })
  })
})
