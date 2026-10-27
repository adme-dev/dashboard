import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import sharp from 'sharp'
import JSZip from 'jszip'
import puppeteer from '../../workers/banner-renderer/node_modules/@cloudflare/puppeteer'
import { handleBannerRender } from '../../workers/banner-renderer/src/render'
import { parseBannerRenderRequest } from '../../shared/bannerRenderContract'
import { hasScopedDissectionReferences } from '../../shared/bannerScopedCanvas'
import { prepareScopedExport, scopedExportMetadata, parseScopedExportProvenance } from '../../server/utils/banner/scopedExport'

// Only database I/O is mocked. Production authority, private-object verification,
// scoped preparation, server/shared HTML building and renderer code all execute.
const db = vi.hoisted(() => ({ query: vi.fn(), inTransaction: false }))
vi.mock('~~/server/utils/db', () => {
  const unexpected = () => { throw new Error('Unexpected database API') }
  return {
    queryOneFresh: unexpected, queryRowsFresh: unexpected, queryOne: unexpected,
    queryRows: unexpected, execute: unexpected,
    transactionWithoutRetry: async (action: any) => {
      db.inTransaction = true
      try { return await action({ query: db.query }) }
      finally { db.inTransaction = false }
    }
  }
})

const executable = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(path => existsSync(path))
const projectId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const assetId = '33333333-3333-4333-8333-333333333333'
const actorId = '44444444-4444-4444-8444-444444444444'
const attemptId = '55555555-5555-4555-8555-555555555555'
const clientId = '66666666-6666-4666-8666-666666666666'
const revision = '2026-10-28T00:00:00.000Z'
const locator = `/api/agency/banner-studio/dissect/${jobId}/assets/${assetId}`
const objectKey = `scoped-dissection-assets/${jobId}/${attemptId}/${assetId}.png`
const cookie = 'session=synthetic-private-cookie-do-not-forward'
const gsapUrl = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js'
const gsap = readFileSync('test/fixtures/banner/gsap-3.12.2.min.js')
const config = { environment: 'production', appOrigins: '["https://app.xeroflow.io"]', assetOrigins: '[]' }
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const image = new PNG({ width: 30, height: 25 })
for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
  const offset = (y * image.width + x) * 4
  image.data[offset + (x < 15 ? 0 : 2)] = 255
  image.data[offset + 3] = 255
}
const privatePng = PNG.sync.write(image)
const sourceSha256 = hash(privatePng)
const owner = { kind: 'project', userId: actorId, projectId, projectOwnerId: actorId, clientId }
const job = { job_id: jobId, user_id: actorId, status: 'complete', manifest: {
  source: { version: 1, mimeType: 'image/png', byteLength: privatePng.length, width: 30, height: 25, sha256: sourceSha256 },
  ingestion: { version: 1, owner, physical: null, ingestedAt: revision, sessionsInvalidatedAt: null },
  delivery: { version: 1, assets: { [assetId]: { assetId, attemptId, key: objectKey, mimeType: 'image/png', byteLength: privatePng.length, sha256: sourceSha256 } } }
} }
const asset = { id: assetId, r2_key: objectKey, uploaded_by: actorId, client_id: clientId, mime_type: 'image/png', file_size: privatePng.length, url: locator }
type Kind = 'private-image' | 'text-only'
function fixture(kind: Kind) {
  const common = { id: 1, x: 0, y: 0, w: 300, h: 250, opacity: 1, zIndex: 1,
    animIn: 'none', animOut: 'none', animInDur: 0, startTime: 0, endTime: 0.4 }
  const layer = kind === 'private-image'
    ? { ...common, type: 'image', src: locator }
    : { ...common, type: 'text', text: 'SCOPED PROOF', fontFamily: 'Arial', fontSize: 28, color: '#000000',
        x: 20, y: 30, w: 260, h: 50, dissectionSource: { jobId, sourceSha256 } }
  const project = { id: projectId, client_id: clientId, created_by: actorId, updated_at: revision,
    canvas_data: { mrec: { layers: [layer], bgColor: '#ffffff', playback: { duration: 0.4, loopCount: 1 } } } }
  const state = { active: true, assigned: true }
  db.query.mockImplementation(async (sql: string, params: unknown[]) => {
    let rows: unknown[]
    if (sql.includes('FROM banner_dissections')) rows = params[0] === jobId && (!params[1] || params[1] === actorId) ? [job] : []
    else if (sql.includes('FROM team_members')) rows = params[0] === actorId ? [{ id: actorId, user_role: 'member', custom_role_id: null, is_active: state.active, sessions_invalidated_at: null }] : []
    else if (sql.includes('FROM custom_roles')) rows = [{ id: actorId, is_read_only: false }]
    else if (sql.includes('FROM role_permission_groups')) rows = [{ permission_group: 'CREATIVE' }]
    else if (sql.includes('FROM agency_clients')) rows = params[0] === clientId ? [{ id: clientId }] : []
    else if (sql.includes('FROM client_team_assignments')) rows = state.assigned && params[0] === clientId && params[1] === actorId ? [{ id: actorId }] : []
    else if (sql.includes('FROM banner_projects')) rows = params[0] === projectId ? [project] : []
    else if (sql.includes('FROM banner_assets')) rows = sql.includes("'font'") ? [] : params[0] === assetId ? [asset] : []
    else throw new Error(`Unexpected SQL: ${sql}`)
    return { rows: structuredClone(rows) }
  })
  const get = vi.fn(async (key: string) => {
    expect(db.inTransaction).toBe(false)
    expect(key).toBe(objectKey)
    return { size: privatePng.length, httpMetadata: { contentType: 'image/png' }, body: new Response(privatePng).body }
  })
  const event = { node: { req: { headers: { cookie, authorization: 'Bearer synthetic-private-token' } } },
    context: { cloudflare: { env: { APP_URL: 'https://app.xeroflow.io', MEDIA_BUCKET: { get } } } } } as unknown as H3Event
  const input = { projectId, sourceRevision: revision, formats: [{ key: 'mrec', width: 1, height: 1,
    html: `<img src="${locator}"><script>throw Error('caller-injection')</script>` }] }
  return { project, state, get, event, input }
}
function assertClean(value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  expect(hasScopedDissectionReferences(serialized)).toBe(false)
  for (const secret of [locator, objectKey, cookie, 'synthetic-private-token', 'caller-injection']) expect(serialized).not.toContain(secret)
}
function checkPixels(decoded: { width: number, height: number, data: Uint8Array }, kind: Kind, scale = 1) {
  expect([decoded.width, decoded.height]).toEqual([300 * scale, 250 * scale])
  const pixel = (x: number, y: number) => [...decoded.data.subarray((y * decoded.width + x) * 4, (y * decoded.width + x) * 4 + 4)]
  if (kind === 'private-image') {
    const red = pixel(50 * scale, 100 * scale), blue = pixel(250 * scale, 100 * scale)
    expect(red[0]).toBeGreaterThan(240); expect(red[1]).toBeLessThan(15); expect(red[2]).toBeLessThan(15); expect(red[3]).toBe(255)
    expect(blue[0]).toBeLessThan(15); expect(blue[1]).toBeLessThan(15); expect(blue[2]).toBeGreaterThan(240); expect(blue[3]).toBe(255)
  } else {
    expect(pixel(290 * scale, 240 * scale)).toEqual([255, 255, 255, 255])
    let ink = 0
    for (let y = 30 * scale; y < 80 * scale; y++) for (let x = 20 * scale; x < 280 * scale; x++) {
      const p = pixel(x, y)
      if (p[0] < 100 && p[1] < 100 && p[2] < 100 && p[3] === 255) ink++
    }
    expect(ink).toBeGreaterThan(200 * scale)
  }
}

