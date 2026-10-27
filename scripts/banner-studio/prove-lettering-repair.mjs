// Actual Nuxt editor proof. Auth, provider and storage are loopback-only fixtures.
// No live provider inference, QR scan or hosted write is permitted.
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:3137'
const out = resolve('output/editable-artwork-repair/ui')
mkdirSync(out, { recursive: true })
const json = (name, value) =>
  writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2))
const hash = value =>
  createHash('sha256')
    .update(
      typeof value === 'string' || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value)
    )
    .digest('hex')
const { letteringRepairRequestSchema } = await tsImport(
  '../../shared/bannerLetteringRepair.ts',
  import.meta.url
)
const { renderQrSvg } = await tsImport(
  '../../shared/qr/render-svg.ts',
  import.meta.url
)
const { QrStyleSchema } = await tsImport(
  '../../shared/qr/style.ts',
  import.meta.url
)
const sourcePath
  = 'output/editable-artwork-reference-pack/concepts/concept-2-local-lifestyle-back-original.png'
const sourceBytes = readFileSync(sourcePath)
assert.equal(
  hash(sourceBytes),
  'b8f226169690d148f48578ff1ab5f251870224154b46e3cd7fa763c42d599ce6'
)
const image = PNG.sync.read(sourceBytes)
const formatKey = `custom_${image.width}x${image.height}`
const region = { x: 0.05, y: 0.223, w: 0.75, h: 0.11 }
const pixelRegion = {
  x: Math.ceil(region.x * image.width),
  y: Math.ceil(region.y * image.height),
  w:
    Math.floor((region.x + region.w) * image.width)
    - Math.ceil(region.x * image.width),
  h:
    Math.floor((region.y + region.h) * image.height)
    - Math.ceil(region.y * image.height)
}
const sourceWording = 'WE’VE MOVED.\nYOU’RE INVITED.'
const wording = 'COME CELEBRATE\nOUR NEW HOME'
// Deliberately synthetic provider response: white replacement within the selected
// rectangle. This fixture does not claim natural-background repair quality.
const repaired = PNG.sync.read(sourceBytes)
for (let y = pixelRegion.y; y < pixelRegion.y + pixelRegion.h; y++)
  for (let x = pixelRegion.x; x < pixelRegion.x + pixelRegion.w; x++)
    repaired.data.set([255, 255, 255, 255], (y * image.width + x) * 4)
const repairedBytes = PNG.sync.write(repaired)
let outsidePixels = 0,
  changedInside = 0
for (let y = 0; y < image.height; y++)
  for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4
    const same = image.data
      .subarray(i, i + 4)
      .equals(repaired.data.subarray(i, i + 4))
    if (
      x < pixelRegion.x
      || x >= pixelRegion.x + pixelRegion.w
      || y < pixelRegion.y
      || y >= pixelRegion.y + pixelRegion.h
    ) {
      assert(same)
      outsidePixels++
    } else if (!same) changedInside++
  }
assert(changedInside > 0)
writeFileSync(`${out}/source.png`, sourceBytes)
writeFileSync(`${out}/synthetic-repaired.png`, repairedBytes)
const sourceUrl = '/api/public/banner-assets/repair-fixture-source.png',
  repairedUrl = '/api/public/banner-assets/repair-fixture-repaired.png'
