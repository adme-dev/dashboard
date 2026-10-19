import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// Run against a local Nuxt dev server. All account and API data are synthetic.
// No customer credentials, grants, email or publication are used.
const origin = process.env.CUSTOMER_PLAN_BROWSER_ORIGIN ?? 'http://127.0.0.1:3044'
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const target = { workspaceId: '10000000-0000-4000-8000-000000000001', workspaceName: 'Customer Flowers', siteId: '10000000-0000-4000-8000-000000000002', siteName: 'Flowers website', entitlementId: '10000000-0000-4000-8000-000000000003', planKey: 'customer_preview_v1', status: 'trial', effectiveUntil: '2026-10-12T12:00:00Z', eligible: true, limits: { pagesPerSiteLimit: 5, storageBytesLimit: 104857600, domainLimit: 0, aiOperationLimit: 0, buildLimit: 10, trafficBytesLimit: 1073741824 } }
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  let writes = 0
  page.on('pageerror', e => errors.push(e.message))
  await page.context().addCookies([{ name: 'auth_status', value: 'logged_in', url: origin }])
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/_nuxt_icon/'))
      return route.continue()
    if (path === '/api/auth/me')
      return route.fulfill({ json: { user: { id: '10000000-0000-4000-8000-000000000009', name: 'Test operator', email: 'operator@example.test', role: 'owner', custom_role_id: null, permissionGroups: ['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_SUBSCRIPTIONS'], is_active: true } } })
    if (path === '/api/agency/page-studio/customer-plans') {
      if (route.request().method() === 'GET')
        return route.fulfill({ json: { targets: [target], nextCursor: null } })
      writes++
      const body = route.request().postDataJSON()
      assert.equal(body.workspaceId, target.workspaceId)
      assert.equal(body.expectedEntitlementId, target.entitlementId)
      assert(!body.actorId && !body.tenantId)
      return route.fulfill({ json: { entitlement: { id: '10000000-0000-4000-8000-000000000004', siteId: target.siteId, workspaceId: target.workspaceId, planKey: body.planKey, status: 'active' }, replayed: false } })
    }
    if (path === '/api/agency/page-studio/subscriptions')
      return route.fulfill({ json: { subscriptions: [] } })
    if (path.includes('workspaces'))
      return route.fulfill({ json: { workspaces: [] } })
    if (path.includes('notifications'))
      return route.fulfill({ json: { notifications: [], unreadCount: 0 } })
    if (path.includes('departments') || path.includes('clients') || path.includes('boards'))
      return route.fulfill({ json: [] })
    return route.fulfill({ json: { items: [], unreadCount: 0 } })
  })
  await page.goto(origin + '/agency/page-studio/subscriptions')
  await page.getByRole('link', { name: 'Customer plans', exact: true }).click()
  await page.getByRole('button', { name: 'Set publishing plan', exact: true }).waitFor({ timeout: 45000 })
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `page overflow ${width}`)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: '/tmp/native-plan-list.png' })
  await page.getByRole('button', { name: 'Set publishing plan', exact: true }).click()
  await page.getByLabel('Plan reference', { exact: true }).fill('studio_business')
  await page.getByLabel('Approval reason', { exact: true }).fill('Approved publishing agreement')
  await page.getByRole('dialog').getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Review plan', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Grant publishing access', exact: true }).waitFor()
  assert.equal(writes, 0)
  await page.screenshot({ path: '/tmp/native-plan-review.png' })
  await page.setViewportSize({ width: 320, height: 900 })
  assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'modal overflow')
  await page.screenshot({ path: '/tmp/native-plan-mobile.png' })
  await page.getByRole('button', { name: 'Grant publishing access', exact: true }).click()
  await page.getByText('Publishing access granted', { exact: true }).waitFor()
  assert.equal(writes, 1)
  console.log(JSON.stringify({ widths: [1280, 390, 320], writes, errors, mode: 'real Nuxt UI + Chrome, synthetic operator/API only' }))
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
