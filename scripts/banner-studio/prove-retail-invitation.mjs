// Run: node scripts/banner-studio/prove-retail-invitation.mjs
// Requires coordinator-owned Nuxt at 127.0.0.1:3137. All API, auth, provider,
// persistence and image requests are intercepted local fixtures. Never hosted.
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:3137'
const out = resolve('output/editable-artwork-v2/retail-invitation')
mkdirSync(out, { recursive: true })
const json = (name, value) => writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2))
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')
json('ui-evidence', { status: 'starting', base, provider: 'deterministic local fixture' })
const { applyDesignProposal, validateDesignCanvas, designAssistRequestSchema, canvasAssetUrls } = await tsImport('../../server/utils/banner/designAssistant.ts', import.meta.url)
const { assertScopedDesignTransition, assertScopedDesignSource, validateDesignScope } = await tsImport('../../shared/bannerDesignScope.ts', import.meta.url)
const { renderQrSvg } = await tsImport('../../shared/qr/render-svg.ts', import.meta.url)
const { QrStyleSchema } = await tsImport('../../shared/qr/style.ts', import.meta.url)

const sourcePath = resolve('output/editable-artwork-pilot/project.json')
const sourceBytes = readFileSync(sourcePath)
const project = JSON.parse(sourceBytes)
const formatKey = Object.keys(project.canvasData)[0]
const sourceCanvas = structuredClone(project.canvasData)
const projectId = '12345678-1234-4234-8234-123456789012'
const clientId = '12345678-1234-4234-8234-123456789013'
Object.assign(project, { id: projectId, clientId, name: 'Retail invitation — local native fixture', createdBy: 'local-retail-proof', updatedAt: '2026-10-27T01:00:00.000Z' })
assert.equal(sourceCanvas[formatKey].layers.length, 124, 'Require actual curated native pilot; no synthetic fallback')
const board = project.canvasData[formatKey]
assert.equal(board.reconstruction.background.status, 'clean')
assert.notEqual(board.reconstruction.background.sha256, board.reconstruction.source.sha256)
const localAssets = new Map()
const assets = []
for (const layer of board.layers) {
  if (!layer.src) continue
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(layer.src)
  assert.ok(match, 'Pilot assets must use embedded original bytes')
  const bytes = Buffer.from(match[2], 'base64')
  const path = `/api/public/banner-assets/retail-fixture-${layer.id}.png`
  localAssets.set(path, { body: bytes, contentType: match[1] })
  assets.push({ layerId: layer.id, url: path, sha256: hash(bytes), contentType: match[1] })
  writeFileSync(`${out}/asset-${layer.id}.png`, bytes)
  layer.src = path
}
assert.equal(assets.find(item => item.layerId === 1).sha256, board.reconstruction.background.sha256, 'Repaired clean plate bytes must match reconstruction provenance')
const qrFixture = JSON.parse(readFileSync('output/editable-artwork-v2/managed-qr/saved-project.json', 'utf8'))
const qr = structuredClone(Object.values(qrFixture.canvasData)[0].layers.find(layer => layer.platformQr))
assert.ok(qr, 'Require existing deterministic managed QR fixture')
const qrSvg = renderQrSvg({ text: qr.platformQr.shortUrl, style: { ...QrStyleSchema.parse({ margin: 2 }), margin: 4 } })
assert.equal(hash(qrSvg), qr.platformQr.sha256)
Object.assign(qr, { x: 1500, y: 640, w: 140, h: 140, src: '/api/public/banner-assets/retail-fixture-qr.svg' })
localAssets.set(qr.src, { body: qrSvg, contentType: 'image/svg+xml' })
writeFileSync(`${out}/managed-qr.svg`, qrSvg)
board.layers.push(qr)
const allowedUrls = new Set(canvasAssetUrls(project.canvasData))
const selectedIds = [5, 11, 12, 13, 14]
const approvedCopy = [
  'COME CELEBRATE OUR NEW HOME',
  'Launch night · Thursday 12 November',
  'PIZZA • DRINKS • TEST DRIVES',
  'Explore our new showroom and discover Subaru and XPENG.',
  'Call (03) 9126 0251 to RSVP and confirm the time.'
]
const scenario = readFileSync('docs/banner-studio/editable-artwork/RETAIL-EDIT-SCENARIO.md', 'utf8')
for (const copy of approvedCopy) assert.ok(scenario.includes(copy), 'Copy must be exact user-supplied scenario text')
const scope = { formatKey, layerIds: selectedIds, region: { x: 130, y: 780, w: 2250, h: 1400 }, approvedCopy }
const savedPath = `${out}/saved-project.json`
const saveFixture = value => json('saved-project', value)
const loadFixture = () => JSON.parse(readFileSync(savedPath, 'utf8'))
saveFixture(project)
json('asset-provenance', { sourceProject: sourcePath, sourceProjectSha256: hash(sourceBytes), assets, cleanPlateIsOriginalFlattenedPoster: false, qrSha256: hash(qrSvg), qrPlacement: { x: qr.x, y: qr.y, w: qr.w, h: qr.h }, layoutChoice: 'Full-width invitation above untouched Luke signoff and map; accepted by coordinator to preserve readable copy and exact protected layers.' })

