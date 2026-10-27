// Run: node scripts/banner-studio/prove-layer-animation.mjs
// Actual Nuxt UI on coordinator-owned loopback server; all API/auth/storage are
// intercepted file-backed fixtures. Never run against a hosted origin.
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const base = 'http://127.0.0.1:3137'
const out = resolve('output/editable-artwork-animation')
mkdirSync(out, { recursive: true })
const json = (name, value) => writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2))
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')
json('evidence', { status: 'starting', base, provider: 'none', storage: 'local file fixture' })
const { renderQrSvg } = await tsImport('../../shared/qr/render-svg.ts', import.meta.url)
const { QrStyleSchema } = await tsImport('../../shared/qr/style.ts', import.meta.url)
const { buildBannerHTML } = await tsImport('../../app/utils/banner-html-builder.ts', { parentURL: import.meta.url, tsconfig: resolve('.nuxt/tsconfig.app.json') })
const { buildBannerHTML: buildServerHTML } = await tsImport('../../server/utils/banner/htmlBuilder.ts', { parentURL: import.meta.url, tsconfig: resolve('.nuxt/tsconfig.app.json') })
const sourcePath = resolve('output/editable-artwork-pilot/project.json')
const sourceBytes = readFileSync(sourcePath)
const project = JSON.parse(sourceBytes)
const formatKey = Object.keys(project.canvasData)[0]
const sourceCanvas = structuredClone(project.canvasData)
const projectId = '12345678-1234-4234-8234-123456789012'
const clientId = '12345678-1234-4234-8234-123456789013'
Object.assign(project, { id: projectId, clientId, name: 'Layer animation — local native fixture', createdBy: 'local-animation-proof', updatedAt: '2026-10-27T01:00:00.000Z' })
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
  const path = `/api/public/banner-assets/animation-fixture-${layer.id}.png`
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
Object.assign(qr, { x: 1500, y: 640, w: 140, h: 140, src: '/api/public/banner-assets/animation-fixture-qr.svg' })
localAssets.set(qr.src, { body: qrSvg, contentType: 'image/svg+xml' })
writeFileSync(`${out}/managed-qr.svg`, qrSvg)
board.layers.push(qr)
const sourceFiles = [
  'scripts/banner-studio/prove-layer-animation.mjs',
  'app/components/banner/Artboard.client.vue', 'app/components/banner/LayerContextMenu.vue',
  'app/components/banner/Timeline.client.vue', 'app/components/banner/Inspector.client.vue',
  'app/components/banner/inspector/MotionPath.vue', 'app/components/banner/layers/Text.client.vue',
  'app/composables/useBannerStudio.ts', 'app/composables/useBannerTimeline.ts',
  'app/composables/useBannerAnimationActions.ts', 'app/composables/useBannerInspector.ts',
  'app/utils/banner-html-builder.ts', 'server/utils/banner/htmlBuilder.ts',
  'app/pages/agency/banner-studio/[id].client.vue', 'app/utils/banner-mask.ts', 'server/utils/banner/mask.ts',
  'app/components/banner/layers/Image.client.vue', 'app/components/banner/layers/Rect.client.vue',
  'app/components/banner/layers/Bg.client.vue', 'app/components/banner/layers/Video.client.vue',
  'app/components/banner/layers/Button.client.vue', 'app/utils/banner-context-menu.ts'
]
const sourceHashes = Object.fromEntries(sourceFiles.filter(existsSync).map(path => [path, hash(readFileSync(path))]))
const targetId = 5
const savedPath = `${out}/saved-project.json`
const saveFixture = value => json('saved-project', value)
const loadFixture = () => JSON.parse(readFileSync(savedPath, 'utf8'))
saveFixture(project)
json('asset-provenance', { sourceProject: sourcePath, sourceProjectSha256: hash(sourceBytes), assets, cleanPlateIsOriginalFlattenedPoster: false, qrSha256: hash(qrSvg) })
const evidence = {
  status: 'running', startedAt: new Date().toISOString(), base, projectId, formatKey, targetId, sourceProjectSha256: hash(sourceBytes),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes,
  scope: 'Actual Nuxt canvas/timeline UI and actual frontend HTML builder; synthetic local auth and file-backed persistence, no hosted/provider/production acceptance.',
  limitations: ['Curated native local lifestyle letter back, not automatic flattened reconstruction.', 'No GIF, video, hosted storage, live provider, QR scan, or commercial print acceptance.'],
  apiRequests: [], blockedExternalRequests: [], blockedWebSockets: [], unexpectedRequests: [], ambientBadgeFixtureReads: 0,
  liveProviderCalls: 0, scanRequests: 0, saves: 0, fixtureErrors: [], pageErrors: [], consoleErrors: [], assertions: {}, editorSamples: [], exportSamples: []
}
const phase = value => { evidence.phase = value; json('evidence', evidence); console.log('Animation proof:', value) }
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
const waitForLayers = () => page.waitForFunction(() => document.querySelectorAll('[id^="lyr-"]').length === 125, null, { timeout: 120000 })
const unfocus = async () => page.locator('body').evaluate(element => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); element.focus() })
const saveThroughUi = async () => {
  await unfocus()
  const response = page.waitForResponse(response => response.url() === `${base}/api/agency/banner-studio/projects/${projectId}` && response.request().method() === 'PATCH')
  await page.keyboard.press('ControlOrMeta+s')
  assert.equal((await response).status(), 200)
  return structuredClone(loadFixture().canvasData)
}
const head = canvas => canvas[formatKey].layers.find(layer => layer.id === targetId)
function assertPreserved(canvas) {
  const before = baseline[formatKey], after = canvas[formatKey]
  assert.equal(after.layers.length, before.layers.length)
  for (const layer of before.layers) {
    const actual = after.layers.find(item => item.id === layer.id)
    assert.ok(actual)
    if (layer.id !== targetId) assert.deepEqual(actual, layer, 'Unselected layer exact: ' + layer.name)
    if (layer.text) assert.equal(actual.text, layer.text, 'Original text exact: ' + layer.name)
  }
  assert.deepEqual({ ...after, layers: null }, { ...before, layers: null }, 'Artboard metadata exact')
}
const canvasTarget = () => page.locator(`#lyr-${targetId}`)
const animationTab = () => page.getByRole('tab', { name: 'Animation', exact: true })
const contextAction = async (locator, name, shot) => {
  await locator.scrollIntoViewIfNeeded()
  await locator.click({ button: 'right' })
  const item = page.getByRole('menuitem', { name, exact: true })
  await item.waitFor()
  assert.equal(await item.isEnabled(), true)
  if (shot) await screenshot(shot)
  await item.click()
  assert.equal(await animationTab().getAttribute('aria-selected'), 'true')
  await page.locator(`[data-motion-layer-id="${targetId}"]`).waitFor()
  assert.equal(await page.locator('[data-inspector-layer-id]').getAttribute('data-inspector-layer-id'), String(targetId))
}
const undo = async () => { await unfocus(); await page.keyboard.press('ControlOrMeta+z'); await page.waitForTimeout(150) }
const redo = async () => { await unfocus(); await page.keyboard.press('ControlOrMeta+Shift+z'); await page.waitForTimeout(150) }
const sample = async (locator, time) => locator.evaluate((element, time) => {
  const style = getComputedStyle(element), matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform), box = element.getBoundingClientRect()
  return { time, transform: style.transform, x: matrix.m41, y: matrix.m42, scaleX: matrix.m11, scaleY: matrix.m22, opacity: Number(style.opacity), visible: style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0, box: { x: box.x, y: box.y, w: box.width, h: box.height } }
}, time)
const seekEditor = async time => {
  const ruler = page.locator('[data-testid="banner-timeline-ruler"]')
  await ruler.scrollIntoViewIfNeeded()
  const box = await ruler.boundingBox()
  assert.ok(box)
  await page.mouse.click(box.x + time * 120, box.y + 14)
  await page.waitForTimeout(120)
  return sample(canvasTarget(), time)
}
try {
  phase('Loading actual Nuxt editor')
  await page.goto(`${base}/agency/banner-studio/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  phase('Waiting for visible native layers')
  await waitForLayers()
  baseline = await saveThroughUi()
  for (const layer of board.layers) for (const [key, value] of Object.entries(layer)) assert.deepEqual(baseline[formatKey].layers.find(item => item.id === layer.id)[key], value)
  json('baseline-project', loadFixture())
  await screenshot('01-before')
  phase('Canvas Animate and Add Tween')
  await contextAction(canvasTarget(), 'Animate', '02-canvas-menu')
  assert.deepEqual(await saveThroughUi(), baseline, 'Animate is selection/navigation only')
  await contextAction(canvasTarget(), 'Add Tween')
  assert.equal(await page.locator('[data-motion-layer-id="5"] [data-tween-index="0"]').getAttribute('data-tween-selected'), 'true')
  const firstTween = await saveThroughUi()
  assert.equal(head(firstTween).motionPathTweens.length, 1)
  assert.ok(head(firstTween).motionPath.length >= 2)
  assertPreserved(firstTween)
  await screenshot('03-created-tween')
  await undo()
  assert.deepEqual(await saveThroughUi(), baseline, 'Path plus first tween is one undo')
  await redo()
  assert.deepEqual(await saveThroughUi(), firstTween)
  evidence.assertions.canvasAnimateAddTweenSingleUndoRedo = true
  phase('Timeline right-click selects target and appends tween')
  await page.locator('#lyr-4').click()
  assert.equal(await page.locator('[data-inspector-layer-id]').getAttribute('data-inspector-layer-id'), '4')
  const row = page.locator(`[data-layer-id="${targetId}"][data-testid="banner-timeline-layer"]`)
  await contextAction(row, 'Animate', '04-timeline-menu')
  assert.deepEqual(await saveThroughUi(), firstTween)
  await contextAction(row, 'Add Tween')
  assert.equal(await page.locator('[data-motion-layer-id="5"] [data-tween-index="1"]').getAttribute('data-tween-selected'), 'true')
  const secondTween = await saveThroughUi()
  assert.equal(head(secondTween).motionPathTweens.length, 2)
  assertPreserved(secondTween)
  await undo()
  assert.deepEqual(await saveThroughUi(), firstTween, 'Append/split is one undo')
  await redo()
  assert.deepEqual(await saveThroughUi(), secondTween)
  evidence.assertions.timelineAnimateAddTweenSingleUndoRedo = true
  phase('Configure visible motion and retain directly editable native text')
  await page.getByLabel('Waypoint 1 X', { exact: true }).fill('120')
  await page.getByLabel('Waypoint 1 Y', { exact: true }).fill('80')
  await unfocus()
  const configured = await saveThroughUi()
  assert.deepEqual(head(configured).motionPath.at(-1), { x: 120, y: 80 })
  assertPreserved(configured)
  await seekEditor(0)
  await canvasTarget().click()
  await canvasTarget().dblclick()
  const editable = canvasTarget().locator('[contenteditable="true"]')
  await editable.waitFor()
  await editable.fill(head(baseline).text + ' LOCAL PROOF')
  await unfocus()
  const edited = await saveThroughUi()
  assert.equal(head(edited).text, head(baseline).text + ' LOCAL PROOF')
  assert.deepEqual(head(edited).motionPath, head(configured).motionPath)
  await undo()
  assert.deepEqual(await saveThroughUi(), configured, 'Undo direct text edit restores original exact words and motion')
  assert.equal(await canvasTarget().locator('[contenteditable]').innerText(), head(baseline).text, 'Undo restores actual rendered native wording')
  evidence.assertions.nativeTextDirectlyEditable = true
  evidence.boundaryNote = 'Pilot normalization retains existing fadeOut at5s; visible-motion samples include4.5s before its exit;5s also checked for editor/export parity, then backwards seek to0.'
  phase('Scrub multiple timestamps and play actual editor timeline')
  await contextAction(row, 'Animate')
  for (const time of [0, 0.625, 1.25, 2.5, 3.75, 4.5, 5, 0]) {
    const current = await seekEditor(time)
    evidence.editorSamples.push(current)
    assert.equal(current.visible, true)
    if (time < 4.7) assert.ok(current.opacity > 0.9, 'Editor headline visibly opaque before existing exit')
    if ([0, 2.5, 4.5].includes(time)) await screenshot(`05-editor-${time}`)
  }
  assert.ok(Math.abs(evidence.editorSamples[5].x - evidence.editorSamples[0].x) > 100, 'Visible horizontal movement')
  assert.ok(Math.abs(evidence.editorSamples[5].y - evidence.editorSamples[0].y) > 60, 'Visible vertical movement')
  const play = page.getByRole('button', { name: 'Play timeline', exact: true })
  await play.click()
  await page.waitForTimeout(900)
  const playing = await sample(canvasTarget(), 'playing')
  await page.getByRole('button', { name: 'Pause timeline', exact: true }).click()
  assert.ok(playing.visible && playing.opacity > 0.9, 'Playing headline remains visible')
  assert.ok(playing.x > evidence.editorSamples[0].x + 1)
  evidence.playSample = playing
  evidence.assertions.scrubAndPlayMoveVisibleLayer = true
  phase('Save/reload and protected QR/locked eligibility')
  assert.deepEqual(await saveThroughUi(), configured)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLayers()
  assert.deepEqual(await saveThroughUi(), configured)
  await contextAction(canvasTarget(), 'Animate')
  evidence.reloadedSample = await seekEditor(2.5)
  assert.ok(Math.abs(evidence.reloadedSample.x - evidence.editorSamples[3].x) < 0.1)
  assertPreserved(loadFixture().canvasData)
  await screenshot('06-reloaded')
  evidence.assertions.saveReloadRestoresMotion = true
  for (const [id, name] of [[qr.id, 'managed QR'], [1, 'locked background']]) {
    const protectedRow = page.locator(`[data-layer-id="${id}"][data-testid="banner-timeline-layer"]`)
    await protectedRow.scrollIntoViewIfNeeded()
    await protectedRow.click({ button: 'right' })
    await page.getByRole('menu').waitFor()
    for (const action of ['Animate', 'Add Tween']) {
      const item = page.getByRole('menuitem', { name: action, exact: true })
      assert.ok(await item.count() === 0 || await item.isDisabled(), name + ' rejects ' + action)
    }
    await screenshot(`07-protected-${id}`)
    await page.keyboard.press('Escape')
    await page.getByRole('menu').waitFor({ state: 'hidden' })
    assert.deepEqual(await saveThroughUi(), configured, name + ' context menu changes no document data')
  }
  assert.deepEqual(await saveThroughUi(), configured)
  evidence.assertions.managedQrAndLockedIneligible = true
  evidence.negativeCoverage = { managedQr: 'timeline UI rejected', lockedBackground: 'timeline UI rejected', staleMenuRace: 'not exercised in browser', remoteLock: 'not exercised in browser' }
  phase('Execute actual HTML builder with bundled local GSAP')
  const exportBoard = structuredClone(configured[formatKey])
  for (const layer of exportBoard.layers) if (layer.src && localAssets.has(layer.src)) {
    const asset = localAssets.get(layer.src)
    layer.src = `data:${asset.contentType};base64,${Buffer.from(asset.body).toString('base64')}`
  }
  const exportOptions = { includeAnimations: true, bgColor: exportBoard.bgColor, playback: exportBoard.playback }
  for (const [exporter, builder] of [['client', buildBannerHTML], ['server', buildServerHTML]]) {
    const rawHtml = builder(formatKey, exportBoard.layers, exportOptions)
    writeFileSync(`${out}/generated-${exporter}-original.html`, rawHtml)
    const runtimeFiles = ['gsap', 'MotionPathPlugin', 'CustomEase']
    evidence.localGsapVersion = require('gsap/package.json').version
    evidence.runtimeHashes = {}
    let standalone = rawHtml
    for (const name of runtimeFiles) {
      const file = require.resolve(`gsap/dist/${name}.min.js`), bytes = readFileSync(file, 'utf8')
      evidence.runtimeHashes[name] = hash(bytes)
      standalone = standalone.replace(new RegExp(`<script src="https://cdnjs\\.cloudflare\\.com/ajax/libs/gsap/[^/]+/${name}\\.min\\.js"><\\/script>`, 'g'), () => `<script>${bytes.replace(/<\/script/gi, '<\\/script')}</script>`)
    }
    assert.doesNotMatch(standalone, /<script[^>]+src="https?:/i)
    writeFileSync(`${out}/${exporter === 'client' ? 'animated-letter' : 'animated-letter-server'}.html`, standalone)
    localAssets.set('/fixture-animation-export.html', { body: standalone, contentType: 'text/html' })
    const exported = await context.newPage()
    await exported.setViewportSize({ width: 2480, height: 3508 })
    await exported.goto(`${base}/fixture-animation-export.html`, { waitUntil: 'load' })
    await exported.waitForFunction(() => Boolean(window.__engagrTimeline))
    await exported.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
    for (const editor of evidence.editorSamples) {
      await exported.evaluate(time => { window.__engagrTimeline.pause().seek(time, false) }, editor.time)
      const result = await sample(exported.locator(`[data-id="${targetId}"]`), editor.time)
      evidence.exportSamples.push({ exporter, ...result })
      assert.ok(result.visible, 'Export headline has visible bounds')
      if (editor.time < 4.7) assert.ok(result.opacity > 0.9, 'Export headline visibly opaque before existing exit')
      for (const key of ['x', 'y', 'scaleX', 'scaleY', 'opacity']) assert.ok(Math.abs(result[key] - editor[key]) < 0.15, `Editor/export ${key} parity at ${editor.time}: ${editor[key]} vs ${result[key]}`)
      if (exporter === 'client' && [0, 2.5, 4.5].includes(editor.time)) await exported.screenshot({ path: `${out}/export-${editor.time}.png`, fullPage: true })
    }
    await exported.close()
  }
  evidence.assertions.actualHtmlBuilderTransformParity = true
  const protectedInventory = baseline[formatKey].layers.filter(layer => layer.id !== targetId).map(layer => ({ id: layer.id, name: layer.name, beforeSha256: hash(layer), afterSha256: hash(configured[formatKey].layers.find(item => item.id === layer.id)) }))
  json('unchanged-inventory', { protectedCount: protectedInventory.length, protectedInventory, textCount: baseline[formatKey].layers.filter(layer => layer.text).length, allOriginalTextExact: true })
  json('transform-samples', { editor: evidence.editorSamples, exported: evidence.exportSamples, reloaded: evidence.reloadedSample, playing: evidence.playSample })
  assert.equal(hash(readFileSync(sourcePath)), hash(sourceBytes))
  assert.deepEqual(evidence.fixtureErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.consoleErrors, [])
  assert.deepEqual(evidence.unexpectedRequests, [])
  assert.equal(evidence.scanRequests, 0)
  for (const [path, sha256] of Object.entries(sourceHashes)) assert.equal(hash(readFileSync(path)), sha256, 'Source unchanged throughout proof: ' + path)
  evidence.status = 'passed'
  evidence.phase = 'complete'
  writeFileSync(`${out}/review.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Native layer animation local proof</title><style>body{font:16px/1.5 system-ui;margin:24px;background:#f4f5f7;color:#172033}main{max-width:1500px;margin:auto}.shots{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}img{width:100%;border:1px solid #bbc3cf}iframe{width:744px;height:1053px;border:1px solid #bbc3cf}a{color:#164db5}</style><main><h1>Native headline animation · local proof</h1><p>Actual Nuxt canvas and timeline right-click Animate/Add Tween, directly editable native text, one-step undo/redo, save/reload, and actual HTML-builder transform parity. 124 unselected layers including map, legal text and managed QR remain exact; all 31 original text blocks remain exact.</p><p>Curated local lifestyle letter back; synthetic auth and file-backed API persistence. Installed GSAP ${evidence.localGsapVersion} bundled locally. No live provider, hosted storage, automatic reconstruction, GIF/video, QR scan or print acceptance.</p><p><a href="evidence.json">Evidence</a> · <a href="transform-samples.json">Transform samples</a> · <a href="unchanged-inventory.json">Protected inventory</a> · <a href="animated-letter.html">Standalone animated HTML</a></p><div class="shots">${[0,2.5,4.5].map(t => `<figure><figcaption>HTML export at ${t}s</figcaption><img src="export-${t}.png" alt="Letter animation at ${t} seconds"></figure>`).join('')}</div><h2>Actual editor</h2><img src="06-reloaded.png" alt="Reloaded editor animation"><h2>Menu interactions</h2><img src="02-canvas-menu.png" alt="Canvas right-click menu"><img src="04-timeline-menu.png" alt="Timeline right-click menu"></main></html>`)
  for (const name of ['failure.png', 'failure.txt', 'failure-aria.txt']) rmSync(`${out}/${name}`, { force: true })
  console.log(`PASS: ${Object.keys(evidence.assertions).length} browser assertion groups, ${evidence.saves} local saves, ${evidence.editorSamples.length} editor / ${evidence.exportSamples.length} export samples, 124 exact protected layers`)
} catch (error) {
  evidence.status = 'failed'; evidence.failure = error.stack
  await screenshot('failure').catch(() => {})
  writeFileSync(`${out}/failure.txt`, await page.locator('body').innerText().catch(() => 'Page unavailable'))
  writeFileSync(`${out}/failure-aria.txt`, await page.locator('body').ariaSnapshot().catch(() => 'Page unavailable'))
  throw error
} finally {
  evidence.finishedAt = new Date().toISOString()
  json('evidence', evidence)
  await browser.close()
}
