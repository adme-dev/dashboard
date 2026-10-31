import { describe, expect, it, vi } from 'vitest'
import { extractBrandWebsite, fetchBrandWebsiteLogo, fetchBrandWebsiteResource, readBrandCssSignals } from '~~/server/utils/banner/websiteExtraction'

const resolver = { resolve4: async () => ['93.184.215.14'], resolve6: async () => [] }
const response = (body: string | Uint8Array, type = 'text/html', status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': type, ...headers } })
const dependencies = (handler: (url: string) => Response) => ({ resolver, fetcher: vi.fn(async (url: string | URL | Request) => handler(String(url))) as unknown as typeof fetch })

describe('bounded public brand website extraction', () => {
  it('reads external CSS and imports relative to final response URLs without downloading fonts', async () => {
    const deps = dependencies((url) => {
      if (url === 'https://brand.example/') return response('', 'text/html', 302, { location: '/shop/' })
      if (url === 'https://brand.example/shop/') return response(`<title>Example</title><meta content="Example Brand" property="og:site_name"><meta name="theme-color" content="#123"><link href="css/main.css" rel="stylesheet"><img alt="Brand logo" src="../logo.svg"><style>.local{color:#abc}</style>`)
      if (url.endsWith('/shop/css/main.css')) return response('@import url(type.css); body{font-family:"Dealer Sans",sans-serif;font-weight:400;background:#abcdef}h1{font-family:"Dealer Display";font-weight:700;color:#f90}', 'text/css')
      if (url.endsWith('/shop/css/type.css')) return response('@font-face{font-family:"Dealer Sans";font-weight:600;src:url(secret-font.woff2)}', 'text/css')
      throw new Error(`Unexpected fetch: ${url}`)
    })
    const page = await extractBrandWebsite('https://brand.example/', deps)
    expect(page.url).toBe('https://brand.example/shop/')
    expect(page.brandName).toBe('Example Brand')
    expect(page.fonts).toEqual([{ role: 'heading', family: 'Dealer Sans', weights: [400, 600] }, { role: 'body', family: 'Dealer Display', weights: [700] }])
    expect(page.primaryColors).toEqual(expect.arrayContaining(['#aabbcc', '#abcdef', '#ff9900']))
    expect(page.logoCandidates).toEqual(['https://brand.example/logo.svg'])
    expect(page.stylesheetsRead).toBe(2)
    expect(page.warnings.join(' ')).toContain('no font files were downloaded')
    expect(deps.fetcher).toHaveBeenCalledTimes(4)
    expect(vi.mocked(deps.fetcher).mock.calls.every(([, options]) => options?.redirect === 'manual' && !!options.signal)).toBe(true)
  })

  it.each(['http://127.0.0.1/private', 'http://169.254.169.254/latest/meta-data', 'https://[::1]/', 'file:///etc/passwd', 'https://user:password@brand.example/'])('blocks unsafe source %s before fetching', async (url) => {
    const deps = dependencies(() => response('secret'))
    await expect(fetchBrandWebsiteResource(url, 'html', deps)).rejects.toThrow()
    expect(deps.fetcher).not.toHaveBeenCalled()
  })

  it('blocks mixed private DNS answers before website transport', async () => {
    const deps = { ...dependencies(() => response('secret')), resolver: { resolve4: async () => ['93.184.215.14', '10.1.2.3'], resolve6: async () => [] } }
    await expect(fetchBrandWebsiteResource('https://brand.example/', 'html', deps)).rejects.toThrow()
    expect(deps.fetcher).not.toHaveBeenCalled()
  })

  it.each(['html', 'css', 'logo'] as const)('rechecks %s redirect targets and never requests internal destinations', async (kind) => {
    const deps = dependencies(() => response('', 'text/html', 302, { location: 'http://169.254.169.254/private' }))
    await expect(fetchBrandWebsiteResource('https://brand.example/resource', kind, deps)).rejects.toThrow()
    expect(deps.fetcher).toHaveBeenCalledTimes(1)
  })

  it('bounds redirect chains and cancels streamed bodies that exceed the byte limit', async () => {
    const redirects = dependencies(url => response('', 'text/html', 302, { location: `${url}next` }))
    await expect(fetchBrandWebsiteResource('https://brand.example/', 'html', redirects)).rejects.toThrow('redirect limit')
    expect(redirects.fetcher).toHaveBeenCalledTimes(4)
    const cancel = vi.fn()
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(257 * 1024)) },
      cancel
    })
    const deps = dependencies(() => new Response(stream, { headers: { 'content-type': 'text/css' } }))
    await expect(fetchBrandWebsiteResource('https://brand.example/style.css', 'css', deps)).rejects.toThrow('size limit')
    expect(cancel).toHaveBeenCalled()
  })

  it('returns partial draft warnings for unavailable or blocked CSS and caps linked stylesheets', async () => {
    const deps = dependencies(url => url === 'https://brand.example/'
      ? response('<title>Brand</title><style>body{color:#123456;font-family:"Inline Brand"}</style>' + Array.from({ length: 8 }, (_, i) => `<link rel="stylesheet" href="/style-${i}.css">`).join(''))
      : response('error', 'text/html', 404))
    const page = await extractBrandWebsite('https://brand.example/', deps)
    expect(page.fonts[0]?.family).toBe('Inline Brand')
    expect(page.stylesheetsRead).toBe(0)
    expect(page.warnings.some(warning => warning.includes('stylesheet'))).toBe(true)
    expect(deps.fetcher).toHaveBeenCalledTimes(5)
  })

  it('does not treat script strings or URL fragments as CSS brand colours', () => {
    const signals = readBrandCssSignals('body{background:url(image.svg#abcdef);color:#123}h1{font-family:"Another Brand";font-weight:700}')
    expect([...signals.colors.keys()]).toEqual(['#112233'])
    expect([...signals.fonts.keys()]).toEqual(['Another Brand'])
  })
})