describe('protected saved exports in real local Chromium (synthetic, not hosted)', () => {
  let chrome: ReturnType<typeof spawn> | undefined
  let directory: string
  let endpoint: string
  beforeAll(async () => {
    // Required proof: missing Chrome is an error, never a successful skipped suite.
    if (!executable) throw new Error('Install Chrome/Chromium before running this browser proof')
    directory = await mkdtemp(join(tmpdir(), 'banner-scoped-browser-'))
    chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(directory, 'profile')}`,
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
    endpoint = await new Promise<string>((resolve, reject) => {
      let stderr = ''
      const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 10000)
      const fail = (error: Error) => { clearTimeout(timer); reject(error) }
      chrome!.once('error', fail)
      chrome!.once('exit', () => fail(new Error('Owned Chrome exited')))
      chrome!.stderr!.on('data', chunk => {
        stderr = (stderr + chunk).slice(-16384)
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)
        if (match) { clearTimeout(timer); resolve(match[1]!) }
      })
    })
    console.info(`Scoped browser proof: ${process.version}; Chrome PID ${chrome.pid}`)
  }, 15000)
  afterAll(async () => {
    if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
      await new Promise<void>((resolve, reject) => {
        const force = setTimeout(() => chrome!.kill('SIGKILL'), 5000)
        const timeout = setTimeout(() => reject(new Error(`Owned Chrome PID ${chrome!.pid} did not exit`)), 10000)
        chrome!.once('exit', () => { clearTimeout(force); clearTimeout(timeout); resolve() })
        chrome!.kill('SIGTERM')
      })
    }
    if (chrome?.pid) {
      expect(() => process.kill(chrome!.pid!, 0)).toThrow()
      console.info(`Scoped browser proof: owned Chrome PID ${chrome.pid} positively exited`)
    }
    if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 3 })
  }, 15000)
  beforeEach(() => { vi.clearAllMocks() })
  const launch = async () => {
    const browser = await puppeteer.connect({ browserWSEndpoint: endpoint, protocolTimeout: 10000 })
    browser.close = async () => { await browser.disconnect() }
    return browser
  }

  for (const kind of ['private-image', 'text-only'] as const) {
    it.each(['png', 'jpg', 'gif'] as const)(`${kind}: prepares saved %s and independently decodes real renderer output`, async format => {
      const f = fixture(kind)
      const prepared = await prepareScopedExport(f.event, actorId, f.input, f.project, format === 'gif' ? 'gif' : 'image')
      expect(prepared).not.toBeNull()
      expect(prepared!.provenance.dependencies).toEqual([{ jobId, sourceSha256 }])
      expect(f.get).toHaveBeenCalledTimes(kind === 'private-image' ? 1 : 0)
      expect(f.project.canvas_data.mrec.layers[0]).toHaveProperty(kind === 'private-image' ? 'src' : 'dissectionSource')
      const request = parseBannerRenderRequest({ version: 1, expectedEnvironment: 'production', requestId: 'scoped_browser_proof',
        output: format === 'jpg' ? 'jpeg' : format, ...(format === 'jpg' ? { jpegQuality: 95 } : {}), ...(format === 'gif' ? { fps: 5 } : {}),
        items: prepared!.body.formats.map((item: object) => ({ ...item, scale: format === 'gif' ? 1 : 2 })) })
      assertClean(request)
      const fetchResource = vi.fn(async (url: unknown, init?: RequestInit) => {
        expect(url).toBe(gsapUrl)
        expect(new Headers(init?.headers).get('cookie')).toBeNull()
        expect(new Headers(init?.headers).get('authorization')).toBeNull()
        return new Response(gsap, { headers: { 'content-type': 'application/javascript' } })
      })
      const reply = await handleBannerRender(request, config, { launch, fetchResource, timeoutMs: 20000 })
      expect(reply.ok ? undefined : reply.error).toBeUndefined()
      if (!reply.ok) throw new Error(`Renderer failed: ${reply.error.code}`)
      const output = reply.value.items[0]!
      const metadata = scopedExportMetadata(prepared!.provenance, assetId, hash(output.bytes))
      expect(parseScopedExportProvenance(metadata, assetId, projectId).dependencies).toEqual([{ jobId, sourceSha256 }])
      expect(output.sha256).toBe(hash(output.bytes))
      if (format === 'gif') {
        const decoder = sharp(Buffer.from(output.bytes), { animated: true })
        const metadata = await decoder.metadata()
        expect(metadata.pages).toBe(2)
        expect(metadata.delay).toEqual([200, 200])
        const { data, info } = await decoder.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        expect([info.width, info.height, info.channels]).toEqual([300, 500, 4])
        for (let frame = 0; frame < 2; frame++) checkPixels({ width: 300, height: 250, data: data.subarray(frame * 300 * 250 * 4, (frame + 1) * 300 * 250 * 4) }, kind)
        expect(fetchResource).toHaveBeenCalledTimes(1)
      } else {
        checkPixels(format === 'png' ? PNG.sync.read(Buffer.from(output.bytes)) : jpeg.decode(output.bytes), kind, 2)
        expect(fetchResource).not.toHaveBeenCalled()
      }
    }, 30000)

    it(`${kind}: retained HTML and ZIP-extracted HTML load without authentication or source fetch`, async () => {
      const f = fixture(kind)
      const prepared = await prepareScopedExport(f.event, actorId, f.input, f.project, 'html')
      const html = prepared!.body.formats[0]!.html
      assertClean(html)
      const zip = new JSZip().file('mrec.html', html)
      const archive = await zip.generateAsync({ type: 'uint8array' })
      await writeFile(join(directory, `${kind}.zip`), archive)
      const extracted = await JSZip.loadAsync(archive)
      const zippedHtml = await extracted.file('mrec.html')!.async('string')
      expect(zippedHtml).toBe(html)
      // There is deliberately no authenticated app session available while viewing.
      f.state.active = false
      const sourceReads = f.get.mock.calls.length
      for (const [label, content] of [['html', html], ['zip-extracted', zippedHtml]]) {
        const file = join(directory, `${kind}-${label}.html`)
        await writeFile(file, content)
        const browser = await launch()
        const context = await browser.createBrowserContext()
        try {
          const page = await context.newPage()
          await page.setViewport({ width: 300, height: 250, deviceScaleFactor: 1 })
          expect(await page.cookies('https://app.xeroflow.io')).toEqual([])
          const requests: string[] = [], blocked: string[] = [], errors: string[] = []
          page.on('pageerror', error => errors.push(String(error)))
          await page.setRequestInterception(true)
          page.on('request', request => {
            const url = request.url()
            requests.push(url)
            if (request.headers().cookie || request.headers().authorization) blocked.push(`credentials:${url}`)
            if (url === pathToFileURL(file).href || url.startsWith('data:')) void request.continue()
            else if (url === gsapUrl) void request.respond({ status: 200, contentType: 'application/javascript', body: gsap })
            else { blocked.push(url); void request.abort() }
          })
          await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0', timeout: 10000 })
          await page.waitForFunction(() => (window as any).__engagrFrame?.ready === true, { timeout: 5000 })
          await page.evaluate(async () => {
            await Promise.all([...document.images].map(img => img.decode()))
            ;(window as any).__engagrFrame.seek(0)
          })
          const pixels = PNG.sync.read(Buffer.from(await page.screenshot({ type: 'png' })))
          checkPixels(pixels, kind)
          if (kind === 'text-only') expect(await page.$eval('[data-id="1"]', el => el.textContent)).toBe('SCOPED PROOF')
          expect(blocked).toEqual([])
          expect(errors).toEqual([])
          assertClean(requests)
          expect(requests.filter(url => url.startsWith('https:'))).toEqual([gsapUrl])
          expect(f.get).toHaveBeenCalledTimes(sourceReads)
        } finally { await context.close(); await browser.disconnect() }
      }
    }, 30000)
  }
  it('denies revoked client assignment before private bytes or Chromium', async () => {
    const f = fixture('private-image')
    f.state.assigned = false
    await expect(prepareScopedExport(f.event, actorId, f.input, f.project, 'image')).rejects.toMatchObject({ statusCode: 403 })
    expect(f.get).not.toHaveBeenCalled()
  })
  it('denies stale text-only provenance revision before rendering', async () => {
    const f = fixture('text-only')
    await expect(prepareScopedExport(f.event, actorId, { ...f.input, sourceRevision: '2026-10-27T00:00:00.000Z' }, f.project, 'gif')).rejects.toMatchObject({ statusCode: 409 })
    expect(f.get).not.toHaveBeenCalled()
  })
})