const localAssets = new Map([
  [sourceUrl, { body: sourceBytes, contentType: 'image/png' }],
  [repairedUrl, { body: repairedBytes, contentType: 'image/png' }]
])
const projectId = '12345678-1234-4234-8234-123456789012'
const qrFixture = JSON.parse(
  readFileSync(
    'output/editable-artwork-v2/managed-qr/saved-project.json',
    'utf8'
  )
)
const qr = structuredClone(
  Object.values(qrFixture.canvasData)[0].layers.find(l => l.platformQr)
)
const qrSvg = renderQrSvg({
  text: qr.platformQr.shortUrl,
  style: { ...QrStyleSchema.parse({ margin: 2 }), margin: 4 }
})
assert.equal(hash(qrSvg), qr.platformQr.sha256)
Object.assign(qr, {
  id: 9000,
  x: 900,
  y: 330,
  w: 70,
  h: 70,
  src: '/api/public/banner-assets/repair-fixture-qr.svg',
  locked: true
})
localAssets.set(qr.src, { body: qrSvg, contentType: 'image/svg+xml' })
const project = {
  id: projectId,
  name: 'Local lifestyle lettering repair — fixture proof',
  clientId: '12345678-1234-4234-8234-123456789013',
  createdBy: 'local-retail-proof',
  updatedAt: '2026-10-27T01:00:00.000Z',
  canvasData: {
    [formatKey]: {
      bgColor: '#ffffff',
      layers: [
        {
          id: 1,
          type: 'image',
          name: 'Local lifestyle back — flat source',
          x: 0,
          y: 0,
          w: image.width,
          h: image.height,
          zIndex: 1,
          opacity: 1,
          src: sourceUrl,
          fit: 'fill',
          animIn: 'none',
          animOut: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5
        },
        qr
      ]
    }
  }
}
const savedPath = `${out}/saved-project.json`
const saveFixture = value => json('saved-project', value)
const loadFixture = () => JSON.parse(readFileSync(savedPath, 'utf8'))
saveFixture(project)
const evidence = {
  status: 'running',
  startedAt: new Date().toISOString(),
  base,
  sourcePath,
  sourceSha256: hash(sourceBytes),
  scope:
    'Actual Nuxt repair panel, native text and existing animation controls with deterministic provider and file-backed persistence.',
  limitations: [
    'White repair patch is a fixture, not live provider quality.',
    'Original flat reference wording remains pixels outside the repaired heading.',
    'No hosted save, provider inference or print acceptance.'
  ],
  outsidePixelsPreserved: outsidePixels,
  changedInsidePixels: changedInside,
  apiRequests: [],
  blockedExternalRequests: [],
  blockedWebSockets: [],
  ambientBadgeFixtureReads: 0,
  scanRequests: 0,
  liveProviderCalls: 0,
  repairFixtureCalls: 0,
  saves: 0,
  fixtureErrors: [],
  pageErrors: [],
  consoleErrors: [],
  consoleDetails: [],
  assertions: {}
}
const phase = (value) => {
  evidence.phase = value
  json('ui-evidence', evidence)
  console.log('Repair proof:', value)
}
let baseline
const browser = await chromium.launch({
  ...(process.env.BANNER_QR_CHROME
    ? { executablePath: process.env.BANNER_QR_CHROME }
    : existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? {
          executablePath:
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        }
      : {}),
  headless: true
})
const context = await browser.newContext({
  viewport: { width: 1800, height: 1400 },
  serviceWorkers: 'block'
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', error => evidence.pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') {
    evidence.consoleErrors.push(message.text())
    evidence.consoleDetails.push({
      text: message.text(),
      location: message.location(),
      phase: evidence.phase,
      operation: evidence.operation
    })
  }
})
await context.addCookies([
  { name: 'auth_status', value: 'logged_in', url: base }
])
await context.routeWebSocket('**/api/**', (socket) => {
  evidence.blockedWebSockets.push(socket.url())
  socket.onMessage(() => {})
})
await context.route('**/*', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    path = url.pathname,
    method = request.method()
  if (/\/q\//.test(path)) evidence.scanRequests++
  if (url.origin !== base) {
    evidence.blockedExternalRequests.push({
      origin: url.origin,
      path,
      resourceType: request.resourceType()
    })
    if (request.resourceType() === 'stylesheet')
      return route.fulfill({ body: '', contentType: 'text/css' })
    return route.abort('blockedbyclient')
  }
  if (localAssets.has(path)) return route.fulfill(localAssets.get(path))
  if (!path.startsWith('/api/'))
    return path.startsWith('/q/')
      ? route.abort('blockedbyclient')
      : route.continue()
  // Route the shell badge before any HTTP/provider operation. Avoid injecting
  // scripts into the deliberately script-free scoped preview frames.
  if (path === '/api/ai/anomalies/count/critical-open' && method === 'GET') {
    evidence.ambientBadgeFixtureReads++
    return route.fulfill({ json: { count: 0 } })
  }
  evidence.apiRequests.push({ method, path, query: url.search })
  if (path === '/api/notifications/stream')
    return route.fulfill({ status: 204, body: '' })
  try {
    let data
    if (path === '/api/agency/banner-studio/ai/repair-lettering') {
      const body = letteringRepairRequestSchema.parse(request.postDataJSON())
      const saved = loadFixture()
      assert.equal(body.sourceRevision, saved.updatedAt)
      assert.equal(body.projectId, projectId)
      assert.equal(body.layerId, 1)
      assert.deepEqual(body.region, region)
      assert.equal(body.sourceWording, sourceWording)
      assert.equal(body.wording, wording)
      data = {
        proposalId: '12345678-1234-4234-8234-123456789055',
        projectId,
        sourceRevision: body.sourceRevision,
        formatKey,
        layerId: 1,
        region,
        pixelRegion,
        sourceWording,
        wording,
        sourceAssetId: '12345678-1234-4234-8234-123456789056',
        sourceImageHash: hash(sourceBytes),
        backgroundAsset: {
          id: '12345678-1234-4234-8234-123456789057',
          url: repairedUrl,
          width: image.width,
          height: image.height,
          sha256: hash(repairedBytes)
        },
        evidence: {
          provider: 'deterministic-local-fixture',
          model: 'no-inference',
          requestId: null,
          cost: null
        },
        warnings: [
          'Synthetic white repair patch tests editor behavior only; no live repair quality claim.'
        ],
        verification: 'review-required'
      }
      json(`request-${++evidence.repairFixtureCalls}`, body)
      json(`response-${evidence.repairFixtureCalls}`, data)
    } else if (/\/ai(?:\/|$)/.test(path))
      throw new Error('Unexpected AI endpoint: ' + path)
    else if (path === '/api/auth/me')
      data = {
        user: {
          id: 'local-retail-proof',
          name: 'Retail fixture owner',
          email: 'retail-proof@example.invalid',
          role: 'owner',
          permissionGroups: []
        }
      }
    else if (path === '/api/agency/banner-studio/projects/' + projectId) {
      data = loadFixture()
      if (method === 'PATCH') {
        const body = request.postDataJSON()
        assert.equal(body.expectedRevision, data.updatedAt)
        data = {
          ...data,
          canvasData: body.canvasData,
          name: body.name,
          updatedAt: new Date(Date.parse(data.updatedAt) + 1000).toISOString()
        }
        saveFixture(data)
        evidence.saves++
      } else assert.equal(method, 'GET')
    } else {
      assert.equal(method, 'GET', 'Unexpected mutation: ' + path)
      if (path === '/api/agency/banner-studio/projects') data = [loadFixture()]
      else if (path === '/api/agency/banner-studio/assets')
        data = { assets: [] }
      else if (path === '/api/agency/banner-studio/effects/presets')
        data = { presets: [] }
      else if (path === '/api/notifications')
        data = { notifications: [], unreadCount: 0, hasMore: false }
      else if (/counts|unread/.test(path)) data = { count: 0, unread: 0 }
      else if (/session|status|settings|preferences/.test(path)) data = {}
      else data = []
    }
    return route.fulfill({ json: data })
  } catch (error) {
    evidence.fixtureErrors.push(error.stack)
    return route.fulfill({
      status: 500,
      json: { statusMessage: error.message }
    })
  }
})

