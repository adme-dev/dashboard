// Run: node scripts/banner-studio/prove-layer-animation.mjs
// Actual Nuxt UI on coordinator-owned loopback server; all API/auth/storage are
// intercepted file-backed fixtures. Never run against a hosted origin.
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { PNG } from 'pngjs'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const base = 'http://127.0.0.1:3137'
const out = resolve('output/editable-artwork-animation/alpha-mask')
mkdirSync(out, { recursive: true })
const json = (name, value) => writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2))
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')
json('evidence', { status: 'starting', base, provider: 'none', storage: 'local file fixture' })
const { buildBannerHTML } = await tsImport('../../app/utils/banner-html-builder.ts', { parentURL: import.meta.url, tsconfig: resolve('.nuxt/tsconfig.app.json') })
const { buildBannerHTML: buildServerHTML } = await tsImport('../../server/utils/banner/htmlBuilder.ts', { parentURL: import.meta.url, tsconfig: resolve('.nuxt/tsconfig.app.json') })
const fixture = new PNG({ width: 200, height: 200 })
for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
  const edge = Math.min(x, y, 199 - x, 199 - y), offset = (y * 200 + x) * 4
  fixture.data.set([240, 40, 80, edge < 20 ? 0 : edge < 40 ? 128 : 255], offset)
}
const pngBytes = PNG.sync.write(fixture)
writeFileSync(`${out}/known-alpha.png`, pngBytes)
const formatKey = 'custom_600x400', projectId = '12345678-1234-4234-8234-123456789099', targetId = 1
const sourceFiles = ['scripts/banner-studio/prove-layer-animation-alpha.mjs', 'app/components/banner/Artboard.client.vue', 'app/components/banner/inspector/Mask.vue', 'app/composables/useBannerStudio.ts', 'app/composables/useBannerTimeline.ts', 'app/utils/banner-html-builder.ts', 'server/utils/banner/htmlBuilder.ts',
  'app/pages/agency/banner-studio/[id].client.vue', 'app/utils/banner-mask.ts', 'server/utils/banner/mask.ts',
  'app/components/banner/layers/Image.client.vue', 'app/components/banner/layers/Rect.client.vue',
  'app/components/banner/layers/Bg.client.vue', 'app/components/banner/layers/Video.client.vue',
  'app/components/banner/layers/Button.client.vue', 'app/utils/banner-context-menu.ts']
