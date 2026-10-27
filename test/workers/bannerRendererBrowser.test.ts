import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer from '../../workers/banner-renderer/node_modules/@cloudflare/puppeteer'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { PINNED_FONT_PATH } from '../../workers/banner-renderer/src/resourcePolicy'
import { handleBannerRender } from '../../workers/banner-renderer/src/render'

const executable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const config = { environment: 'production', appOrigins: '["https://app.xeroflow.io"]', assetOrigins: '[]' }
const input = (output = 'png', html = '<html><body style="margin:0;background:#ff0000"></body></html>') => ({ version: 1, expectedEnvironment: 'production', requestId: 'browser_proof', output, ...(output === 'jpeg' ? { jpegQuality: 90 } : {}), ...(output === 'gif' ? { fps: 5 } : {}), items: [{ key: 'tiny', width: 4, height: 3, scale: 2, html }] })
describe.skipIf(!existsSync(executable))('real local Chromium renderer (no hosted proof)', () => {
  let chrome: ReturnType<typeof spawn>
  let directory: string
  let endpoint: string
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'banner-renderer-browser-'))
    chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${directory}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
    endpoint = await new Promise<string>((resolve, reject) => {
      let stderr = ''
      const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 10000)
      chrome.stderr!.on('data', (chunk) => {
        stderr += chunk
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)
        if (match) {
          clearTimeout(timer)
          resolve(match[1])
        }
      })
      chrome.on('error', reject)
    })
  }, 15000)
  afterAll(async () => {
    if (chrome?.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve))
      chrome.kill()
      await exited
    }
    if (directory)
      await rm(directory, { recursive: true, force: true, maxRetries: 3 })
  })
  // Fresh connection and context per call; close() is overridden to disconnect because this suite owns Chrome.
  const launch = async () => {
    const browser = await puppeteer.connect({ browserWSEndpoint: endpoint })
    browser.close = async () => {
      await browser.disconnect()
    }
    return browser
  }
  const fetchResource = async () => {
    throw new Error('Unexpected real network')
  }
  it.each(['png', 'jpeg'])('renders %s and independently decodes correct 2x pixels', async (output) => {
    const reply = await handleBannerRender(input(output), config, { launch, fetchResource })
    expect(reply.ok ? undefined : reply.error).toBeUndefined()
    if (!reply.ok)
      return
    const image = output === 'png' ? PNG.sync.read(Buffer.from(reply.value.items[0].bytes)) : jpeg.decode(reply.value.items[0].bytes)
    expect([image.width, image.height]).toEqual([8, 6])
    expect(image.data[0]).toBeGreaterThan(245)
    expect(image.data[1]).toBeLessThan(10)
  })
  it('does not execute scripts for static images', async () => {
    const reply = await handleBannerRender(input('png', '<body style="margin:0;background:red"><script>document.body.style.background="blue"</script></body>'), config, { launch, fetchResource })
    expect(reply.ok).toBe(true)
    if (reply.ok)
      expect(PNG.sync.read(Buffer.from(reply.value.items[0].bytes)).data[0]).toBe(255)
  })
  it('rejects forbidden image egress without attempting fetch', async () => {
    const reply = await handleBannerRender(input('png', '<img src="http://127.0.0.1/private">'), config, { launch, fetchResource })
    expect(reply.ok).toBe(false)
    if (!reply.ok)
      expect(['RESOURCE_BLOCKED', 'RESOURCE_FAILED']).toContain(reply.error.code)
  })
  it('rejects redirect without following Location', async () => {
    let count = 0
    const reply = await handleBannerRender(input('png', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Arial">'), config, { launch, fetchResource: async () => {
      count++
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } })
    } })
    expect(count).toBe(1)
    expect(reply).toMatchObject({ ok: false, error: { code: 'RESOURCE_BLOCKED' } })
  })
  it('loads a valid PNG asset with JavaScript disabled and independently decodes its pixels', async () => {
    const image = new PNG({ width: 4, height: 3 })
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 255
      image.data[i + 3] = 255
    }
    const url = 'https://app.xeroflow.io/api/public/banner-assets/v1.' + 'a'.repeat(48) + '.' + 'a'.repeat(43)
    const html = `<body style="margin:0"><img width="4" height="3" src="${url}"></body>`
    const reply = await handleBannerRender(input('png', html), config, { launch, fetchResource: async () => new Response(PNG.sync.write(image), { headers: { 'content-type': 'image/png' } }) })
    expect(reply.ok ? undefined : reply.error).toBeUndefined()
    if (!reply.ok) return
    const decoded = PNG.sync.read(Buffer.from(reply.value.items[0].bytes))
    expect([decoded.width, decoded.height]).toEqual([8, 6])
    expect([...decoded.data.subarray(0, 4)]).toEqual([255, 0, 0, 255])
  })
  it('loads and decodes the real pinned font with JavaScript disabled', async () => {
    const html = `<style>@font-face{font-family:ProofFont;src:url(https://app.xeroflow.io${PINNED_FONT_PATH})}body{font-family:ProofFont}</style><body>HELLO</body>`
    const font = readFileSync(`public${PINNED_FONT_PATH}`)
    expect(font.length).toBe(428176)
    const reply = await handleBannerRender(input('png', html), config, { launch, fetchResource: async () => new Response(font, { headers: { 'content-type': 'font/ttf' } }) })
    expect(reply.ok ? undefined : reply.error).toBeUndefined()
    expect(reply.ok).toBe(true)
  })
  it('reports only the stage and HTTP status when an allowed font resource fails', async () => {
    const html = `<style>@font-face{font-family:ProofFont;src:url(https://app.xeroflow.io${PINNED_FONT_PATH})}body{font-family:ProofFont}</style><body>HELLO</body>`
    const reply = await handleBannerRender(input('png', html), config, { launch, fetchResource: async () => new Response('private response body', { status: 403 }) })
    expect(reply).toMatchObject({ ok: false, error: { code: 'RESOURCE_FAILED', diagnostic: { stage: 'resource-http', status: 403 } } })
    expect(JSON.stringify(reply)).not.toContain('private response body')
    expect(JSON.stringify(reply)).not.toContain('https://')
  })
  it('fails closed when an HTTP200 font cannot decode instead of exporting fallback text', async () => {
    const html = '<style>@font-face{font-family:BadFont;src:url(https://fonts.gstatic.com/s/test/font.ttf)}body{font-family:BadFont}</style><body>HELLO</body>'
    const reply = await handleBannerRender(input('png', html), config, { launch, fetchResource: async () => new Response('NOT A FONT', { headers: { 'content-type': 'font/ttf' } }) })
    expect(reply).toMatchObject({ ok: false, error: { code: 'RESOURCE_FAILED' } })
  })
  it('removes non-HTTP network APIs before GIF script execution', async () => {
    const html = '<body><script>if(["RTCPeerConnection","webkitRTCPeerConnection","WebTransport","WebSocket","EventSource","Worker","SharedWorker","open"].some(key=>globalThis[key]!==undefined))throw Error("API exposed");window.__engagrFrame={ready:true,duration:0.2,seek(){},getDiagnostics(){return {hasTimeline:true,events:[]}}}</script></body>'
    const request = input('gif', html)
    request.items[0].scale = 1
    expect(await handleBannerRender(request, config, { launch, fetchResource })).toMatchObject({ ok: true })
  })
  it('fails GIF fetch and iframe attempts under CSP without network access', async () => {
    const html = '<body><iframe src="https://forbidden.example/"></iframe><script>fetch("https://fonts.googleapis.com/css2").catch(()=>{});window.__engagrFrame={ready:true,duration:0.2,seek(){},getDiagnostics(){return {hasTimeline:true,events:[]}}}</script></body>'
    const request = input('gif', html)
    request.items[0].scale = 1
    expect(await handleBannerRender(request, config, { launch, fetchResource })).toMatchObject({ ok: false })
  })
  it('captures GIF through the explicit runtime and bounds frames without truncation', async () => {
    const html = '<body style="margin:0;background:red"><script>window.__engagrFrame={ready:true,duration:0.4,seek(t){document.body.style.background=t?"blue":"red"},getDiagnostics(){return {hasTimeline:true,events:[]}}}</script></body>'
    const request = input('gif', html)
    request.items[0].scale = 1
    const reply = await handleBannerRender(request, config, { launch, fetchResource })
    expect(reply.ok ? undefined : reply.error).toBeUndefined()
    if (reply.ok) {
      expect(Buffer.from(reply.value.items[0].bytes).subarray(0, 6).toString()).toBe('GIF89a')
      expect(reply.value.items[0].frames).toBe(2)
    }
    const oversized = input('gif', html.replace('duration:0.4', 'duration:21'))
    oversized.items[0].scale = 1
    expect(await handleBannerRender(oversized, config, { launch, fetchResource })).toMatchObject({ ok: false, error: { code: 'LIMIT_EXCEEDED' } })
  })
})