const screenshot = name => page.screenshot({ path: `${out}/${name}.png` })
const unfocus = async () =>
  page.locator('body').evaluate((el) => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    el.focus()
  })
const saveThroughUi = async () => {
  await unfocus()
  const response = page.waitForResponse(
    r =>
      r.url() === `${base}/api/agency/banner-studio/projects/${projectId}`
      && r.request().method() === 'PATCH'
  )
  await page.keyboard.press('ControlOrMeta+s')
  assert.equal((await response).status(), 200)
  return structuredClone(loadFixture().canvasData)
}
const undo = async () => {
  await unfocus()
  await page.keyboard.press('ControlOrMeta+z')
  await page.waitForTimeout(120)
}
const redo = async () => {
  await unfocus()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await page.waitForTimeout(120)
}
const waitForLayers = count =>
  page.waitForFunction(
    n => document.querySelectorAll('[id^="lyr-"]').length === n,
    count,
    { timeout: 120000 }
  )
const assertProtected = canvas =>
  assert.deepEqual(
    canvas[formatKey].layers.find(l => l.id === 9000),
    baseline[formatKey].layers.find(l => l.id === 9000)
  )
try {
  phase('Loading actual local lifestyle source')
  await page.goto(`${base}/agency/banner-studio/${projectId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await waitForLayers(2)
  baseline = await saveThroughUi()
  json('baseline-project', loadFixture())
  await screenshot('01-before')
  phase('Selecting reviewed lettering region')
  await page
    .locator('[data-testid="banner-timeline-layer"][data-layer-id="1"]')
    .click()
  await page.getByRole('tab', { name: 'Properties', exact: true }).click()
  await page.getByTestId('lettering-repair-open').click()
  for (const [key, value] of Object.entries(region))
    await page
      .getByTestId(`lettering-repair-region-${key}`)
      .fill(String(value * 100))
  await page.getByTestId('lettering-repair-source-wording').fill(sourceWording)
  await page.getByTestId('lettering-repair-wording').fill(wording)
  await page.getByTestId('lettering-repair-region-reviewed').check()
  await screenshot('02-region')
  await page.getByTestId('lettering-repair-generate').click()
  await page
    .getByTestId('lettering-repair-background')
    .waitFor({ timeout: 60000 })
  assert.deepEqual(
    loadFixture().canvasData,
    baseline,
    'Preview does not mutate saved source'
  )
  assert.equal(
    await page.getByTestId('lettering-repair-apply').isDisabled(),
    true
  )
  await page.getByLabel('Repair text colour', { exact: true }).fill('#001d48')
  await page.getByLabel('Repair font', { exact: true }).click()
  await page.getByRole('option', { name: 'Impact', exact: true }).click()
  await screenshot('03-native-preview')
  await page.getByTestId('lettering-repair-reviewed').check()
  assert.equal(
    await page.getByTestId('lettering-repair-apply').isEnabled(),
    true
  )
  await page.getByTestId('lettering-repair-original').check()
  assert.equal(
    await page.getByTestId('lettering-repair-apply').isDisabled(),
    true,
    'Original view cannot be applied'
  )
  await page.getByTestId('lettering-repair-original').uncheck()
  await page.getByTestId('lettering-repair-reviewed').check()
  await page.getByTestId('lettering-repair-apply').click()
  await waitForLayers(3)
  const applied = await saveThroughUi()
  const heading = applied[formatKey].layers.find(l => l.type === 'text')
  assert(heading)
  assert.equal(heading.text, wording)
  assert.equal(heading.fontFamily, 'Impact')
  assert.equal(heading.letteringRepair.version, 1)
  assert.equal(heading.letteringRepair.sourceUrl, sourceUrl)
  assert.equal(heading.letteringRepair.sourceImageHash, hash(sourceBytes))
  assert.equal(heading.letteringRepair.backgroundAsset.sha256, hash(repairedBytes))
  assert.deepEqual(heading.letteringRepair.region, region)
  assert.deepEqual(applied[formatKey].layers.find(l => l.id === 1).letteringRepair, heading.letteringRepair)
  assert.equal(
    applied[formatKey].layers.find(l => l.id === 1).src,
    repairedUrl
  )
  assertProtected(applied)
  const target = page.locator(`#lyr-${heading.id}`)
  assert.equal(await target.locator('[contenteditable]').innerText(), wording)
  const fit = await target.evaluate((element) => {
    const editable = element.querySelector('[contenteditable]')
    const style = getComputedStyle(editable)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const range = document.createRange()
    range.selectNodeContents(editable)
    const text = range.getBoundingClientRect(),
      box = element.getBoundingClientRect()
    const scale = box.width / element.offsetWidth
    const metrics = context.measureText(editable.textContent.split('\n')[0])
    // DOM Range includes the font's reserved ascender space, even where no ink
    // is drawn. Check visible glyph bounds as well as the complete line boxes.
    const inkTop
      = text.y
        + (metrics.fontBoundingBoxAscent - metrics.actualBoundingBoxAscent) * scale
    return {
      text: { x: text.x, y: text.y, right: text.right, bottom: text.bottom },
      box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom },
      inkTop,
      font: context.font,
      fits:
        text.x >= box.x - 1
        && inkTop >= box.y - 1
        && text.right <= box.right + 1
        && text.bottom <= box.bottom + 1
    }
  })
  json('text-fit', fit)
  assert.equal(fit.fits, true, 'Native replacement wording fits its region')
  await screenshot('04-applied')
  await undo()
  await waitForLayers(2)
  assert.deepEqual(
    await saveThroughUi(),
    baseline,
    'Repair plus native text is one undo'
  )
  await redo()
  await waitForLayers(3)
  assert.deepEqual(await saveThroughUi(), applied)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLayers(3)
  assert.deepEqual(await saveThroughUi(), applied)
  evidence.assertions.previewReviewAtomicUndoReload = true
  phase('Animate the rebuilt native heading')
  const row = page.locator(
    `[data-testid="banner-timeline-layer"][data-layer-id="${heading.id}"]`
  )
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Add Tween', exact: true }).click()
  await page.locator(`[data-motion-layer-id="${heading.id}"]`).waitFor()
  const animated = await saveThroughUi()
  assert.equal(
    animated[formatKey].layers.find(l => l.id === heading.id).motionPathTweens
      .length,
    1
  )
  assertProtected(animated)
  await undo()
  assert.deepEqual(await saveThroughUi(), applied)
  await redo()
  assert.deepEqual(await saveThroughUi(), animated)
  await page.getByLabel('Waypoint 1 X', { exact: true }).fill('40')
  await page.getByLabel('Waypoint 1 Y', { exact: true }).fill('0')
  await unfocus()
  const configured = await saveThroughUi()
  const ruler = page.getByTestId('banner-timeline-ruler')
  const box = await ruler.boundingBox()
  const sample = async (time) => {
    await page.mouse.click(box.x + time * 120, box.y + 14)
    await page.waitForTimeout(150)
    return target.evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform)
      return { x: m.m41, y: m.m42, text: el.textContent }
    })
  }
  const start = await sample(0),
    end = await sample(2.5)
  assert(end.x > start.x, 'Actual editor tween moves native text')
  json('motion-samples', { start, end })
  await screenshot('05-animated')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLayers(3)
  assert.deepEqual(await saveThroughUi(), configured)
  assertProtected(configured)
  evidence.assertions.nativeFontAndTweenPreserved = true
  evidence.assertions.managedQrAndOutsidePixelsPreserved = true
  json('applied-project', { ...loadFixture(), canvasData: applied })
  await screenshot('06-reopened')
  assert.equal(
    hash(readFileSync(sourcePath)),
    hash(sourceBytes),
    'Reference bytes unchanged'
  )
  assert.deepEqual(evidence.fixtureErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.consoleErrors, [])
  assert.equal(evidence.scanRequests, 0)
  evidence.sourceFiles = Object.fromEntries(
    [
      'scripts/banner-studio/prove-lettering-repair.mjs',
      'app/composables/useBannerLetteringRepair.ts',
      'app/components/banner/inspector/LetteringRepair.vue',
      'app/components/banner/Artboard.client.vue',
      'shared/bannerLetteringRepair.ts'
    ].map(path => [path, hash(readFileSync(path))])
  )
  evidence.completedAt = new Date().toISOString()
  evidence.status = 'passed'
  phase('Complete')
} catch (error) {
  evidence.status = 'failed'
  evidence.failure = error.stack
  await screenshot('failure').catch(() => {})
  throw error
} finally {
  json('ui-evidence', evidence)
  await browser.close()
}
