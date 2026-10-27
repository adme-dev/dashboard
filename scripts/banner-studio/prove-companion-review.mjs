// Opt-in local proof: actual Nuxt UI + Linux native edit. Auth and save are fixtures.
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'

const execute = promisify(execFile)
const base = 'http://127.0.0.1:3137'
const out = resolve(
  'output/editable-artwork-companion',
  `ui-${new Date().toISOString().replace(/[:.]/g, '-')}`
)
mkdirSync(out, { recursive: true })
const json = (name, value) =>
  writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const { BANNER_PINNED_FONT: font } = await tsImport(
  '../../shared/bannerPinnedFont.ts',
  import.meta.url
)
const sourceFiles = [
  'scripts/banner-studio/prove-companion-review.mjs',
  'scripts/banner-studio/companion-wording.ts',
  'shared/bannerCompanion.ts',
  'shared/bannerDocumentBridge.ts',
  'shared/bannerPinnedFont.ts',
  'app/types/banner-studio.ts',
  'app/utils/banner-brand-kit.ts',
  'app/utils/banner-font-family.ts',
  'app/utils/banner-html-builder.ts',
  'server/utils/banner/htmlBuilder.ts',
  'app/components/banner/layers/Text.client.vue',
  'app/components/banner/layers/TextGlyphs.client.vue',
  'app/composables/useBannerStudio.ts',
  'app/composables/useBannerCompanion.ts',
  'app/composables/useBannerFonts.ts',
  'app/components/banner/inspector/Companion.vue',
  'app/components/banner/Inspector.client.vue',
  'app/utils/banner-pinned-font.ts',
  'workers/banner-engine/native/photocraft.ts',
  'workers/banner-engine/fonts/runtime.mjs',
  'output/editable-artwork-linux-native/fonts-v1/runtime.json'
]
const sourceHashes = Object.fromEntries(
  sourceFiles.map(path => [path, sha(readFileSync(path))])
)
json('source-hashes-before', sourceHashes)
json('runtime-manifest', JSON.parse(readFileSync(sourceFiles.at(-1), 'utf8')))
const { renderQrSvg } = await tsImport(
  '../../shared/qr/render-svg.ts',
  import.meta.url
)
const { QrStyleSchema } = await tsImport(
  '../../shared/qr/style.ts',
  import.meta.url
)
const supplied = JSON.parse(
  readFileSync('output/editable-artwork-pilot/project.json', 'utf8')
)
const key = 'custom_2480x3508',
  projectId = supplied.id
const project = structuredClone(supplied)
const heading = {
  id: 125,
  type: 'text',
  name: 'Companion heading proof',
  text: 'COME CELEBRATE OUR NEW HOME',
  fontFamily: 'Source Sans 3',
  fontWeight: 700,
  fontSize: 100,
  lineHeight: 1.2,
  color: '#071e46',
  x: 141,
  y: 650,
  w: 2233,
  h: 140,
  zIndex: 200,
  opacity: 1,
  animIn: 'none',
  animInDur: 0,
  startTime: 0,
  endTime: 5,
  animOut: 'none',
  outDur: 0
}
const wording = 'COME CELEBRATE WITH US'
const qrFixture = JSON.parse(
  readFileSync(
    'output/editable-artwork-v2/managed-qr/saved-project.json',
    'utf8'
  )
)
const qr = structuredClone(
  Object.values(qrFixture.canvasData)[0].layers.find(
    layer => layer.platformQr
  )
)
const qrSvg = renderQrSvg({
  text: qr.platformQr.shortUrl,
  style: { ...QrStyleSchema.parse({ margin: 2 }), margin: 4 }
})
assert.equal(sha(qrSvg), qr.platformQr.sha256)
Object.assign(qr, {
  id: 9000,
  x: 900,
  y: 330,
  w: 70,
  h: 70,
  src: '/api/public/banner-assets/companion-fixture-qr.svg',
  locked: true
})
project.canvasData[key].layers.push(heading, qr)
json('saved-project', project)
const load = () =>
  JSON.parse(readFileSync(`${out}/saved-project.json`, 'utf8'))
