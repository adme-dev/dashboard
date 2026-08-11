import { afterEach, describe, expect, it, vi } from 'vitest'

import { xeroFetch } from '../../../server/utils/xeroClient'

function mockResponse(init: {
  status?: number
  json?: unknown
  headers?: Record<string, string>
}) {
  const headers = new Headers(init.headers ?? {})
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    json: async () => init.json ?? {},
    text: async () => JSON.stringify(init.json ?? {}),
  } as unknown as Response
}

describe('xeroFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards extra headers (If-Modified-Since) to the request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ json: { Invoices: [] } }),
    )

    await xeroFetch({
      accessToken: 'tok',
      tenantId: 'tenant-1',
      path: 'Invoices?page=1',
      headers: { 'If-Modified-Since': 'Mon, 10 Aug 2026 00:00:00 GMT' },
    })

    const [, requestInit] = fetchSpy.mock.calls[0]!
    expect((requestInit!.headers as Record<string, string>)['If-Modified-Since'])
      .toBe('Mon, 10 Aug 2026 00:00:00 GMT')
    // Extra headers must not clobber auth/tenant headers
    expect((requestInit!.headers as Record<string, string>)['Authorization']).toBe('Bearer tok')
    expect((requestInit!.headers as Record<string, string>)['Xero-Tenant-Id']).toBe('tenant-1')
  })

  it('returns an empty object on 304 Not Modified instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({ status: 304 }))

    const result = await xeroFetch({
      accessToken: 'tok',
      tenantId: 'tenant-1',
      path: 'Contacts?page=1',
    })

    expect(result).toEqual({})
  })

  it('logs remaining daily quota and warns when it runs low', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ json: {}, headers: { 'x-daylimit-remaining': '4200', 'x-minlimit-remaining': '58' } }),
    )
    await xeroFetch({ accessToken: 'tok', tenantId: 't', path: 'Reports/BankSummary' })
    expect(info).toHaveBeenCalledWith('[xero-quota] path=Reports/BankSummary day=4200 min=58')
    expect(warn).not.toHaveBeenCalled()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ json: {}, headers: { 'x-daylimit-remaining': '120', 'x-minlimit-remaining': '58' } }),
    )
    await xeroFetch({ accessToken: 'tok', tenantId: 't', path: 'Invoices?page=2' })
    expect(warn).toHaveBeenCalledWith('[xero-quota] path=Invoices day=120 min=58')
  })
})
