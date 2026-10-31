import { describe, expect, it, vi } from 'vitest'
import { browserWebsiteResource } from '~~/server/utils/banner/browserWebsiteFallback'

vi.mock('~~/server/utils/siteIntelligence/urlPolicy', () => ({
  assertPublicSiteOrigin: vi.fn(async (url: string) => {
    if (new URL(url).hostname === 'localhost') throw new Error('Public HTTP(S) origin required')
    return new URL(url).origin
  })
}))

function eventWithBrowser(quickAction: (action: string, options: Record<string, unknown>) => Promise<Response>) {
  return { context: { cloudflare: { env: { BROWSER: { quickAction } } } } } as Parameters<typeof browserWebsiteResource>[0]
}

describe('Browser Run website fallback', () => {
  it('reads bounded HTML with requests confined to the verified HTTPS host', async () => {
    const quickAction = vi.fn(async () => Response.json({ success: true, result: '<html><title>BMW</title></html>' }))
    const resource = browserWebsiteResource(eventWithBrowser(quickAction))!
    const page = await resource('https://www.bmw.com.au/en/home.html', 'html')
    expect(page.bytes.toString()).toContain('<title>BMW</title>')
    expect(quickAction.mock.calls[0]?.[1]).toMatchObject({
      allowRequestPattern: ['^https://www\\.bmw\\.com\\.au/'],
      rejectResourceTypes: expect.arrayContaining(['script', 'xhr', 'fetch']),
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10000 }
    })
  })

  it('unwraps a browser-rendered stylesheet and refuses unsafe URLs', async () => {
    const quickAction = vi.fn(async () => Response.json({ success: true, result: '<html><body><pre>body{font-family:&quot;BMW Type&quot;;color:#003399}</pre></body></html>' }))
    const resource = browserWebsiteResource(eventWithBrowser(quickAction))!
    const css = await resource('https://www.bmw.com.au/brand.css', 'css')
    expect(css.bytes.toString()).toBe('body{font-family:"BMW Type";color:#003399}')
    await expect(resource('http://localhost/private', 'html')).rejects.toThrow()
    expect(quickAction).toHaveBeenCalledTimes(1)
  })

  it('returns only an original SVG logo from a browser 520 fallback', async () => {
    const quickAction = vi.fn(async () => Response.json({ success: true, result: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>' }))
    const resource = browserWebsiteResource(eventWithBrowser(quickAction))!
    const logo = await resource('https://www.bmw.com.au/logo.svg', 'logo')
    expect(logo.mimeType).toBe('image/svg+xml')
    const wrapped = browserWebsiteResource(eventWithBrowser(async () => Response.json({ success: true, result: '<html><img src="/logo.png"></html>' })))!
    await expect(wrapped('https://www.bmw.com.au/logo.png', 'logo')).rejects.toThrow('original SVG')
  })
})
