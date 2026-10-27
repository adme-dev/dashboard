import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:3137'
const output = 'output/editable-artwork-online-engine/creative-ui'
mkdirSync(output, { recursive: true })
const evidence = { status: 'running', errors: [], mutations: [], routes: [], screenshots: [], restrictedRole: false }
const browser = await chromium.launch({ headless: true, ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
async function createContext(role = 'owner') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' })
  context.setDefaultTimeout(30000)
  await context.addCookies([{ name: 'auth_status', value: 'logged_in', url: base }])
  await context.routeWebSocket('**/api/**', socket => socket.onMessage(() => {}))
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== base) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (request.method() !== 'GET') {
      evidence.mutations.push(url.pathname)
      return route.fulfill({ status: 403, json: {} })
    }
    let data = []
    if (url.pathname === '/api/auth/me') data = { user: { id: 'creative-local-fixture', name: 'Creative fixture', email: 'creative@example.invalid', role, permissionGroups: [] } }
    else if (url.pathname === '/api/notifications/stream') return route.fulfill({ status: 204, body: '' })
    else if (url.pathname === '/api/notifications') data = { notifications: [], unreadCount: 0, hasMore: false }
    else if (url.pathname === '/api/agency/audio/projects') data = { projects: [] }
    else if (/\/assets$/.test(url.pathname)) data = { assets: [] }
    else if (/count|unread/.test(url.pathname)) data = { count: 0, unread: 0 }
    else if (/status|settings|preferences/.test(url.pathname)) data = {}
    return route.fulfill({ json: data })
  })
  return context
}
try {
  const context = await createContext()
  const page = await context.newPage()
  page.on('pageerror', error => evidence.errors.push(error.message))
  await page.goto(`${base}/agency/creative`)
  await page.getByTestId('creative-studio-home').waitFor()
  await page.getByRole('heading', { name: 'Your next campaign starts here.' }).waitFor()
  const destinations = [
    ['Open Banner Studio', '/agency/banner-studio'],
    ['Open Video Studio', '/agency/audio/projects?mediaType=av'],
    ['Open Audio Studio', '/agency/audio']
  ]
  for (const [label, path] of destinations) {
    assert.equal(await page.getByRole('link', { name: label, exact: true }).getAttribute('href'), path)
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => useNuxtApp().$colorMode.preference = value, theme)
    await page.waitForTimeout(150)
    const path = `${output}/${theme}-desktop.png`
    await page.screenshot({ path, fullPage: true })
    evidence.screenshots.push(path)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('creative-studio-home').getByRole('link', { name: 'Upload banners', exact: true }).scrollIntoViewIfNeeded()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  assert.equal(overflow, false)
  await page.screenshot({ path: `${output}/mobile-resources.png` })
  evidence.screenshots.push(`${output}/mobile-resources.png`)
  await page.setViewportSize({ width: 1440, height: 1050 })
  for (const [label, path] of destinations) {
    await page.goto(`${base}/agency/creative`)
    await page.getByRole('link', { name: label, exact: true }).click()
    await page.waitForURL(`${base}${path}`)
    await page.waitForTimeout(500)
    evidence.routes.push(path)
  }
  const restricted = await createContext('finance')
  const denied = await restricted.newPage()
  await denied.goto(`${base}/agency/creative`)
  await denied.waitForURL(`${base}/agency?error=no-creative-access`)
  evidence.restrictedRole = true
  await page.goto(`${base}/features/creative-studio`)
  await page.getByRole('heading', { name: 'Creative Studio', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Local Preview Status', exact: true }).waitFor()
  evidence.routes.push('/features/creative-studio')
  assert.deepEqual(evidence.mutations, [])
  assert.deepEqual(evidence.errors, [])
  evidence.status = 'passed'
  evidence.sourceSha256 = createHash('sha256').update(readFileSync('app/pages/agency/creative.vue')).digest('hex')
} catch (error) {
  evidence.status = 'failed'
  evidence.failure = error.stack
  throw error
} finally {
  writeFileSync(`${output}/evidence.json`, JSON.stringify(evidence, null, 2))
  await browser.close()
}
