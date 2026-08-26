import { describe, expect, it, vi } from 'vitest'
import publisher from '../../workers/search-authority-publisher/src/index'

function object(body: string, contentType: string) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body))
        controller.close()
      }
    }),
    httpEtag: '"test-etag"',
    text: async () => body,
    writeHttpMetadata(headers: Headers) { headers.set('content-type', contentType) }
  }
}

function env() {
  const hostname = 'learn.knoxgwmhaval.com.au'
  const htmlKey = `hosts/${hostname}/versions/a/b/index.html`
  const manifest = JSON.stringify({
    schemaVersion: 1,
    hostname,
    manifestVersion: 'manifest-1',
    publicationId: '33333333-3333-4333-8333-333333333333',
    versionId: '22222222-2222-4222-8222-222222222222',
    activatedAt: '2026-08-03T02:00:00.000Z',
    publicId: '44444444-4444-4444-8444-444444444444',
    mode: 'subdomain',
    guides: [{ slug: 'cannon-alpha-towing-guide', title: 'Cannon Alpha towing guide', excerpt: 'Towing guidance.', publishedAt: '2026-08-03T02:00:00.000Z' }],
    routes: {
      '/guides/cannon-alpha-towing-guide': { key: htmlKey, contentType: 'text/html; charset=utf-8', etag: 'test-etag' },
      '/guides': { key: `hosts/${hostname}/versions/a/b/hub.html`, contentType: 'text/html; charset=utf-8', etag: 'hub-etag' },
      '/guides/sitemap.xml': { key: `hosts/${hostname}/versions/a/b/sitemap.xml`, contentType: 'application/xml; charset=utf-8', etag: 'sitemap' },
      '/sitemap.xml': { key: `hosts/${hostname}/versions/a/b/sitemap.xml`, contentType: 'application/xml; charset=utf-8', etag: 'sitemap' },
      '/robots.txt': { key: `hosts/${hostname}/versions/a/b/robots.txt`, contentType: 'text/plain; charset=utf-8', etag: 'robots' }
    },
    redirects: { '/': '/guides/cannon-alpha-towing-guide' }
  })
  const objects = new Map([
    [`hosts/${hostname}/manifests/current.json`, object(manifest, 'application/json')],
    [htmlKey, object('<!doctype html><h1>Cannon Alpha towing guide</h1>', 'text/html; charset=utf-8')],
    [`hosts/${hostname}/versions/a/b/hub.html`, object('<!doctype html><h1>Buying guides</h1>', 'text/html; charset=utf-8')],
    [`hosts/${hostname}/versions/a/b/sitemap.xml`, object('<?xml version="1.0"?><urlset/>', 'application/xml; charset=utf-8')],
    ['aliases/44444444-4444-4444-8444-444444444444.json', object(JSON.stringify({ hostname, mode: 'same_host' }), 'application/json')]
  ])
  return {
    PUBLICATIONS: {
      get: vi.fn(async (key: string) => objects.get(key) || null),
      head: vi.fn(async (key: string) => objects.get(key) || null)
    }
  }
}

describe('Search Authority publisher Worker', () => {
  it('streams a published guide with security and cache headers', async () => {
    const response = await publisher.fetch(
      new Request('https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide'),
      env() as never,
      {} as never
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Cannon Alpha towing guide')
    expect(response.headers.get('content-security-policy')).toContain('default-src \'self\'')
    expect(response.headers.get('cache-control')).toContain('public')
    expect(response.headers.get('etag')).toBe('"test-etag"')
  })

  it('redirects the host root and returns real 404s for unknown hosts and slugs', async () => {
    const known = env()
    const root = await publisher.fetch(new Request('https://learn.knoxgwmhaval.com.au/'), known as never, {} as never)
    const slug = await publisher.fetch(new Request('https://learn.knoxgwmhaval.com.au/guides/not-published'), known as never, {} as never)
    const host = await publisher.fetch(new Request('https://unknown.example/guides/test'), known as never, {} as never)

    expect(root.status).toBe(302)
    expect(root.headers.get('location')).toBe('https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide')
    expect(slug.status).toBe(404)
    expect(host.status).toBe(404)
  })

  it('supports HEAD without buffering the stored object body', async () => {
    const runtime = env()
    const response = await publisher.fetch(
      new Request('https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide', { method: 'HEAD' }),
      runtime as never,
      {} as never
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
    expect(runtime.PUBLICATIONS.get).toHaveBeenCalledTimes(1)
    expect(runtime.PUBLICATIONS.head).toHaveBeenCalledTimes(1)
  })

  it('serves the guides hub and stamps the site public id on responses', async () => {
    const hub = await publisher.fetch(new Request('https://learn.knoxgwmhaval.com.au/guides'), env() as never, {} as never)
    expect(hub.status).toBe(200)
    expect(await hub.text()).toContain('Buying guides')
    expect(hub.headers.get('x-xeroflow-publisher')).toBe('44444444-4444-4444-8444-444444444444')
  })

  it('serves same-host rewrites under /s/<publicId>/ by resolving the host alias', async () => {
    const known = env()
    const guide = await publisher.fetch(
      new Request('https://publish.xeroflowpages.com/s/44444444-4444-4444-8444-444444444444/guides/cannon-alpha-towing-guide'),
      known as never,
      {} as never
    )
    expect(guide.status).toBe(200)
    expect(await guide.text()).toContain('Cannon Alpha towing guide')
    expect(guide.headers.get('x-xeroflow-publisher')).toBe('44444444-4444-4444-8444-444444444444')

    const health = await publisher.fetch(
      new Request('https://publish.xeroflowpages.com/s/44444444-4444-4444-8444-444444444444/guides/healthz'),
      known as never,
      {} as never
    )
    expect(health.status).toBe(200)
    expect(health.headers.get('x-xeroflow-publisher')).toBe('44444444-4444-4444-8444-444444444444')
    expect(await health.json()).toEqual({ ok: true, publicId: '44444444-4444-4444-8444-444444444444' })

    const sitemap = await publisher.fetch(
      new Request('https://publish.xeroflowpages.com/s/44444444-4444-4444-8444-444444444444/guides/sitemap.xml'),
      known as never,
      {} as never
    )
    expect(sitemap.status).toBe(200)

    const unknownAlias = await publisher.fetch(
      new Request('https://publish.xeroflowpages.com/s/55555555-5555-4555-8555-555555555555/guides/cannon-alpha-towing-guide'),
      known as never,
      {} as never
    )
    expect(unknownAlias.status).toBe(404)
  })
})
