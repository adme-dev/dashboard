import { describe, expect, it, vi } from 'vitest'
import type { Browser, Page } from '../../workers/banner-renderer/node_modules/@cloudflare/puppeteer'
import { PNG } from 'pngjs'
import { handleBannerRender } from '../../workers/banner-renderer/src/render'

const config = { environment: 'production', appOrigins: '[]', assetOrigins: '[]' }
const input = () => ({ version: 1, expectedEnvironment: 'production', requestId: 'lifecycle_test', output: 'png', items: [{ key: 'tiny', width: 2, height: 2, scale: 1, html: '<html></html>' }] })
function browserFixture() {
  const png = new PNG({ width: 2, height: 2 })
  png.data.fill(255)
  const page = {
    setRequestInterception: vi.fn(async () => { }), on: vi.fn(),
    setJavaScriptEnabled: vi.fn(async () => { }), setBypassServiceWorker: vi.fn(async () => { }),
    setCacheEnabled: vi.fn(async () => { }), setViewport: vi.fn(async () => { }),
    evaluateOnNewDocument: vi.fn(async () => { }), createCDPSession: vi.fn(async () => ({ send: vi.fn(async () => { }) })),
    goto: vi.fn(async () => { }), evaluate: vi.fn(async () => { }), addStyleTag: vi.fn(async () => { }),
    screenshot: vi.fn(async () => PNG.sync.write(png)), close: vi.fn(async () => { })
  }
  const browser = { newPage: vi.fn(async () => page as unknown as Page), close: vi.fn(async () => { }) }
  return { page, browser, deps: { launch: vi.fn(async () => browser as unknown as Browser), fetchResource: vi.fn(async () => new Response()) } }
}
describe('renderer lifecycle and atomic failures', () => {
  it('rejects malformed protocol and environment before launching', async () => {
    const f = browserFixture()
    expect(await handleBannerRender({}, config, f.deps)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(await handleBannerRender({ ...input(), expectedEnvironment: 'staging' }, config, f.deps)).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } })
    expect(f.deps.launch).not.toHaveBeenCalled()
  })
  it('closes page and browser on capture failure and returns no partial items', async () => {
    const f = browserFixture()
    const request = input()
    request.items.push({ ...request.items[0], key: 'second' })
    f.page.screenshot.mockRejectedValueOnce(new Error('payload or credentials must never echo'))
    const response = await handleBannerRender(request, config, f.deps)
    expect(response).toMatchObject({ ok: false, error: { code: 'RENDER_FAILED' } })
    expect(JSON.stringify(response)).not.toContain('credentials')
    expect(f.browser.newPage).toHaveBeenCalledTimes(1)
    expect(f.page.close).toHaveBeenCalledTimes(1)
    expect(f.browser.close).toHaveBeenCalledTimes(1)
  })
  it('closes page/browser when navigation stalls', async () => {
    const f = browserFixture()
    f.page.goto.mockImplementationOnce(() => new Promise(() => { }))
    expect(await handleBannerRender(input(), config, { ...f.deps, timeoutMs: 20 })).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } })
    expect(f.page.close).toHaveBeenCalledTimes(1)
    expect(f.browser.close).toHaveBeenCalledTimes(1)
  })
  it('closes a browser that launches after deadline', async () => {
    const f = browserFixture()
    let resolve!: (browser: Browser) => void
    const launch = () => new Promise<Browser>((done) => {
      resolve = done
    })
    expect(await handleBannerRender(input(), config, { ...f.deps, launch, timeoutMs: 10 })).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } })
    resolve(f.browser as unknown as Browser)
    await new Promise(done => setTimeout(done, 1))
    expect(f.browser.close).toHaveBeenCalledTimes(1)
    expect(f.browser.newPage).not.toHaveBeenCalled()
  })
  it('rejects mismatched encoded dimensions', async () => {
    const f = browserFixture()
    const request = input()
    request.items[0].scale = 2
    expect(await handleBannerRender(request, config, f.deps)).toMatchObject({ ok: false, error: { code: 'RENDER_FAILED' } })
    expect(f.page.close).toHaveBeenCalledTimes(1)
    expect(f.browser.close).toHaveBeenCalledTimes(1)
  })
})
