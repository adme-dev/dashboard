// Run: node scripts/banner-studio/prove-managed-qr.mjs
// Requires the existing Nuxt dev server at 127.0.0.1:3137. No hosted origin,
// credentials, database, R2, AI provider, scan request or analytics is used.
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:3137'
const out = resolve('output/editable-artwork-v2/managed-qr')
mkdirSync(out, { recursive: true })
// A failed dependency check must not leave a previous run labelled as passed.
writeFileSync(out + '/ui-evidence.json', JSON.stringify({ status: 'starting', base, provider: 'local fixture', storage: 'local fixture' }, null, 2))
const { renderQrSvg } = await tsImport('../../shared/qr/render-svg.ts', import.meta.url)
const { QrStyleSchema } = await tsImport('../../shared/qr/style.ts', import.meta.url)
const { svgViewBox } = await tsImport('../../shared/qr/frame.ts', import.meta.url)
const { bannerQrRequestSchema, bannerQrResponseSchema } = await tsImport('../../shared/bannerQr.ts', import.meta.url)
const require = createRequire(import.meta.url)
let jsQR, decoderPath
for (const candidate of ['jsqr', '/private/tmp/subaru-map-tools/node_modules/jsqr']) {
  try { jsQR = require(candidate); decoderPath = require.resolve(candidate); break } catch {}
}
assert.ok(jsQR, 'Install jsqr locally or provide /private/tmp/subaru-map-tools/node_modules/jsqr; decoding must not be silently skipped')

const projectId = '12345678-1234-4234-8234-123456789012'
const clientId = '12345678-1234-4234-8234-123456789013'
const qrId = '12345678-1234-4234-8234-123456789014'
const assetId = '12345678-1234-4234-8234-123456789015'
const initialRevision = '2026-10-26T01:00:00.000Z'
const shortUrl = 'https://app.xeroflow.io/q/eastern-subaru-test'
const assetUrl = base + '/fixture-managed-qr.svg'
const fixtureSource = resolve('output/editable-artwork-pilot/project.json')
// Reuse the actual editable artwork fixture when available; fresh checkouts can
// also run the proof using a deliberately synthetic, self-contained composition.
const project = existsSync(fixtureSource)
  ? JSON.parse(readFileSync(fixtureSource, 'utf8'))
  : { canvasData: { custom_1000x1000: { bgColor: '#ffffff', layers: [
    { id: 1, type: 'rect', name: 'Original background', x: 0, y: 0, w: 1000, h: 1000, zIndex: 1, fillColor: '#071e46', locked: true },
    { id: 2, type: 'text', name: 'Original approved copy', text: 'EASTERN SUBARU\nLOCAL QR FIXTURE', x: 70, y: 100, w: 850, h: 200, zIndex: 2, fontFamily: 'Arial', fontSize: 70, fontWeight: 800, color: '#ffffff', copyLocked: true },
    { id: 3, type: 'rect', name: 'Original accent', x: 70, y: 350, w: 400, h: 20, zIndex: 3, fillColor: '#ffdb28' }
  ].map(layer => ({ opacity: 1, animIn: 'none', animOut: 'none', ...layer })) } } }
Object.assign(project, { id: projectId, name: 'Managed QR — local browser fixture', clientId, clientName: 'Eastern Subaru (fixture only)', createdBy: 'local-qr-proof', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: initialRevision })
const formatKey = Object.keys(project.canvasData)[0]
assert.ok(formatKey, 'Fixture needs an artboard')
assert.ok(Object.values(project.canvasData).every(board => board.layers.every(layer => !layer.platformQr)), 'Baseline must have no managed QR layer')
const originalCanvas = structuredClone(project.canvasData)
const savedPath = out + '/saved-project.json'
const saveFixture = value => writeFileSync(savedPath, JSON.stringify(value, null, 2))
const loadFixture = () => JSON.parse(readFileSync(savedPath, 'utf8'))
saveFixture(project)