describe('website logo mirroring boundary', () => {
  it('accepts a static SVG with internal references and validates bytes for raster images', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" viewBox="0 0 20 20"><defs><path id="mark" d="M0 0h10v10z"/></defs><use xlink:href="#mark" fill="#123456"/></svg>'
    const result = await fetchBrandWebsiteLogo('https://brand.example/logo.svg', dependencies(() => response(svg, 'image/svg+xml')))
    expect(result.bytes.toString()).toContain('href="#mark"')
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const png = await fetchBrandWebsiteLogo('https://brand.example/logo.png', dependencies(() => response(bytes, 'image/png')))
    expect(png.bytes).toEqual(Buffer.from(bytes))
    await expect(fetchBrandWebsiteLogo('https://brand.example/logo.png', dependencies(() => response('<script>alert(1)</script>', 'image/png')))).rejects.toThrow('image type')
  })
  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><foreignObject><iframe src="https://evil.example/"></iframe></foreignObject></svg>',
    '<svg><use href="https://evil.example/mark.svg#x"/></svg>',
    '<svg xml:base="https://evil.example/"><use href="#mark"/></svg>',
    '<svg><path fill="url(https://evil.example/)"/></svg>',
    '<svg><path style="background:image-set(\'https://evil.example/a.png\')"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg>&x;</svg>'
  ])('rejects active or external SVG content', async (svg) => {
    await expect(fetchBrandWebsiteLogo('https://brand.example/logo.svg', dependencies(() => response(svg, 'image/svg+xml')))).rejects.toThrow()
  })
  it('rejects a logo redirect to private DNS without fetching the target', async () => {
    const deps = { ...dependencies(() => response('', 'image/png', 302, { location: 'https://internal.example/logo.png' })), resolver: {
      resolve4: async (host: string) => host === 'internal.example' ? ['192.168.1.2'] : ['93.184.215.14'], resolve6: async () => []
    } }
    await expect(fetchBrandWebsiteLogo('https://brand.example/logo.png', deps)).rejects.toThrow()
    expect(deps.fetcher).toHaveBeenCalledTimes(1)
  })
})