const sourceHashes = Object.fromEntries(sourceFiles.map(path => [path, hash(readFileSync(path))]))
const sourceBytes = pngBytes
const localAssets = new Map([['/fixture-known-alpha.png', { body: pngBytes, contentType: 'image/png' }]])
const common = { startTime: 0, endTime: 5, animIn: 'none', animOut: 'none', animInDur: 0, opacity: 1 }
const project = { id: projectId, name: 'Known alpha and mask — local UI fixture', clientId: '12345678-1234-4234-8234-123456789013', createdBy: 'local-animation-proof', updatedAt: '2026-10-27T01:00:00.000Z', canvasData: { [formatKey]: { bgColor: '#20c0e0', layers: [
  { ...common, id: 1, type: 'image', name: 'Known alpha PNG', x: 100, y: 100, w: 200, h: 200, zIndex: 1, src: '/fixture-known-alpha.png', fit: 'fill', opacity: 0.5 },
  { ...common, id: 2, type: 'rect', name: 'Left half mask', x: 100, y: 100, w: 100, h: 200, zIndex: 2, fillColor: '#00ff00', opacity: 1, hidden: true }
] } } }
const savedPath = `${out}/saved-project.json`
const saveFixture = value => json('saved-project', value)
const loadFixture = () => JSON.parse(readFileSync(savedPath, 'utf8'))
saveFixture(project)
const evidence = {
  status: 'running', startedAt: new Date().toISOString(), base, projectId, formatKey, targetId, sourceProjectSha256: hash(project), sourcePngSha256: hash(sourceBytes),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes,
  scope: 'Actual Nuxt image rendering and existing mask inspector controls with deterministic known-alpha PNG, file-backed intercepted APIs, and executed client/server HTML exports; no live extraction.',
  limitations: ['Synthetic known-alpha asset verifies retained alpha, not provider extraction quality.', 'No GIF/video, live extraction, hosted storage or print acceptance.'],
  apiRequests: [], blockedExternalRequests: [], blockedWebSockets: [], unexpectedRequests: [], ambientBadgeFixtureReads: 0,
  liveProviderCalls: 0, scanRequests: 0, saves: 0, fixtureErrors: [], pageErrors: [], consoleErrors: [], assertions: {}, editorSamples: [], exportSamples: []
}
const phase = value => { evidence.phase = value; json('evidence', evidence); console.log('Alpha/mask proof:', value) }
let baseline
const browser = await chromium.launch({ ...(process.env.BANNER_QR_CHROME ? { executablePath: process.env.BANNER_QR_CHROME } : existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}), headless: true })
const context = await browser.newContext({ viewport: { width: 1800, height: 1400 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(30000)
context.on('page', child => {
  child.on('pageerror', error => evidence.pageErrors.push(error.message))
  child.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push({ text: message.text(), location: message.location(), phase: evidence.phase, surface: 'export' }) })
})
page.on('pageerror', error => evidence.pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push({ text: message.text(), location: message.location(), phase: evidence.phase }) })
await context.addCookies([{ name: 'auth_status', value: 'logged_in', url: base }])
await context.routeWebSocket('**/*', socket => {
  const url = new URL(socket.url())
  if (url.host === new URL(base).host && url.pathname.startsWith('/_nuxt/')) return socket.connectToServer()
  evidence.blockedWebSockets.push(socket.url()); socket.onMessage(() => {})
})
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
  if (/\/q\//.test(path)) evidence.scanRequests++
  if (url.origin !== base) {
    evidence.blockedExternalRequests.push({ origin: url.origin, path, method, resourceType: request.resourceType() })
    if (request.resourceType() === 'stylesheet') return route.fulfill({ body: '', contentType: 'text/css' })
    return route.abort('blockedbyclient')
  }
  if (localAssets.has(path)) return route.fulfill(localAssets.get(path))
  if (!path.startsWith('/api/')) {
    if (path.startsWith('/q/') || !['GET', 'HEAD'].includes(method)) { evidence.unexpectedRequests.push({ method, path }); return route.abort('blockedbyclient') }
    return route.continue()
  }
  if (path === '/api/ai/anomalies/count/critical-open' && method === 'GET') { evidence.ambientBadgeFixtureReads++; return route.fulfill({ json: { count: 0 } }) }
  evidence.apiRequests.push({ method, path, query: url.search })
  if (path === '/api/notifications/stream') return route.fulfill({ status: 204, body: '' })
  try {
    let data
    if (/\/ai(?:\/|$)/.test(path)) throw new Error('Unexpected AI endpoint: ' + path)
    if (path === '/api/auth/me') data = { user: { id: 'local-animation-proof', name: 'Local animation fixture owner', email: 'animation-proof@example.invalid', role: 'owner', permissionGroups: [] } }
    else if (path === '/api/agency/banner-studio/projects/' + projectId) {
      data = loadFixture()
      if (method === 'PATCH') {
        const body = request.postDataJSON()
        assert.equal(body.expectedRevision, data.updatedAt)
        data = { ...data, canvasData: body.canvasData, name: body.name, updatedAt: new Date(Date.parse(data.updatedAt) + 1000).toISOString() }
        saveFixture(data)
        evidence.saves++
      } else assert.equal(method, 'GET')
    } else {
      assert.equal(method, 'GET', 'Unconfigured mutation: ' + path)
      if (path === '/api/agency/banner-studio/projects') data = [loadFixture()]
      else if (path === '/api/agency/banner-studio/assets') data = { assets: [] }
      else if (path === '/api/agency/banner-studio/effects/presets') data = { presets: [] }
      else if (path === '/api/notifications') data = { notifications: [], unreadCount: 0, hasMore: false }
      else if (/counts|unread/.test(path)) data = { count: 0, unread: 0 }
      else if (/session|status|settings|preferences/.test(path)) data = {}
      else data = []
    }
    return route.fulfill({ json: data })
  } catch (error) { evidence.fixtureErrors.push(error.stack); return route.fulfill({ status: 500, json: { statusMessage: error.message } }) }
})
const screenshot = name => page.screenshot({ path: `${out}/${name}.png` })
const waitForLayers = () => page.waitForFunction(() => document.querySelectorAll('[id^="lyr-"]').length === 2, null, { timeout: 120000 })
const unfocus = async () => page.locator('body').evaluate(element => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); element.focus() })
const saveThroughUi = async () => {
  await unfocus()
  const response = page.waitForResponse(response => response.url() === `${base}/api/agency/banner-studio/projects/${projectId}` && response.request().method() === 'PATCH')
  await page.keyboard.press('ControlOrMeta+s')
  assert.equal((await response).status(), 200)
  return structuredClone(loadFixture().canvasData)
}
const undo = async () => { await unfocus(); await page.keyboard.press('ControlOrMeta+z'); await page.waitForTimeout(150) }
const redo = async () => { await unfocus(); await page.keyboard.press('ControlOrMeta+Shift+z'); await page.waitForTimeout(150) }
const points = { transparent: [10, 100], softAlpha: [30, 100], opaqueLeft: [70, 100], opaqueRight: [130, 100], cornerSoft: [90, 30] }
const colors = { background: [32, 192, 224], soft: [84, 154, 188], opaque: [136, 116, 152] }
const pixelSamples = (bytes) => {
  const image = PNG.sync.read(bytes)
  return Object.fromEntries(Object.entries(points).map(([key, [x, y]]) => {
    const sx = Math.floor(x / 200 * image.width), sy = Math.floor(y / 200 * image.height), offset = (sy * image.width + sx) * 4
    return [key, [...image.data.subarray(offset, offset + 4)]]
  }))
}
const checkPixels = (samples, mode) => {
  const inverse = mode === 'inverted' || mode === 'ellipse-inverted'
  const normalMask = mode === 'normal' || mode === 'ellipse'
  const expected = { transparent: colors.background, softAlpha: inverse ? colors.background : colors.soft, opaqueLeft: inverse ? colors.background : colors.opaque, opaqueRight: normalMask ? colors.background : colors.opaque, cornerSoft: mode === 'normal' || mode === 'unmasked' || mode === 'ellipse-inverted' ? colors.soft : colors.background }
  for (const [key, rgb] of Object.entries(expected)) rgb.forEach((value, channel) => assert.ok(Math.abs(samples[key][channel] - value) <= 3, `${mode} ${key} channel${channel}: ${samples[key]} expected ${rgb}`))
}
const captureEditor = async (name, mode) => {
  if (name !== '01-alpha-before') {
    const ruler = await page.locator('[data-testid="banner-timeline-ruler"]').boundingBox()
    await page.mouse.click(ruler.x + 120, ruler.y + 14)
    await page.waitForTimeout(150)
  }
  // The actual layer screenshot retains the artboard background behind transparent
  // pixels and CSS clipping. Decode those pixels, not an artificial checkerboard.
  const bytes = await page.locator('#lyr-1').screenshot({ path: `${out}/${name}-pixels.png` })
  const samples = pixelSamples(bytes)
  evidence.editorSamples.push({ name, mode, samples, clipPath: await page.locator('#lyr-1').evaluate(element => getComputedStyle(element).clipPath) })
  checkPixels(samples, mode)
  await screenshot(name)
}
const executeExports = async (canvas, mode) => {
  const board = structuredClone(canvas[formatKey])
  board.layers.find(layer => layer.id === 1).src = `data:image/png;base64,${pngBytes.toString('base64')}`
  for (const [exporter, builder] of [['client', buildBannerHTML], ['server', buildServerHTML]]) {
    const raw = builder(formatKey, board.layers, { bgColor: board.bgColor, includeAnimations: true })
    let html = raw
    for (const name of ['gsap', 'MotionPathPlugin', 'CustomEase']) {
      const runtime = readFileSync(require.resolve(`gsap/dist/${name}.min.js`), 'utf8')
      html = html.replace(new RegExp(`<script src="https://cdnjs\\.cloudflare\\.com/ajax/libs/gsap/[^/]+/${name}\\.min\\.js"><\\/script>`, 'g'), () => `<script>${runtime.replace(/<\/script/gi, '<\\/script')}</script>`)
    }
    assert.doesNotMatch(html, /<script[^>]+src="https?:/)
    writeFileSync(`${out}/${exporter}-${mode}.html`, html)
    localAssets.set('/fixture-mask-export.html', { body: html, contentType: 'text/html' })
    const exported = await context.newPage()
    await exported.setViewportSize({ width: 600, height: 400 })
    await exported.goto(base + '/fixture-mask-export.html', { waitUntil: 'load' })
    await exported.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
    await exported.evaluate(() => { window.__engagrTimeline.pause().seek(1, false); window.__engagrUpdateMasks?.() })
    const samples = pixelSamples(await exported.locator('[data-id="1"]').screenshot({ path: `${out}/${exporter}-${mode}-pixels.png` }))
    checkPixels(samples, mode)
    evidence.exportSamples.push({ exporter, mode, samples })
    await exported.screenshot({ path: `${out}/${exporter}-${mode}.png` })
    await exported.close()
  }
}
try {
  phase('Load actual Nuxt known-alpha draft')
  await page.goto(`${base}/agency/banner-studio/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await waitForLayers()
  baseline = await saveThroughUi()
  const input = PNG.sync.read(pngBytes)
  evidence.sourceAlpha = Object.fromEntries(Object.entries(points).map(([key, [x, y]]) => [key, input.data[(y * 200 + x) * 4 + 3]]))
  assert.deepEqual(evidence.sourceAlpha, { transparent: 0, softAlpha: 128, opaqueLeft: 255, opaqueRight: 255, cornerSoft: 128 })
  await captureEditor('01-alpha-before', 'unmasked')
  const ruler = page.locator('[data-testid="banner-timeline-ruler"]')
  const rulerBox = await ruler.boundingBox()
  await page.mouse.click(rulerBox.x + 120, rulerBox.y + 14)
  await page.waitForTimeout(150)
  await captureEditor('01b-alpha-scrubbed', 'unmasked')
  await executeExports(baseline, 'unmasked')
  evidence.assertions.transparentAndSoftAlphaRetained = true
  phase('Enable existing mask through visible inspector')
  const maskRow = page.locator('[data-testid="banner-timeline-layer"][data-layer-id="2"]')
  await maskRow.click()
  await page.getByRole('tab', { name: 'Properties', exact: true }).click()
  const maskSection = page.locator('details').filter({ has: page.getByText('Use as Mask', { exact: true }) })
  await maskSection.locator('summary').click()
  await maskSection.getByRole('checkbox').first().check()
  const enabled = await saveThroughUi()
  await undo()
  assert.deepEqual(await saveThroughUi(), baseline, 'Mask enable is one undo')
  await redo()
  assert.deepEqual(await saveThroughUi(), enabled)
  evidence.assertions.maskToggleSingleUndoRedo = true
  // Show opaque green mask geometry: playback/export must still hide its fill.
  await maskRow.getByRole('button').nth(1).click()
  const normal = await saveThroughUi()
  assert.equal(normal[formatKey].layers[1].isMask, true)
  assert.deepEqual(normal[formatKey].layers[1].maskTargetIds, [1])
  assert.deepEqual(normal[formatKey].layers[0], baseline[formatKey].layers[0], 'Mask target source and alpha bytes untouched')
  await captureEditor('02-normal-mask', 'normal')
  await executeExports(normal, 'normal')
  phase('Invert mask using existing UI and retain alpha')
  await maskSection.getByRole('checkbox').nth(1).check()
  const inverted = await saveThroughUi()
  assert.equal(inverted[formatKey].layers[1].maskInvert, true)
  assert.deepEqual(inverted[formatKey].layers[0], baseline[formatKey].layers[0])
  await captureEditor('04-inverted-mask', 'inverted')
  await executeExports(inverted, 'inverted')
  await undo()
  assert.deepEqual(await saveThroughUi(), normal)
  await captureEditor('05-invert-undone', 'normal')
  await redo()
  assert.deepEqual(await saveThroughUi(), inverted)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLayers()
  assert.deepEqual(await saveThroughUi(), inverted)
  await captureEditor('06-inverted-reloaded', 'inverted')
  evidence.assertions.inversionUndoRedoSaveReload = true
  phase('Exercise ellipse clipping and inverted ellipse')
  await maskRow.click()
  await page.getByRole('tab', { name: 'Properties', exact: true }).click()
  await maskSection.getByRole('button', { name: 'Ellipse', exact: true }).click()
  const ellipseInverted = await saveThroughUi()
  await captureEditor('07-ellipse-inverted', 'ellipse-inverted')
  await executeExports(ellipseInverted, 'ellipse-inverted')
  await maskSection.getByRole('checkbox').nth(1).uncheck()
  const ellipse = await saveThroughUi()
  await captureEditor('08-ellipse', 'ellipse')
  await executeExports(ellipse, 'ellipse')
  await undo()
  assert.deepEqual(await saveThroughUi(), ellipseInverted)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLayers()
  assert.deepEqual(await saveThroughUi(), ellipseInverted)
  await captureEditor('09-ellipse-inverted-reloaded', 'ellipse-inverted')
  evidence.assertions.ellipseAndInvertedEllipse = true
  evidence.assertions.clientServerExportPixelParity = true
  phase('Verify mask and mask-target animation exclusion')
  for (const id of [1, 2]) {
    const row = page.locator(`[data-testid="banner-timeline-layer"][data-layer-id="${id}"]`)
    await row.click({ button: 'right' })
    await page.getByRole('menu').waitFor()
    for (const name of ['Animate', 'Add Tween']) {
      const item = page.getByRole('menuitem', { name, exact: true })
      assert.ok(await item.count() === 0 || await item.isDisabled(), 'Mask relationship rejects ' + name)
    }
    await page.keyboard.press('Escape')
  }
  assert.deepEqual(await saveThroughUi(), ellipseInverted)
  evidence.assertions.maskAndTargetAnimationIneligible = true
  assert.deepEqual(evidence.fixtureErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.consoleErrors, [])
  assert.deepEqual(evidence.unexpectedRequests, [])
  assert.equal(evidence.scanRequests, 0)
  for (const [path, sha256] of Object.entries(sourceHashes)) assert.equal(hash(readFileSync(path)), sha256, 'Source unchanged throughout alpha proof: ' + path)
  evidence.status = 'passed'; evidence.phase = 'complete'
  json('pixel-evidence', { sourceAlpha: evidence.sourceAlpha, editor: evidence.editorSamples, exports: evidence.exportSamples })
  writeFileSync(`${out}/review.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Known PNG alpha and mask UI proof</title><style>body{font:16px/1.5 system-ui;margin:24px;background:#f4f5f7;color:#172033}main{max-width:1400px;margin:auto}.shots{display:flex;gap:16px}img{max-width:100%;border:1px solid #aab}</style><main><h1>Known PNG alpha + native mask proof</h1><p>Actual Nuxt image rendering and visible mask controls, one-step undo/redo, save/reload. Pixel assertions distinguish transparent source pixels (alpha0), soft edges (alpha128), and opaque core (alpha255), with normal and inverted rectangle/ellipse clipping. Both actual HTML builders execute locally with bundled GSAP. This synthetic fixture tests alpha retention and clipping; it does not prove live extraction.</p><p><a href="evidence.json">Evidence</a> · <a href="pixel-evidence.json">Pixel samples</a> · <a href="known-alpha.png">Known alpha PNG</a></p><div class="shots">${['unmasked','normal','inverted','ellipse','ellipse-inverted'].map(mode=>`<figure><figcaption>${mode}</figcaption><img src="client-${mode}.png" alt="${mode} clipping"></figure>`).join('')}</div><img src="09-ellipse-inverted-reloaded.png" alt="Actual Nuxt reloaded inverted mask"></main></html>`)
  for (const name of ['failure.png', 'failure.txt', 'failure-aria.txt']) rmSync(`${out}/${name}`, { force: true })
  console.log(`PASS: ${Object.keys(evidence.assertions).length} alpha/mask browser assertion groups, ${evidence.saves} saves, ${evidence.editorSamples.length} editor pixel states, ${evidence.exportSamples.length} export states`)
} catch (error) {
  evidence.status = 'failed'; evidence.failure = error.stack
  await screenshot('failure').catch(() => {})
  writeFileSync(`${out}/failure.txt`, await page.locator('body').innerText().catch(() => 'Page unavailable'))
  writeFileSync(`${out}/failure-aria.txt`, await page.locator('body').ariaSnapshot().catch(() => 'Page unavailable'))
  throw error
} finally {
  evidence.finishedAt = new Date().toISOString(); json('evidence', evidence); await browser.close()
}