function providerProposal() {
  const updates = [
    { formatKey, layerId: 5, changes: { y: 850, h: 315, fontSize: 130, lineHeight: 1.2 } },
    ...[11, 12, 13, 14].map((id, i) => ({ formatKey, layerId: id, changes: { y: 1535 + i * 100, h: 94, fontSize: 38, lineHeight: 1.2 } }))
  ]
  const common = { opacity: 1, animIn: 'none', animInDur: 0, animOut: 'none', startTime: 0, endTime: 5 }
  const additions = [{ formatKey, layer: { ...common, id: 9100, type: 'rect', name: 'Invitation panel', x: 157, y: 1950, w: 2168, h: 228, zIndex: 200, fillColor: '#071e46', borderRadius: 10 } }]
  const rows = [
    { y: 1958, size: 46, color: '#ffdb28', weight: 800, h: 56 },
    { y: 2014, size: 32, color: '#ffffff', weight: 600, h: 39 },
    { y: 2053, size: 36, color: '#ffdb28', weight: 800, h: 44 },
    { y: 2097, size: 30, color: '#ffffff', weight: 400, h: 37 },
    { y: 2134, size: 30, color: '#ffffff', weight: 600, h: 37 }
  ]
  approvedCopy.forEach((text, i) => additions.push({ formatKey, layer: { ...common, id: 9101 + i, type: 'text', name: `Invitation approved line ${i + 1}`, text, x: 185, y: rows[i].y, w: 2110, h: rows[i].h, zIndex: 201 + i, fontFamily: 'Arial', fontSize: rows[i].size, fontWeight: rows[i].weight, color: rows[i].color, lineHeight: 1.2, textAlign: 'left' } }))
  return { reply: 'Review the exact approved invitation above the preserved personal signoff and map. All original wording, voucher, terms, OEM assets and managed QR remain unchanged.', updates, additions, removals: [], variants: [] }
}
const rawProposal = providerProposal()
json('provider-fixture', { provider: 'deterministic fixture, no inference', raw: rawProposal })
const evidence = {
  status: 'running', startedAt: new Date().toISOString(), base, projectId, formatKey, sourceProjectSha256: hash(sourceBytes),
  scope: 'Actual Nuxt UI with intercepted synthetic auth, local provider response and file-backed persistence; native editing increment only, not automatic flattened reconstruction or commercial print approval.',
  layoutChoice: 'Full-width panel above untouched Luke signoff/map, per coordinator approval.',
  apiRequests: [], blockedExternalRequests: [], blockedWebSockets: [], ambientBadgeFixtureReads: 0,
  liveProviderCalls: 0, designFixtureCalls: 0, scanRequests: 0, saves: 0,
  fixtureErrors: [], pageErrors: [], consoleErrors: [], consoleDetails: [], assertions: {}
}
evidence.previewRuntime = 'Actual Nuxt UI static export, script-free; no external runtime'
const phase = (value) => {
  evidence.phase = value
  json('ui-evidence', evidence)
  console.log('Retail proof:', value)
}
let baseline
const browser = await chromium.launch({ ...(process.env.BANNER_QR_CHROME ? { executablePath: process.env.BANNER_QR_CHROME } : existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}), headless: true })
const context = await browser.newContext({ viewport: { width: 1800, height: 1400 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', error => evidence.pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') {
    evidence.consoleErrors.push(message.text())
    evidence.consoleDetails.push({ text: message.text(), location: message.location(), phase: evidence.phase, operation: evidence.operation })
  }
})
await context.addCookies([{ name: 'auth_status', value: 'logged_in', url: base }])
await context.routeWebSocket('**/api/**', (socket) => {
  evidence.blockedWebSockets.push(socket.url())
  socket.onMessage(() => {})
})
await context.route('**/*', async (route) => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
  if (/\/q\//.test(path)) evidence.scanRequests++
  if (url.origin !== base) {
    evidence.blockedExternalRequests.push({ origin: url.origin, path, resourceType: request.resourceType() })
    if (request.resourceType() === 'stylesheet') return route.fulfill({ body: '', contentType: 'text/css' })
    return route.abort('blockedbyclient')
  }
  if (localAssets.has(path)) return route.fulfill(localAssets.get(path))
  if (!path.startsWith('/api/')) return path.startsWith('/q/') ? route.abort('blockedbyclient') : route.continue()
  // Route the shell badge before any HTTP/provider operation. Avoid injecting
  // scripts into the deliberately script-free scoped preview frames.
  if (path === '/api/ai/anomalies/count/critical-open' && method === 'GET') {
    evidence.ambientBadgeFixtureReads++
    return route.fulfill({ json: { count: 0 } })
  }
  evidence.apiRequests.push({ method, path, query: url.search })
  if (path === '/api/notifications/stream') return route.fulfill({ status: 204, body: '' })
  try {
    let data
    if (path === '/api/agency/banner-studio/ai/design-assist') {
      const body = designAssistRequestSchema.parse(request.postDataJSON())
      const saved = loadFixture()
      assert.equal(body.sourceRevision, saved.updatedAt)
      assert.equal(body.projectId, projectId)
      assert.deepEqual(body.scope, scope)
      validateDesignScope(body.canvasData, body.scope)
      assertScopedDesignSource(saved.canvasData, body.canvasData, body.scope)
      const canvas = validateDesignCanvas(body.canvasData, allowedUrls)
      data = { ...applyDesignProposal(JSON.stringify(rawProposal), canvas, allowedUrls, false, body.scope), sourceRevision: body.sourceRevision, model: 'deterministic-local-fixture', context: { brandKit: null, clientStyleGuide: false, references: [] } }
      assertScopedDesignTransition(canvas, data.canvasData, body.scope)
      json(`request-${++evidence.designFixtureCalls}`, body)
      json(`response-${evidence.designFixtureCalls}`, data)
    } else if (/\/ai(?:\/|$)/.test(path)) throw new Error('Unexpected AI endpoint: ' + path)
    else if (path === '/api/auth/me') data = { user: { id: 'local-retail-proof', name: 'Retail fixture owner', email: 'retail-proof@example.invalid', role: 'owner', permissionGroups: [] } }
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
      assert.equal(method, 'GET', 'Unexpected mutation: ' + path)
      if (path === '/api/agency/banner-studio/projects') data = [loadFixture()]
      else if (path === '/api/agency/banner-studio/assets') data = { assets: [] }
      else if (path === '/api/agency/banner-studio/effects/presets') data = { presets: [] }
      else if (path === '/api/notifications') data = { notifications: [], unreadCount: 0, hasMore: false }
      else if (/counts|unread/.test(path)) data = { count: 0, unread: 0 }
      else if (/session|status|settings|preferences/.test(path)) data = {}
      else data = []
    }
    return route.fulfill({ json: data })
  } catch (error) {
    evidence.fixtureErrors.push(error.stack)
    return route.fulfill({ status: 500, json: { statusMessage: error.message } })
  }
})
const screenshot = (name) => {
  evidence.operation = `Screenshot ${name}`
  return page.screenshot({ path: `${out}/${name}.png` })
}
const editorSnapshot = () => page.locator('[id^="lyr-"]').evaluateAll(elements => elements.map(element => ({ id: element.id, x: element.style.left, y: element.style.top, w: element.style.width, h: element.style.height, text: element.textContent, images: [...element.querySelectorAll('img')].map(image => image.getAttribute('src')) })))
const assertTextFits = async (root, ids, selector) => {
  evidence.operation = `Driver glyph measurement ${selector}`
  const measured = await root.locator(selector).evaluateAll((elements, expectedIds) => elements.filter(element => expectedIds.includes(Number(element.id?.replace('lyr-', '') || element.dataset.id))).map((element) => {
    const range = document.createRange()
    range.selectNodeContents(element.querySelector('[contenteditable]') || element)
    const text = range.getBoundingClientRect(), box = element.getBoundingClientRect()
    return { id: Number(element.id?.replace('lyr-', '') || element.dataset.id), text: element.textContent, box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom }, rendered: { x: text.x, y: text.y, right: text.right, bottom: text.bottom }, fits: text.x >= box.x - 1 && text.y >= box.y - 1 && text.right <= box.right + 1 && text.bottom <= box.bottom + 1 }
  }), ids)
  assert.equal(measured.length, ids.length, 'Every affected text layer must be rendered')
  for (const item of measured) assert.equal(item.fits, true, 'Visible words must fit checked layer bounds: ' + item.id)
  return measured
}
const waitForLayers = count => page.waitForFunction(expected => document.querySelectorAll('[id^="lyr-"]').length === expected, count, { timeout: 120000 })
const saveThroughUi = async () => {
  const saved = page.waitForResponse(response => response.url() === `${base}/api/agency/banner-studio/projects/${projectId}` && response.request().method() === 'PATCH')
  await page.locator('body').evaluate((element) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    element.focus()
  })
  await page.keyboard.press('ControlOrMeta+s')
  assert.equal((await saved).status(), 200)
  return loadFixture()
}
function assertPreserved(canvas) {
  const before = baseline[formatKey], after = canvas[formatKey]
  for (const layer of before.layers) {
    const result = after.layers.find(item => item.id === layer.id)
    assert.ok(result, 'Every original layer is retained')
    if (!selectedIds.includes(layer.id)) assert.deepEqual(result, layer, 'Unselected layer unchanged: ' + layer.name)
    if (layer.text) assert.equal(result.text, layer.text, 'Original wording exact: ' + layer.name)
  }
  const oldMetadata = { ...before }
  const newMetadata = { ...after }
  delete oldMetadata.layers
  delete newMetadata.layers
  assert.deepEqual(newMetadata, oldMetadata, 'Reconstruction and all board metadata unchanged')
}

