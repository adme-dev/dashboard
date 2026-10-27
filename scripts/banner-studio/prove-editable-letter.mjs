// Local-only fixture-backed UI proof. Never use these test identities against a hosted app.
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const out = resolve('output/editable-artwork-pilot')
const project = JSON.parse(readFileSync(out + '/project.json', 'utf8'))
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } })
const consoleLogs = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleLogs.push(m.text())
})
page.on('requestfailed', r => consoleLogs.push(r.url() + ': ' + r.failure()?.errorText))
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.context().addCookies([{ name: 'auth_status', value: 'logged_in', url: 'http://localhost:3137' }])
await page.route('**/api/**', async (route) => {
  const u = new URL(route.request().url()), p = u.pathname
  let data = []
  if (p === '/api/auth/me')data = { user: { id: 'local-pilot', name: 'Local fixture session', email: 'pilot@example.invalid', role: 'owner', permissionGroups: [] } }
  else if (p === '/api/agency/banner-studio/projects/' + project.id) {
    if (route.request().method() === 'PATCH') {
      Object.assign(project, route.request().postDataJSON())
      writeFileSync(out + '/ui-saved-project.json', JSON.stringify(project, null, 2))
    }
    data = project
  } else if (p === '/api/agency/banner-studio/ai/copy-suggest')data = { suggestions: [{ text: 'A NEW HOME.\nA WARM WELCOME.', tone: 'inviting', charCount: 27 }], evidence: { provider: 'test-fixture', model: 'not-live-inference' } }
  else if (p === '/api/agency/banner-studio/effects/presets')data = { presets: [] }
  else if (p === '/api/notifications')data = { notifications: [], unreadCount: 0, hasMore: false }
  else if (/counts|unread/.test(p))data = { count: 0, unread: 0 }
  else if (/session|status|settings|preferences/.test(p))data = {}
  await route.fulfill({ json: data })
})
try {
  await page.goto('http://localhost:3137/agency/banner-studio/' + project.id, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.locator('#lyr-5').waitFor({ timeout: 120000 })
  await page.locator('#lyr-5').click()
  await page.getByRole('button', { name: 'AI Suggest Copy', exact: true }).click()
  await page.getByLabel('What should change?').fill('Make it warmer and welcoming')
  await page.getByRole('button', { name: 'Generate alternatives', exact: true }).click()
  await page.getByRole('button', { name: /A NEW HOME/ }).click()
  await page.screenshot({ path: out + '/local-editor-preview.png' })
  await page.getByRole('button', { name: 'Apply heading', exact: true }).click()
  await page.screenshot({ path: out + '/local-editor-applied.png' })
  if (!(await page.locator('#lyr-5').innerText()).includes('A NEW HOME.')) throw new Error('Heading not applied')
  await page.keyboard.press('Meta+z')
  if (!(await page.locator('#lyr-5').innerText()).includes('WE’VE MOVED.')) throw new Error('Undo did not restore heading')
  await page.screenshot({ path: out + '/local-editor-undone.png' })
  await page.keyboard.press('Meta+Shift+z')
  await page.keyboard.press('Meta+s')
  await page.waitForTimeout(1000)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('#lyr-5').waitFor({ timeout: 120000 })
  if (!(await page.locator('#lyr-5').innerText()).includes('A NEW HOME.')) throw new Error('Reload lost changed heading')
  const saved = JSON.parse(readFileSync(out + '/ui-saved-project.json', 'utf8'))
  if (!saved.canvasData.custom_2480x3508.layers.find(l => l.id === 5).text.includes('A NEW HOME.')) throw new Error('PATCH did not persist changed heading')
  writeFileSync(out + '/ui-evidence.json', JSON.stringify({ preview: true, apply: true, undo: true, redo: true, savedChangedHeading: true, reopenedChangedHeading: true, api: 'local fixtures, not hosted database', copy: 'deterministic response, not live inference' }, null, 2))
  await page.screenshot({ path: out + '/local-editor-reopened.png' })

  writeFileSync(out + '/ui-initial.txt', await page.locator('body').innerText())
  writeFileSync(out + '/ui-errors.json', JSON.stringify({ errors, consoleLogs }, null, 2))
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  console.log('UI preview/apply/undo/save/reload PASS. Fixture APIs only. No page errors.')
} catch (e) {
  await page.screenshot({ path: out + '/local-editor-failure.png' })
  writeFileSync(out + '/ui-failure.txt', await page.locator('body').innerText())
  throw e
} finally {
  await browser.close()
}
