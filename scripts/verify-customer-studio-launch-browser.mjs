import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Actual Nuxt page and CSP; synthetic customer/API/central-editor responses only.
// Start local dev with the staging browser/editor gates and exact origins in the
// launch runbook. Never use customer credentials or a deployed origin here.
const origin = process.env.CUSTOMER_LAUNCH_BROWSER_ORIGIN ?? 'http://127.0.0.1:3044'
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const editor = 'https://editor.example.test'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let available = true, failed = false, writes = 0, posts = 0, stale = false
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/customer/dashboard')) {
      return route.fulfill(stale
        ? { status: 503, json: { statusCode: 503 } }
        : { json: {
            businessName: 'Customer Flowers', businessType: 'Florist', timezone: 'Australia/Melbourne',
            stage: 5, state: 'verification-pending', canCreate: false, canRetry: false, canOpenStudio: available
          } })
    }
    if (path.endsWith('/customer/editor')) {
      writes++
      assert.equal(route.request().method(), 'POST')
      assert.deepEqual(route.request().postDataJSON(), {})
      return route.fulfill(failed
        ? { status: 409, json: { statusCode: 409, message: 'private storage detail' } }
        : { json: {
            token: 't'.repeat(64), editorOrigin: editor, expiresAt: new Date(Date.now() + 60000).toISOString()
          } })
    }
    return route.fulfill({ json: {} })
  })
  await page.route(`${editor}/**`, async (route) => {
    posts++
    const request = route.request()
    assert.equal(request.url(), `${editor}/customer/launch`)
    assert.equal(request.method(), 'POST')
    assert.equal(request.headers().origin, origin)
    assert.deepEqual([...new URLSearchParams(request.postData()).entries()], [['ticket', 't'.repeat(64)]])
    assert(!request.url().includes('tttt'))
    return route.fulfill({ contentType: 'text/html', body: '<h1>Studio transport received</h1>' })
  })
  const response = await page.goto(`${origin}/studio/dashboard`)
  assert(response.headers()['content-security-policy'].includes(editor), 'Native editor missing from actual CSP')
  await page.getByRole('heading', { name: 'Continue editing your website' }).waitFor()
  assert.equal(writes, 0)
  await page.getByText('Not published', { exact: true }).waitFor()
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.screenshot({ path: '/private/tmp/customer-studio-launch-mobile.png' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: '/private/tmp/customer-studio-launch-desktop.png' })
  failed = true
  await page.getByRole('button', { name: 'Open Studio', exact: true }).click()
  await page.getByText('We could not open Studio.', { exact: false }).waitFor()
  assert(!(await page.locator('body').innerText()).includes('private storage detail'))
  assert.equal(posts, 0)
  stale = true
  await page.getByRole('button', { name: 'Refresh status' }).click()
  await page.getByText('Status could not refresh', { exact: true }).waitFor()
  const staleAction = page.getByRole('button', { name: 'Open Studio', exact: true })
  assert(await staleAction.count() === 0 || await staleAction.isDisabled())
  stale = false
  available = false
  await page.getByRole('button', { name: 'Refresh status' }).click()
  await page.getByRole('heading', { name: 'Awaiting verification' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Open Studio', exact: true }).count(), 0)
  available = true
  failed = false
  await page.getByRole('button', { name: 'Refresh status' }).click()
  await page.getByRole('button', { name: 'Open Studio', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'Studio transport received' }).waitFor()
  assert.equal(writes, 2)
  assert.equal(posts, 1)
  assert.equal(page.url(), `${editor}/customer/launch`)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ widths: [1280, 390, 320], actualCsp: true, keyboardPost: true, redactedFailure: true, staleDisabled: true,
    unavailableHidden: true, writes, posts, mode: 'real Nuxt UI and Chrome with synthetic API/editor transport; not hosted acceptance' }))
} finally { await browser.close() }