try {
  validateDesignScope(project.canvasData, scope)
  const preflight = applyDesignProposal(JSON.stringify(rawProposal), validateDesignCanvas(project.canvasData, allowedUrls), allowedUrls, false, scope)
  json('validator-preflight', { status: 'passed', inventory: preflight.inventory, scope, note: 'Actual proposal and shared scope validators; browser verification follows separately.' })
  phase('Loading actual Nuxt editor')
  await page.goto(`${base}/agency/banner-studio/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  phase('Waiting for editor layers')
  await page.getByRole('button', { name: 'Create with AI', exact: true }).waitFor({ timeout: 120000 })
  await waitForLayers(125)
  baseline = structuredClone((await saveThroughUi()).canvasData)
  for (const original of board.layers) {
    const normalized = baseline[formatKey].layers.find(layer => layer.id === original.id)
    for (const [key, value] of Object.entries(original)) assert.deepEqual(normalized[key], value)
  }
  json('baseline-project', loadFixture())
  const originalEditor = await editorSnapshot()
  phase('Normalized baseline saved; configuring scoped review')
  await screenshot('01-before')
  // UI interaction steps are kept below the fixture boundary so no editor internals
  // are mutated by the proof. Request/response validators are the actual modules.
  await page.getByRole('button', { name: 'Create with AI', exact: true }).click()
  await page.getByRole('dialog', { name: 'Create with AI' }).waitFor()
  // Scoped controls are provided by the companion implementation worker.
  await page.getByText('Limit changes to a region', { exact: true }).click()
  await page.getByRole('region', { name: 'Scoped edit boundary', exact: true }).waitFor()
  const picker = page.getByRole('region', { name: 'Scoped edit boundary', exact: true }).getByRole('button', { name: 'Show popup', exact: true })
  await picker.click()
  for (const id of selectedIds) await page.getByRole('option', { name: `${board.layers.find(layer => layer.id === id).name} (#${id})`, exact: true }).click()
  await picker.click()
  await page.getByRole('listbox').waitFor({ state: 'hidden' })
  for (const [label, value] of Object.entries({ 'Region left': scope.region.x, 'Region top': scope.region.y, 'Region width': scope.region.w, 'Region height': scope.region.h })) await page.getByLabel(label, { exact: true }).fill(String(value))
  await page.getByLabel('Approved wording', { exact: true }).fill(approvedCopy.join('\n'))
  const requestPreview = async () => {
    const prompt = page.getByLabel('What would you like to create or change?', { exact: true })
    await prompt.fill('Promote the approved launch invitation in a compact full-width navy panel above the original Luke signoff and map. Reduce heading and body spacing, preserve all original body words and facts, all unselected layers and metadata. Retain sale dates separately; no new event time, free claim or invented showroom image.')
    assert.match(await prompt.inputValue(), /^Promote the approved launch invitation/)
    writeFileSync(`${out}/configured-scope-aria.txt`, await page.getByRole('dialog', { name: 'Create with AI' }).ariaSnapshot())
    assert.equal(await page.getByRole('button', { name: 'Preview proposal', exact: true }).isEnabled(), true, 'Configured native scope and prompt must permit preview')
    const response = page.waitForResponse(response => response.url() === `${base}/api/agency/banner-studio/ai/design-assist` && response.request().method() === 'POST').catch(error => ({ error }))
    await page.getByRole('button', { name: 'Preview proposal', exact: true }).click()
    const result = await response
    if (result.error) throw result.error
    assert.equal(result.status(), 200, 'Actual server proposal validator accepts the deterministic provider response')
    await page.waitForFunction(element => element.value === '', await prompt.elementHandle(), { timeout: 30000 })
    await page.getByRole('region', { name: 'Proposed design', exact: true }).waitFor()
  }
  await requestPreview()
  phase('Checking first proposal and rendered text')
  await page.getByRole('region', { name: 'Affected and protected layers', exact: true }).waitFor()
  await page.locator('iframe[title="Design before scoped edit"]').waitFor()
  await page.locator('iframe[title="Scoped design proposal"]').waitFor()
  const firstResponse = JSON.parse(readFileSync(`${out}/response-1.json`, 'utf8'))
  const expectedInventory = assertScopedDesignTransition(baseline, firstResponse.canvasData, scope)
  assert.deepEqual(firstResponse.inventory, expectedInventory)
  evidence.inventory = expectedInventory
  const inventoryText = await page.getByRole('region', { name: 'Affected and protected layers', exact: true }).innerText()
  for (const id of expectedInventory.affectedLayerIds) assert.ok(inventoryText.includes(`#${id}`), 'Affected inventory visible: ' + id)
  json('preview-text-fit', await assertTextFits(page.frameLocator('iframe[title="Scoped design proposal"]'), [...selectedIds, 9101, 9102, 9103, 9104, 9105], '[data-id]'))
  for (const [name, title] of [['before-composition', 'Design before scoped edit'], ['after-composition', 'Scoped design proposal']]) {
    const html = await page.locator(`iframe[title="${title}"]`).getAttribute('srcdoc')
    assert.ok(html, 'Use the actual Nuxt UI renderer output')
    assert.doesNotMatch(html, /<\s*script\b/i, 'Scoped previews contain no executable scripts')
    writeFileSync(`${out}/${name}.html`, html)
    const path = `/fixture-retail-${name}.html`
    localAssets.set(path, { body: html, contentType: 'text/html' })
    const fullPreview = await context.newPage()
    await fullPreview.setViewportSize({ width: 2480, height: 3508 })
    await fullPreview.goto(base + path, { waitUntil: 'load' })
    await fullPreview.locator('img').evaluateAll(elements => Promise.all(elements.map(element => element.decode())))
    await fullPreview.screenshot({ path: `${out}/${name}.png`, fullPage: true })
    await fullPreview.close()
  }
  await page.locator('iframe[title="Design before scoped edit"]').scrollIntoViewIfNeeded()
  await screenshot('02-before-after-review')
  assert.deepEqual(loadFixture().canvasData, baseline, 'Preview never mutates saved canvas')
  assert.deepEqual(await editorSnapshot(), originalEditor, 'Preview never mutates rendered editor layers')
  await waitForLayers(125)
  const apply = page.getByRole('button', { name: 'Apply to canvas', exact: true })
  assert.equal(await apply.isDisabled(), true, 'Explicit human review is mandatory')
  evidence.assertions.previewNoMutationAndReviewRequired = true
  evidence.assertions.beforeAfterAndAffectedInventory = true
  const review = page.getByRole('region', { name: 'Proposed design', exact: true }).getByRole('checkbox')
  await review.check()
  assert.equal(await apply.isEnabled(), true, 'Reviewed current proposal is applicable before invalidation')
  await page.getByLabel('Region left', { exact: true }).fill('131')
  await page.getByText('Canvas changed', { exact: true }).waitFor()
  assert.equal(await apply.isDisabled(), true, 'Changing the scope invalidates the existing preview')
  await screenshot('02a-scope-invalidated')
  await page.getByLabel('Region left', { exact: true }).fill(String(scope.region.x))
  await requestPreview()
  await review.check()
  assert.equal(await apply.isEnabled(), true)
  await saveThroughUi()
  assert.deepEqual(loadFixture().canvasData, baseline, 'Saving during preview retains exact original canvas')
  await page.getByText('Canvas changed', { exact: true }).waitFor()
  assert.equal(await apply.isDisabled(), true, 'Changing the saved source revision invalidates the preview')
  await screenshot('02b-source-invalidated')
  evidence.assertions.scopeAndSourceRevisionInvalidate = true
  await requestPreview()
  await review.check()
  await apply.click()
  await waitForLayers(131)
  const applied = (await saveThroughUi()).canvasData
  assertPreserved(applied)
  assertScopedDesignTransition(baseline, applied, scope)
  json('editor-text-fit', await assertTextFits(page, [...selectedIds, 9101, 9102, 9103, 9104, 9105], '[id^="lyr-"]'))
  json('applied-project', loadFixture())
  await screenshot('03-applied')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+z')
  await waitForLayers(125)
  assert.deepEqual((await saveThroughUi()).canvasData, baseline)
  await screenshot('04-single-undo')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await waitForLayers(131)
  assert.deepEqual((await saveThroughUi()).canvasData, applied)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLayers(131)
  assert.deepEqual((await saveThroughUi()).canvasData, applied)
  assertPreserved(loadFixture().canvasData)
  await screenshot('05-reloaded')
  evidence.assertions.singleUndoRedoSaveReload = true
  evidence.assertions.allOriginalWordsAndUnselectedLayersExact = true
  const protectedInventory = baseline[formatKey].layers.filter(layer => !selectedIds.includes(layer.id)).map(layer => ({ id: layer.id, name: layer.name, beforeSha256: hash(layer), afterSha256: hash(applied[formatKey].layers.find(item => item.id === layer.id)) }))
  json('unchanged-inventory', { selectedIds, originalLayerCount: 125, finalLayerCount: 131, protectedInventory, bodyCopy: baseline[formatKey].layers.filter(layer => layer.text).map(layer => ({ id: layer.id, text: layer.text, exact: applied[formatKey].layers.find(item => item.id === layer.id).text === layer.text })) })
  writeFileSync(`${out}/review.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Retail invitation native fixture review</title><style>body{margin:24px;font:16px/1.5 system-ui;background:#f4f5f7;color:#172033}main{max-width:1600px;margin:auto}.sides{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}figure{margin:0}img{display:block;width:100%;height:auto;border:1px solid #bbc3cf}figcaption{font-weight:700;padding:12px 0}a{color:#164db5}</style><main><h1>Retail invitation · native fixture review</h1><p>Actual Nuxt preview HTML, deterministic provider fixture and file-backed API persistence. Original words and all 120 unselected layers remain exact. Native pilot increment only; no automatic flattened reconstruction, live provider, hosted storage, QR scans or commercial print approval.</p><p>The full-width invitation sits above the untouched Luke signoff and map. Managed QR is reserved in upper whitespace before the edit; its final physical print size remains unverified.</p><p><a href="ui-evidence.json">UI evidence</a> · <a href="unchanged-inventory.json">Unchanged inventory and hashes</a> · <a href="editor-text-fit.json">Rendered editor text bounds</a> · <a href="provider-fixture.json">Provider fixture</a></p><div class="sides"><figure><figcaption>Before · 124 native source layers + managed QR</figcaption><img src="before-composition.png" alt="Original native letter with reserved managed QR"></figure><figure><figcaption>After · approved invitation, original body wording preserved</figcaption><img src="after-composition.png" alt="Scoped invitation panel above original signoff and map"></figure></div></main></html>`)
  assert.equal(hash(readFileSync(sourcePath)), hash(sourceBytes), 'Source project bytes untouched')
  assert.deepEqual(evidence.fixtureErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.consoleErrors, [])
  assert.equal(evidence.scanRequests, 0)
  evidence.status = 'passed'
  evidence.phase = 'complete'
  rmSync(`${out}/failure.png`, { force: true })
  rmSync(`${out}/failure.txt`, { force: true })
  rmSync(`${out}/failure-aria.txt`, { force: true })
  console.log('PASS: actual Nuxt scoped retail review/apply/undo/redo/save/reload; deterministic provider and file persistence only')
} catch (error) {
  evidence.status = 'failed'
  evidence.failure = error.stack
  await screenshot('failure').catch(() => {})
  writeFileSync(`${out}/failure.txt`, await page.locator('body').innerText().catch(() => 'Page unavailable'))
  writeFileSync(`${out}/failure-aria.txt`, await page.locator('body').ariaSnapshot().catch(() => 'Page unavailable'))
  throw error
} finally {
  evidence.finishedAt = new Date().toISOString()
  json('ui-evidence', evidence)
  await browser.close()
}