const record = {
  id: qrId, client_id: clientId, name: 'Eastern Subaru map — fixture only',
  code: 'eastern-subaru-test', destination_url: 'https://example.invalid/eastern-subaru-map-fixture',
  is_active: true, style: QrStyleSchema.parse({ margin: 2 }),
  folder_id: null, scan_count: 0, last_scanned_at: null,
  created_at: initialRevision, updated_at: initialRevision
}
const originalRecord = structuredClone(record)
const renderedStyle = { ...record.style, margin: Math.max(4, record.style.margin) }
// This is the application's actual shared renderer, not a hand-drawn QR or AI result.
const svg = renderQrSvg({ text: shortUrl, style: renderedStyle })
const dimensions = svgViewBox(svg)
const sha256 = createHash('sha256').update(svg).digest('hex')
writeFileSync(out + '/managed-qr.svg', svg)
const qrResponse = revision => bannerQrResponseSchema.parse({
  projectId, sourceRevision: revision,
  asset: { id: assetId, url: assetUrl, mimeType: 'image/svg+xml', width: dimensions.w, height: dimensions.h, sha256 },
  platformQr: {
    version: 1, qrCodeId: qrId, clientId, code: record.code, shortUrl, name: record.name,
    renderedAt: initialRevision, qrUpdatedAt: record.updated_at, assetId, sha256,
    quietZone: renderedStyle.margin, sourceQuietZone: record.style.margin,
    warnings: ['Artwork rendering adds a four-module quiet zone; the saved QR code settings are unchanged.']
  }
})

