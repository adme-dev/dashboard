import { describe, it, expect, vi } from 'vitest'
import { listManagedPages, subscribePageWebhook } from '~~/server/utils/socialOAuth/meta'

function fakeFetch(payload: any, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => payload, text: async () => JSON.stringify(payload) }))
}

describe('listManagedPages', () => {
  it('maps Graph /me/accounts into ManagedPage[] incl. linked IG', async () => {
    const f = fakeFetch({ data: [
      { id: 'P1', name: 'Acme', access_token: 'PT1', category: 'Brand',
        instagram_business_account: { id: 'IG1', username: 'acme_ig' } },
      { id: 'P2', name: 'Beta', access_token: 'PT2' },
    ] })
    const pages = await listManagedPages('USERTOKEN', f as any)
    expect(f).toHaveBeenCalledOnce()
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatchObject({ id: 'P1', name: 'Acme', accessToken: 'PT1', igId: 'IG1', igUsername: 'acme_ig' })
    expect(pages[1]).toMatchObject({ id: 'P2', accessToken: 'PT2' })
    expect(pages[1].igId).toBeUndefined()
  })
  it('returns [] when Graph returns no data', async () => {
    expect(await listManagedPages('T', fakeFetch({ data: [] }) as any)).toEqual([])
  })
  it('throws on a Graph error response', async () => {
    const f = fakeFetch({ error: { message: 'bad token' } }, false, 400)
    await expect(listManagedPages('T', f as any)).rejects.toThrow(/bad token/)
  })
})

describe('subscribePageWebhook', () => {
  it('POSTs subscribed_apps with feed and returns ok on success', async () => {
    const f = fakeFetch({ success: true })
    const r = await subscribePageWebhook('P1', 'PT1', f as any)
    expect(r.ok).toBe(true)
    const url = (f as any).mock.calls[0][0] as string
    expect(url).toContain('/P1/subscribed_apps')
    expect(decodeURIComponent(url)).toContain('feed')
  })
  it('returns ok:false + error on a Graph failure (does not throw — caller records last_error)', async () => {
    const r = await subscribePageWebhook('P1', 'PT1', fakeFetch({ error: { message: 'no perm' } }, false, 403) as any)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no perm/)
  })
})