const evidence = {
  status: 'running',
  out,
  startedAt: new Date().toISOString(),
  assertions: {},
  saves: 0,
  fontResponses: [],
  pageErrors: [],
  windowErrors: [],
  fixtureErrors: [],
  blockedExternal: [],
  limits: [
    'Actual Nuxt editor and real Linux native execution; auth and persistence are local file fixtures.',
    'Only the preexisting supported Source Sans 3 Bold heading is exchanged. Original Arial headline is not converted.',
    'No hosted engine job, live provider, live save, QR scan or print acceptance.'
  ]
}
const phase = (name) => {
  evidence.phase = name
  json('evidence', evidence)
  console.log(name)
}
const browser = await chromium.launch({
  ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
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
await context.exposeBinding(
  'recordCompanionWindowError',
  (_source, message) => {
    evidence.windowErrors.push({ message, phase: evidence.phase })
  }
)
await context.addInitScript(() => {
  window.addEventListener('error', (event) => {
    if (event.message) void window.recordCompanionWindowError(event.message)
  })
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('console', (message) => {
  if (message.type() === 'error') console.error(message.text())
})
page.on('pageerror', error =>
  evidence.pageErrors.push(error.stack || error.message)
)
const fontReads = []
page.on('response', (response) => {
  if (new URL(response.url()).pathname === font.url)
    fontReads.push(
      response.body().then((bytes) => {
        evidence.fontResponses.push({
          url: response.url(),
          status: response.status(),
          sha256: sha(bytes),
          bytes: bytes.length
        })
      })
    )
})
await context.addCookies([
  { name: 'auth_status', value: 'logged_in', url: base }
])
await context.routeWebSocket('**/api/**', socket =>
  socket.onMessage(() => {})
)
await context.route('**/*', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    path = url.pathname,
    method = request.method()
  if (url.origin !== base) {
    evidence.blockedExternal.push({ origin: url.origin, path })
    return request.resourceType() === 'stylesheet'
      ? route.fulfill({ body: '', contentType: 'text/css' })
      : route.abort('blockedbyclient')
  }
  if (path.startsWith('/q/')) return route.abort('blockedbyclient')
  if (path === qr.src)
    return route.fulfill({ body: qrSvg, contentType: 'image/svg+xml' })
  if (!path.startsWith('/api/')) return route.continue() // Real platform font bytes, never stubbed.
  if (path === '/api/notifications/stream')
    return route.fulfill({ status: 204, body: '' })
  try {
    let data
    if (path === '/api/auth/me')
      data = {
        user: {
          id: 'local-companion-proof',
          name: 'Companion owner',
          email: 'companion@example.invalid',
          role: 'owner',
          permissionGroups: []
        }
      }
    else if (path === '/api/agency/banner-studio/projects/' + projectId) {
      data = load()
      if (method === 'PATCH') {
        const body = request.postDataJSON()
        assert.equal(body.expectedRevision, data.updatedAt)
        data = {
          ...data,
          canvasData: body.canvasData,
          name: body.name,
          updatedAt: new Date(Date.parse(data.updatedAt) + 1000).toISOString()
        }
        json('saved-project', data)
        evidence.saves++
      } else assert.equal(method, 'GET')
    } else {
      assert.equal(method, 'GET', 'Unexpected mutation: ' + path)
      if (path === '/api/ai/anomalies/count/critical-open') data = { count: 0 }
      else if (/\/ai(?:\/|$)/.test(path))
        throw new Error('Unexpected AI access')
      else if (path === '/api/agency/banner-studio/projects') data = [load()]
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
    evidence.fixtureErrors.push(error.message)
    return route.fulfill({ status: 500, json: { message: error.message } })
  }
})
const unfocus = () =>
  page.locator('body').evaluate((el) => {
    document.activeElement?.blur?.()
    el.focus()
  })
const save = async () => {
  await unfocus()
  const response = page.waitForResponse(
    r =>
      r.url() === `${base}/api/agency/banner-studio/projects/${projectId}`
      && r.request().method() === 'PATCH'
  )
  await page.keyboard.press('ControlOrMeta+s')
  assert.equal((await response).status(), 200)
  return structuredClone(load().canvasData)
}
const select = async (id) => {
  await page
    .locator(`[data-testid="banner-timeline-layer"][data-layer-id="${id}"]`)
    .click()
  await page.getByRole('tab', { name: 'Properties', exact: true }).click()
}
const waitLayers = () =>
  page.waitForFunction(
    () => document.querySelectorAll('[id^="lyr-"]').length === 126,
    null,
    { timeout: 180000 }
  )
const screenshot = name => page.screenshot({ path: `${out}/${name}.png` })
const download = async (name) => {
  const pending = page.waitForEvent('download')
  await page.getByTestId('companion-download').click()
  const file = await pending,
    path = `${out}/${name}.json`
  await file.saveAs(path)
  return path
}
const importProposal = async (path) => {
  await page.getByTestId('companion-file').setInputFiles(path)
  await page.getByTestId('companion-preview').waitFor()
}
try {
  phase('Loading actual Nuxt editor')
  await page.goto(`${base}/agency/banner-studio/${projectId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await Promise.race([
    waitLayers(),
    page.waitForEvent('pageerror').then((error) => {
      throw error
    })
  ])
  const baseline = await save()
  json('baseline-project', load())
  for (const original of supplied.canvasData[key].layers) {
    const actual = baseline[key].layers.find(
      layer => layer.id === original.id
    )
    for (const [property, value] of Object.entries(original))
      assert.deepEqual(
        actual[property],
        value,
        `Original layer ${original.id}: ${property}`
      )
  }
  evidence.assertions.original124LayersPreservedOnLoad = true
  await select(5)
  await page.getByTestId('companion-open').click()
  await page.getByTestId('companion-unsupported').waitFor()
  assert(await page.getByTestId('companion-download').isDisabled())
  evidence.assertions.originalArialHeadingNotConverted = true
  await select(125)
  await page.getByTestId('companion-open').click()
  const requestPath = await download('request')
  phase('Running selected wording through real Linux native edit and reopen')
  const result = await execute(
    'node',
    [
      '--import',
      'tsx',
      'scripts/banner-studio/companion-wording.ts',
      '--request',
      requestPath,
      '--text',
      wording,
      '--out',
      `${out}/native`
    ],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  writeFileSync(`${out}/native-cli.log`, result.stdout + result.stderr)
  phase('Importing real native proposal into actual review panel')
  const proposalPath = `${out}/native/proposal.json`
  await importProposal(proposalPath)
  assert.equal(
    await page.getByTestId('companion-after-wording').textContent(),
    wording
  )
  assert(await page.getByTestId('companion-apply').isDisabled())
  await page.getByTestId('companion-preview').scrollIntoViewIfNeeded()
  await screenshot('01-before-after-review')
  const cdp = await context.newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '[data-testid="companion-after"]'
  })
  evidence.renderedFonts = (
    await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  ).fonts
  assert(
    evidence.renderedFonts.some(
      face =>
        face.postScriptName === font.postscriptName
        && face.isCustomFont
        && face.glyphCount > 0
    )
  )
  assert(
    evidence.renderedFonts.every(
      face => face.postScriptName === font.postscriptName
    )
  )
  await page.getByTestId('companion-reviewed').check()
  await page.getByTestId('companion-apply').click()
  await page.getByTestId('companion-applied').waitFor()
  const { nodeId: canvasNode } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#lyr-125 [contenteditable]'
  })
  evidence.canvasRenderedFonts = (
    await cdp.send('CSS.getPlatformFontsForNode', { nodeId: canvasNode })
  ).fonts
  assert(
    evidence.canvasRenderedFonts.some(
      face =>
        face.postScriptName === font.postscriptName
        && face.isCustomFont
        && face.glyphCount > 0
    )
  )
  assert(
    evidence.canvasRenderedFonts.every(
      face => face.postScriptName === font.postscriptName
    )
  )
  const applied = await save(),
    expected = structuredClone(baseline)
  const changed = applied[key].layers.find(layer => layer.id === 125)
  Object.assign(
    expected[key].layers.find(layer => layer.id === 125),
    { text: wording, companionEdit: changed.companionEdit }
  )
  assert.deepEqual(applied, expected)
  assert.equal(changed.companionEdit.engineVerified, false)
  evidence.assertions.onlySelectedWordingAndDescriptiveProvenanceChanged = true
  evidence.assertions.managedQrUnchanged = true
  await screenshot('02-applied-canvas')
  await unfocus()
  await page.keyboard.press('ControlOrMeta+z')
  assert.deepEqual(await save(), baseline)
  await unfocus()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  assert.deepEqual(await save(), applied)
  evidence.assertions.oneUndoRedoExact = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitLayers()
  assert.deepEqual(await save(), applied)
  evidence.assertions.fixtureSaveReopenExact = true
  await select(125)
  await page.getByTestId('companion-open').click()
  phase(
    'Checking repeated export with provenance and stale request invalidation'
  )
  const secondRequest = await download('repeat-request')
  const repeated = await execute(
    'node',
    [
      '--import',
      'tsx',
      'scripts/banner-studio/companion-wording.ts',
      '--request',
      secondRequest,
      '--text',
      'DISCOVER OUR NEW HOME',
      '--out',
      `${out}/repeat-native`
    ],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  writeFileSync(
    `${out}/repeat-native-cli.log`,
    repeated.stdout + repeated.stderr
  )
  await importProposal(`${out}/repeat-native/proposal.json`)
  evidence.assertions.repeatedNativeRoundtripWithProvenance = true
  await screenshot('03-reopened-repeat-review')
  await page.getByTestId('companion-close').click()
  await page.getByTestId('companion-open').click()
  assert(await page.getByTestId('companion-file').isDisabled())
  await download('stale-request')
  await select(5)
  await select(125)
  await page.getByTestId('companion-open').click()
  assert(await page.getByTestId('companion-file').isDisabled())
  assert.equal(await page.getByTestId('companion-preview').count(), 0)
  evidence.assertions.closeAndReselectionInvalidate = true
  assert.deepEqual(await save(), applied)
  await Promise.all(fontReads)
  assert(evidence.fontResponses.length > 0)
  assert(
    evidence.fontResponses.every(
      response =>
        response.sha256 === font.sha256
        && response.bytes === font.byteLength
        && response.status === 200
    )
  )
  evidence.assertions.platformFontServedWithoutInterception = true
  assert.deepEqual(evidence.fixtureErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.windowErrors, [])
  const afterHashes = Object.fromEntries(
    sourceFiles.map(path => [path, sha(readFileSync(path))])
  )
  json('source-hashes-after', afterHashes)
  assert.deepEqual(afterHashes, sourceHashes, 'Source changed during proof')
  evidence.status = 'passed'
  phase('All local companion review checks passed')
} catch (error) {
  evidence.status = 'failed'
  evidence.error = error.stack
  await screenshot('failure').catch(() => {})
  throw error
} finally {
  json('evidence', evidence)
  await browser.close()
  console.log(`Evidence: ${out}`)
}