const evidence = {
  status: 'running', base, projectId, clientId, qrId, shortUrl,
  provider: 'Local deterministic shared renderQrSvg; no AI or external provider',
  auth: 'Synthetic owner session and auth_status cookie in isolated browser context',
  storage: 'File-backed intercepted API fixture; no hosted database or R2',
  composition: existsSync(fixtureSource) ? 'Existing local editable-artwork pilot fixture' : 'Self-contained synthetic artwork fixture',
  sourceQuietZone: record.style.margin, renderedQuietZone: renderedStyle.margin,
  svgSha256: sha256, decoderPath, saves: 0, qrCalls: 0, aiCalls: 0, scanRequests: 0,
  apiRequests: [], blockedExternalRequests: [], blockedWebSockets: [], ambientBadgeFixtureReads: 0,
  ambientBadge: 'Shell anomaly-count reads return a synthetic zero before any HTTP request; not AI inference',
  fixtureErrors: [], pageErrors: [], consoleErrors: [], decoded: [], assertions: {}
}
const browser = await chromium.launch({
  ...(process.env.BANNER_QR_CHROME ? { executablePath: process.env.BANNER_QR_CHROME }
    : existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}),
  headless: true
})
const context = await browser.newContext({ viewport: { width: 1800, height: 1200 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(30000)
await context.exposeBinding('__managedQrBadgeFixture', () => { evidence.ambientBadgeFixtureReads++ })
await context.addInitScript(() => {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input), location.origin)
    if (url.origin === location.origin && url.pathname === '/api/ai/anomalies/count/critical-open' && (!init?.method || init.method === 'GET')) {
      window.__managedQrBadgeFixture()
      return Promise.resolve(new Response(JSON.stringify({ count: 0 }), { headers: { 'Content-Type': 'application/json' } }))
    }
    return originalFetch(input, init)
  }
})
page.on('pageerror', error => evidence.pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()) })
await context.addCookies([{ name: 'auth_status', value: 'logged_in', url: base }])
// Even collaboration is isolated: do not open the real app's websocket endpoint.
await context.routeWebSocket('**/api/**', socket => {
  evidence.blockedWebSockets.push(socket.url())
  socket.onMessage(() => {})
})
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
  if (/\/q\//.test(path)) evidence.scanRequests++
  if (url.origin !== base) {
    evidence.blockedExternalRequests.push({ origin: url.origin, path, resourceType: request.resourceType() })
    // Empty external font CSS is an explicit local fixture, avoiding a live fetch.
    if (request.resourceType() === 'stylesheet') return route.fulfill({ body: '', contentType: 'text/css' })
    return route.abort('blockedbyclient')
  }
  if (path === '/fixture-managed-qr.svg') return route.fulfill({ body: svg, contentType: 'image/svg+xml' })
  if (!path.startsWith('/api/')) {
    if (path.startsWith('/q/')) return route.abort('blockedbyclient')
    return route.continue()
  }
  evidence.apiRequests.push({ method, path, query: url.search })
  if (path === '/api/notifications/stream') return route.fulfill({ status: 204, body: '' })
  try {
    if (/\/ai(?:\/|$)/.test(path)) {
      evidence.aiCalls++
      throw new Error('AI endpoint called during managed QR insertion: ' + path)
    }
    let data
    if (path === '/api/auth/me') data = { user: { id: 'local-qr-proof', name: 'Local QR fixture session', email: 'qr-proof@example.invalid', role: 'owner', permissionGroups: [] } }
    else if (path === '/api/agency/banner-studio/projects/' + projectId) {
      data = loadFixture()
      if (method === 'PATCH') {
        const body = request.postDataJSON()
        assert.equal(body.expectedRevision, data.updatedAt, 'Save must use optimistic source revision')
        data = { ...data, canvasData: body.canvasData, name: body.name, updatedAt: new Date(Date.parse(data.updatedAt) + 1000).toISOString() }
        saveFixture(data)
        evidence.saves++
      } else assert.equal(method, 'GET')
    } else if (path === '/api/agency/banner-studio/projects/' + projectId + '/qr') {
      assert.equal(method, 'POST')
      const input = bannerQrRequestSchema.parse(request.postDataJSON()), saved = loadFixture()
      assert.equal(input.qrCodeId, qrId)
      assert.equal(input.sourceRevision, saved.updatedAt)
      assert.equal(saved.clientId, clientId)
      evidence.qrCalls++
      data = qrResponse(input.sourceRevision)
      writeFileSync(out + '/qr-response.json', JSON.stringify(data, null, 2))
    } else if (path === '/api/agency/qr-codes') {
      assert.equal(method, 'GET', 'Proof must reuse a QR record without creating or modifying one')
      assert.equal(url.searchParams.get('clientId'), clientId)
      data = { codes: [record] }
    } else {
      assert.equal(method, 'GET', 'No unconfigured API mutation is permitted: ' + path)
      if (path === '/api/agency/banner-studio/projects') data = [loadFixture()]
      else if (path === '/api/agency/banner-studio/assets') data = { assets: [] }
      else if (path === '/api/agency/banner-studio/effects/presets') data = { presets: [] }
      else if (path === '/api/notifications') data = { notifications: [], unreadCount: 0, hasMore: false }
      else if (/counts|unread/.test(path)) data = { count: 0, unread: 0 }
      else if (/session|status|settings|preferences/.test(path)) data = {}
      else data = [] // Explicit empty fixtures for ambient navigation/support reads.
    }
    return route.fulfill({ json: data })
  } catch (error) {
    evidence.fixtureErrors.push(error.stack)
    return route.fulfill({ status: 500, json: { statusMessage: error.message } })
  }
})

const screenshot = name => page.screenshot({ path: out + '/' + name + '.png' })
const saveThroughUi = async () => {
  const saved = page.waitForResponse(response => response.url() === base + '/api/agency/banner-studio/projects/' + projectId && response.request().method() === 'PATCH')
  await page.keyboard.press('ControlOrMeta+s')
  assert.equal((await saved).status(), 200)
  return loadFixture()
}
function assertOriginals(canvas, baseline) {
  for (const [key, board] of Object.entries(baseline)) {
    assert.deepEqual({ ...canvas[key], layers: canvas[key].layers.filter(layer => !layer.platformQr) }, board, 'Original artboard and every original layer must remain unchanged: ' + key)
  }
}
const waitForLayers = async count => {
  await page.waitForFunction(expected => document.querySelectorAll('[id^="lyr-"]').length === expected, count, { timeout: 120000 })
}

