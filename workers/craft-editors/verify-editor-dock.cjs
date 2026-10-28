#!/usr/bin/env node
// Actual browser checks against an isolated fixture; no editor documents are touched.
const { chromium } = require('playwright')
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const ids = ['photoflow', 'vectorflow', 'effectflow', 'filmflow', 'soundflow', 'figflow']
const names = ['PhotoFlow', 'VectorFlow', 'EffectFlow', 'FilmFlow', 'SoundFlow', 'FigFlow']
const apps = ids.map((id, i) => ({ id, name: names[i], url: `/${id}/` }))
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#24262b;color:white}canvas{position:fixed;inset:0;width:100%;height:100%}</style><link rel="stylesheet" href="/editor-dock.css"></head><body><canvas tabindex="0" aria-label="Editor canvas"></canvas><script>window.fixtureLoads=Number(sessionStorage.getItem(location.pathname)||0)+1;sessionStorage.setItem(location.pathname,window.fixtureLoads);window.unsavedFixture='keep this work';document.querySelector('canvas').focus();</script><script type="module" src="/editor-dock.js"></script></body></html>`
;(async () => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture')
    if (url.pathname === '/editor-apps.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ apps: url.searchParams.has('bad') ? [...apps.slice(0, 5), { id: 'figflow', url: 'https://evil.invalid/' }] : apps }))
    } else if (/^\/images\/(photoflow|vectorflow|effectflow|filmflow|soundflow|figflow)\.png$/.test(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(await fs.readFile(path.join(__dirname, 'assets', path.basename(url.pathname))))
    } else if (['/editor-dock.css', '/editor-dock.js'].includes(url.pathname)) {
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(await fs.readFile(path.join(__dirname, 'static', url.pathname.slice(1))))
    } else { res.writeHead(200, { 'Content-Type': 'text/html' }).end(html) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  let browser
  const result = {}
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
    const photo = await context.newPage()
    const errors = []
    photo.on('pageerror', e => errors.push(e.message))
    await photo.goto(origin + '/photoflow/')
    const dock = photo.locator('#xf-editor-dock')
    await dock.waitFor()
    assert.equal(await dock.getAttribute('data-open'), 'false')
    assert.equal(await photo.locator('.xf-dock-panel').isVisible(), false)
    assert.equal(await photo.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight - 30).tagName), 'CANVAS')
    await photo.locator('.xf-dock-handle').hover()
    await photo.waitForFunction(() => document.getElementById('xf-editor-dock').dataset.open === 'true')
    assert.equal(await photo.locator('.xf-dock-app').count(), 6)
    await photo.waitForFunction(() => [...document.querySelectorAll('.xf-dock-thumbnail')].length === 6 && [...document.querySelectorAll('.xf-dock-thumbnail')].every(img => img.complete && img.naturalWidth > 0))
    assert.equal(await photo.locator('[data-xf-install]').count(), 1)
    assert.equal(await photo.locator('[aria-current="page"]').getAttribute('data-app'), 'photoflow')
    const popup = context.waitForEvent('page')
    await photo.locator('[data-app="vectorflow"]').click()
    const vector = await popup
    await vector.waitForURL(origin + '/vectorflow/')
    await vector.locator('#xf-editor-dock').waitFor()
    await vector.evaluate(() => { window.unsavedFixture = 'vector work' })
    const initialLoads = await vector.evaluate(() => window.fixtureLoads)
    await photo.bringToFront()
    await photo.locator('.xf-dock-handle').hover()
    await photo.locator('[data-app="vectorflow"]').click()
    await new Promise(resolve => setTimeout(resolve, 250))
    assert.equal(context.pages().length, 2, 'switching reuses the named app tab')
    assert.equal(await vector.evaluate(() => window.unsavedFixture), 'vector work', 'existing editor state survives')
    assert.equal(await vector.evaluate(() => window.fixtureLoads), initialLoads, 'the existing tab was not reloaded')
    assert.equal(await photo.evaluate(() => window.unsavedFixture), 'keep this work')
    await photo.bringToFront()
    await photo.locator('.xf-dock-handle').hover()
    await photo.waitForFunction(() => document.querySelector('[data-app="vectorflow"]').classList.contains('xf-dock-running'))
    await photo.locator('[data-app="photoflow"]').click()
    assert.equal(await photo.evaluate(() => window.fixtureLoads), 1, 'current app never reloads')
    await dock.focus()
    await photo.keyboard.press('Tab')
    assert.equal(await dock.getAttribute('data-open'), 'true')
    await photo.keyboard.press('Escape')
    assert.equal(await dock.getAttribute('data-open'), 'false')
    await photo.emulateMedia({ reducedMotion: 'reduce' })
    await photo.locator('.xf-dock-handle').hover()
    assert.equal(await photo.locator('.xf-dock-panel').evaluate(el => getComputedStyle(el).transitionDuration), '0s')
    for (const width of [390, 320]) {
      await photo.setViewportSize({ width, height: 800 })
      await photo.locator('.xf-dock-handle').click()
      // The touch toggle can be pinned or closed from the preceding hover; explicitly focus.
      await dock.focus()
      const bounds = await photo.locator('.xf-dock-panel').boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'dock fits mobile width')
    }
    const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } })
    const tp = await touch.newPage()
    await tp.goto(origin + '/photoflow/')
    await tp.locator('.xf-dock-handle').tap()
    assert.equal(await tp.locator('#xf-editor-dock').getAttribute('data-open'), 'true')
    await tp.locator('.xf-dock-handle').tap()
    assert.equal(await tp.locator('#xf-editor-dock').getAttribute('data-open'), 'false')
    const noPresence = await browser.newContext()
    await noPresence.addInitScript(() => { window.BroadcastChannel = undefined })
    const np = await noPresence.newPage()
    await np.goto(origin + '/soundflow/')
    await np.locator('#xf-editor-dock').waitFor()
    assert.equal(await np.locator('[data-app="soundflow"]').getAttribute('aria-current'), 'page')
    await photo.setViewportSize({ width: 1200, height: 800 })
    await photo.locator('.xf-dock-handle').hover()
    await photo.evaluate(() => { window.open = () => null })
    const fallbackPage = context.waitForEvent('page')
    await photo.locator('[data-app="vectorflow"]').click()
    const fallback = await fallbackPage
    await fallback.waitForURL(origin + '/vectorflow/')
    assert.equal(await vector.evaluate(() => window.unsavedFixture), 'vector work', 'blocked WindowProxy fallback never reloads the old editor')
    assert.equal(await fallback.evaluate(() => window.opener), null, 'fresh fallback tab has no opener')
    const blocked = await browser.newContext()
    const bp = await blocked.newPage()
    await bp.route('**/editor-apps.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apps: [...apps.slice(0, 5), { id: 'figflow', url: 'https://evil.invalid/' }] }) }))
    await bp.goto(origin + '/photoflow/')
    await bp.waitForLoadState('networkidle')
    assert.equal(await bp.locator('#xf-editor-dock').count(), 0, 'invalid external configuration fails closed')
    assert.deepEqual(errors, [])
    Object.assign(result, { thumbnailsLoaded: true, hover: true, namedTabReuse: true, unsavedStatePreserved: true, currentAppNoReload: true, livePresence: true, keyboardAndEscape: true, reducedMotion: true, mobileWidths: [390, 320], touchToggle: true, noBroadcastChannel: true, blockedWindowFallbackPreservesWork: true, externalConfigRejected: true, browserErrors: errors })
    if (process.argv[2]) {
      await photo.bringToFront()
      await photo.emulateMedia({ reducedMotion: 'no-preference' })
      await photo.locator('.xf-dock-handle').hover()
      await photo.locator('[data-app="vectorflow"]').hover()
      await photo.screenshot({ path: process.argv[2] + '.png' })
      await photo.evaluate(() => { document.body.style.background = 'linear-gradient(120deg,#f6eee3,#9ab7ce)' ; document.documentElement.style.background = '#e1e8ed' })
      await photo.screenshot({ path: process.argv[2] + '.light.png' })
      await fs.writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n')
    }
    console.log(JSON.stringify(result))
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