try {
  await page.goto(base + '/agency/banner-studio/' + projectId, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByRole('button', { name: 'Add QR', exact: true }).waitFor({ timeout: 120000 })
  const originalCount = originalCanvas[formatKey].layers.length
  await waitForLayers(originalCount)
  const baselineProject = await saveThroughUi()
  const baseline = structuredClone(baselineProject.canvasData)
  // App migrations may add defaults on load; check every original input property,
  // then compare the entire normalized canvas exactly for each subsequent step.
  for (const [key, board] of Object.entries(originalCanvas)) {
    for (const layer of board.layers) {
      const normalized = baseline[key].layers.find(item => item.id === layer.id)
      for (const [property, value] of Object.entries(layer)) assert.deepEqual(normalized[property], value)
    }
  }
  writeFileSync(out + '/baseline-project.json', JSON.stringify(baselineProject, null, 2))
  await screenshot('01-original-artwork')
  await page.getByRole('button', { name: 'Add QR', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add managed QR code' })
  await dialog.waitFor()
  const manager = dialog.getByRole('link', { name: 'Open QR Codes', exact: true })
  assert.equal(await manager.getAttribute('href'), '/agency/qr-codes?clientId=' + clientId)
  await dialog.getByText('Choose a managed QR code', { exact: true }).click()
  await page.getByRole('option', { name: record.name, exact: true }).click()
  assert.equal(await dialog.getByRole('link', { name: 'Review this QR record', exact: true }).getAttribute('href'), '/agency/qr-codes/' + qrId)
  await screenshot('02-managed-qr-picker')
  await dialog.getByRole('button', { name: 'Add managed QR', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await waitForLayers(originalCount + 1)
  const inserted = loadFixture()
  assertOriginals(inserted.canvasData, baseline)
  const additions = inserted.canvasData[formatKey].layers.filter(layer => layer.platformQr)
  assert.equal(additions.length, 1)
  const layer = additions[0]
  assert.equal(layer.type, 'image')
  assert.equal(layer.fit, 'contain')
  assert.equal(layer.src, assetUrl)
  assert.equal(layer.animIn, 'none')
  assert.equal(layer.animOut, 'none')
  assert.equal(layer.w / layer.h, dimensions.w / dimensions.h)
  assert.deepEqual(layer.platformQr, qrResponse(baselineProject.updatedAt).platformQr)
  assert.equal(layer.platformQr.shortUrl, shortUrl)
  assert.ok(layer.platformQr.quietZone >= 4)
  const image = page.locator('#lyr-' + layer.id + ' img')
  await image.waitFor()
  await image.evaluate(async element => { await element.decode() })
  assert.equal(await image.evaluate(element => getComputedStyle(element).objectFit), 'contain')
  await screenshot('03-qr-inserted')
  evidence.assertions.separateContainImageWithCanonicalMetadata = true
  evidence.assertions.originalCanvasUnchangedAfterInsertion = true

  await page.keyboard.press('ControlOrMeta+z')
  await waitForLayers(originalCount)
  const undone = await saveThroughUi()
  assert.deepEqual(undone.canvasData, baseline)
  await screenshot('04-qr-undone')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await waitForLayers(originalCount + 1)
  const redone = await saveThroughUi()
  assert.deepEqual(redone.canvasData, inserted.canvasData)
  await screenshot('05-qr-redone')
  evidence.assertions.singleUndoRedoAndSave = true

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLayers(originalCount + 1)
  const persisted = loadFixture()
  assert.deepEqual(persisted.canvasData, inserted.canvasData)
  assertOriginals(persisted.canvasData, baseline)
  const reloadedImage = page.locator('#lyr-' + layer.id + ' img')
  await reloadedImage.evaluate(async element => { await element.decode() })
  assert.equal(await reloadedImage.getAttribute('src'), assetUrl)
  await page.locator('#lyr-' + layer.id).click({ position: { x: 5, y: 5 } })
  const manageLink = page.getByRole('link', { name: 'Manage QR code', exact: true })
  await manageLink.waitFor()
  evidence.manageQrHref = await manageLink.getAttribute('href')
  assert.equal(evidence.manageQrHref, '/agency/qr-codes/' + qrId)
  assert.equal(await manageLink.getAttribute('target'), '_blank')
  await screenshot('06-qr-reloaded-inspector')
  evidence.assertions.reloadRetainsMetadataAndManagerLink = true

  // Rasterize the actual reloaded DOM image with browser canvas at practical
  // display sizes. jsQR decodes pixels locally; it never follows the QR URL.
  for (const size of [120, 240]) {
    const pixels = await reloadedImage.evaluate((element, edge) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = edge
      const ctx = canvas.getContext('2d')
      ctx.drawImage(element, 0, 0, edge, edge)
      return { rgba: Array.from(ctx.getImageData(0, 0, edge, edge).data), png: canvas.toDataURL('image/png').split(',')[1] }
    }, size)
    const decoded = jsQR(new Uint8ClampedArray(pixels.rgba), size, size)
    assert.equal(decoded?.data, shortUrl, 'Rendered QR must decode at ' + size + 'px')
    const whiteBand = Math.floor(size * renderedStyle.margin * 10 / dimensions.w) - 1
    assert.ok(whiteBand >= 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (x < whiteBand || y < whiteBand || x >= size - whiteBand || y >= size - whiteBand) {
        assert.deepEqual(pixels.rgba.slice((y * size + x) * 4, (y * size + x) * 4 + 4), [255, 255, 255, 255], 'Quiet zone must be opaque white')
      }
    }
    const filename = 'decoded-' + size + 'px.png'
    writeFileSync(out + '/' + filename, Buffer.from(pixels.png, 'base64'))
    evidence.decoded.push({ size, payload: decoded.data, decoder: 'local jsQR', opaqueWhiteEdgePixelsVerified: whiteBand, image: filename })
  }
  evidence.assertions.renderedQrDecodesAt120And240 = true
  assert.deepEqual(record, originalRecord, 'QR registry record must remain unchanged')
  assert.equal(evidence.aiCalls, 0)
  assert.equal(evidence.scanRequests, 0)
  assert.equal(evidence.qrCalls, 1)
  assert.deepEqual(evidence.fixtureErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.assertions.zeroAiAndScanCalls = true
  evidence.assertions.originalLayersUnchangedThroughReload = true
  evidence.originalLayerCount = originalCount
  evidence.insertedLayer = layer
  evidence.scope = 'Actual Nuxt browser UI with intercepted API/auth/storage; does not exercise live server authorization, database or R2'
  evidence.visualReview = existsSync(fixtureSource)
    ? 'Default bottom-right placement overlaps existing footer content in this artwork fixture; original layers remain unchanged and final print placement requires review'
    : 'Synthetic composition only; final customer artwork placement requires review'
  evidence.status = 'passed'
  rmSync(out + '/failure.png', { force: true })
  rmSync(out + '/failure.txt', { force: true })
  console.log('PASS: actual Nuxt managed QR picker → insert → undo/redo → save/reload → Manage QR; local decode 120/240px; fixture API/auth/storage only; zero AI/scan calls')
} catch (error) {
  evidence.status = 'failed'
  evidence.failure = error.stack
  await screenshot('failure').catch(() => {})
  writeFileSync(out + '/failure.txt', await page.locator('body').innerText().catch(() => 'Page unavailable'))
  throw error
} finally {
  writeFileSync(out + '/ui-evidence.json', JSON.stringify(evidence, null, 2))
  await browser.close()
}
