// Actual Nuxt UI with explicit local auth/job/provider/storage fixtures.
// Server SQL semantics are independently exercised by prove-dissection-jobs.mjs.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const base = 'http://127.0.0.1:3137'
const out = resolve('output/editable-artwork-async-jobs/ui')
mkdirSync(out, { recursive: true })
const json = (name, data) => writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2))
const projectId = 'b1111111-1111-4111-8111-111111111111'
const jobId = 'b2222222-2222-4222-8222-222222222222'
const clientId = 'b3333333-3333-4333-8333-333333333333'
const revision = '2026-10-27T00:00:00.000Z'
const originalLayers = [
  { id: 1, name: 'Original panel', type: 'rect', x: 0, y: 0, w: 300, h: 250, zIndex: 0, fillColor: '#071e46' },
  { id: 2, name: 'Original native heading', type: 'text', text: 'Welcome home', x: 20, y: 70, w: 260, h: 70, zIndex: 1, fontFamily: 'Arial', fontSize: 30, color: '#ffffff' }
].map(layer => ({ opacity: 1, animIn: 'none', animOut: 'none', startTime: 0, endTime: 5, animInDur: 0, ...layer }))
let project = { id: projectId, name: 'Reconstruction jobs — local UI fixture', clientId, createdBy: 'fixture-owner', updatedAt: revision, canvasData: { mrec: { layers: originalLayers, bgColor: '#071e46' } } }
let job = null
const evidence = { status: 'running', startedAt: new Date().toISOString(), fixtureBoundary: 'Actual Nuxt editor; intercepted synthetic auth, dissection/provider and file-backed project APIs. No hosted or live inference claim.', apiRequests: [], assertions: {}, consoleErrors: [], pageErrors: [], fixtureErrors: [], externalRequests: [], uploads: 0, retries: 0, cancellations: 0, imports: 0, saves: 0, liveProviderCalls: 0 }
const persist = () => {
  json('saved-project', project)
  json('saved-job', job)
  json('evidence', evidence)
}
const step = (name) => {
  evidence.phase = name
  persist()
  console.log(name)
}
const snapshot = status => ({ jobId, status, execution: { attemptId: `fixture-attempt-${evidence.retries + 1}`, attempt: evidence.retries + 1, maxAttempts: 3, stage: status, startedAt: revision, updatedAt: revision }, progress: { stage: status, completed: 0, total: 2 } })
const completed = () => ({ ...snapshot('complete'), progress: { stage: 'complete', completed: 1, total: 1 }, resultId: 'a'.repeat(64), version: '2.0', brand: 'Local fixture', campaign_type: 'proof', banner_size: '300x250', processed_at: revision, warnings: [], tokens: { heading: { id: 'heading', type: 'text', label: 'Heading', value: 'Native fixture result', editable: true, required: true, affects_layers: ['heading'] } }, layers: [{ id: 'heading', type: 'live_text', description: 'Native fixture heading', extraction_status: 'extracted', editable: true, export_as_png: false, z_index: 1, region: { x: 0.05, y: 0.2, width: 0.9, height: 0.4 }, token_bindings: ['heading'] }] })
let holdPoll = false
let pendingPoll
let importReceipt
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1680, height: 1100 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', error => evidence.pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') evidence.consoleErrors.push(message.text())
})
await context.addCookies([{ name: 'auth_status', value: 'logged_in', url: base }])
await context.routeWebSocket('**/api/**', (socket) => {
  socket.onMessage(() => {})
})
await context.route('**/*', async (route) => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
  if (url.origin !== base) {
    evidence.externalRequests.push(url.href)
    return route.abort('blockedbyclient')
  }
  if (!path.startsWith('/api/')) return route.continue()
  evidence.apiRequests.push({ path, method })
  try {
    let data
    if (path === '/api/auth/me') data = { user: { id: 'fixture-owner', name: 'Local job proof', email: 'jobs@example.invalid', role: 'owner', permissionGroups: [] } }
    else if (path === `/api/agency/banner-studio/projects/${projectId}`) {
      if (method === 'PATCH') {
        const body = request.postDataJSON()
        assert.equal(body.expectedRevision, project.updatedAt, 'UI must save with latest receipt revision')
        project = { ...project, canvasData: body.canvasData, updatedAt: new Date(Date.parse(project.updatedAt) + 1000).toISOString() }
        evidence.saves++
      } else assert.equal(method, 'GET')
      data = project
    } else if (path === '/api/agency/banner-studio/dissect/history') data = { dissections: job ? [{ jobId, status: job.status, brand: 'Local fixture', createdAt: revision, execution: job.execution }] : [] }
    else if (path === '/api/agency/banner-studio/dissect/upload') {
      assert.equal(method, 'POST')
      evidence.uploads++
      job = snapshot('analyzing')
      data = job
    } else if (path === `/api/agency/banner-studio/dissect/${jobId}`) {
      if (holdPoll) {
        holdPoll = false
        pendingPoll = route
        return
      }
      data = job
    } else if (path === `/api/agency/banner-studio/dissect/${jobId}/cancel`) {
      assert.equal(method, 'POST')
      evidence.cancellations++
      job = snapshot('cancelled')
      data = job
    } else if (path === '/api/agency/banner-studio/dissect/process') {
      assert.deepEqual(request.postDataJSON(), { jobId, retry: true, expectedAttemptId: job.execution.attemptId })
      evidence.retries++
      job = snapshot('queued')
      data = job
    } else if (path === `/api/agency/banner-studio/dissect/${jobId}/import`) {
      const body = request.postDataJSON()
      assert.equal(body.projectId, projectId)
      assert.equal(body.formatKey, 'mrec')
      assert.equal(body.expectedResultId, 'a'.repeat(64))
      if (!importReceipt) {
        assert.equal(body.expectedRevision, project.updatedAt)
        assert.equal(job.status, 'complete')
        const layers = [{ ...originalLayers[1], id: 1, text: 'Native fixture result', name: 'Imported native heading' }]
        project = { ...project, canvasData: { ...project.canvasData, mrec: { layers } }, updatedAt: new Date(Date.parse(project.updatedAt) + 1000).toISOString() }
        importReceipt = { projectId, formatKey: 'mrec', layers, revision: project.updatedAt, receiptId: 'b4444444-4444-4444-8444-444444444444' }
        evidence.imports++
        job = { ...job, status: 'imported', importReceipt
        }
      }
      data = importReceipt
    } else {
      assert.equal(method, 'GET', `Unexpected mutation: ${path}`)
      if (path.includes('/ai/') && path !== '/api/ai/anomalies/count/critical-open') throw new Error('Unexpected provider operation')
      if (path === '/api/notifications/stream') return route.fulfill({ status: 204, body: '' })
      if (path === '/api/agency/banner-studio/assets') data = { assets: [] }
      else if (path === '/api/agency/banner-studio/effects/presets') data = { presets: [] }
      else if (path === '/api/notifications') data = { notifications: [], unreadCount: 0, hasMore: false }
      else if (/counts|count|unread/.test(path)) data = { count: 0, unread: 0 }
      else if (/session|status|settings|preferences/.test(path)) data = {}
      else data = []
    }
    persist()
    return route.fulfill({ json: structuredClone(data) })
  } catch (error) {
    evidence.fixtureErrors.push(error.stack)
    persist()
    return route.fulfill({ status: 500, json: { statusMessage: error.message } })
  }
})
const waitLayers = count => page.waitForFunction(value => document.querySelectorAll('[id^="lyr-"]').length === value, count)
const openDissector = async () => {
  await page.getByRole('button', { name: 'Actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Dissect artwork', exact: true }).click()
  await page.getByText('Banner Dissector', { exact: true }).waitFor()
}
const save = async () => {
  const response = page.waitForResponse(r => r.url() === `${base}/api/agency/banner-studio/projects/${projectId}` && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Save banner', exact: true }).click()
  assert.equal((await response).status(), 200)
}
const screenshot = name => page.screenshot({ path: `${out}/${name}.png` })
try {
  step('Loading actual Nuxt editor')
  await page.goto(`${base}/agency/banner-studio/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByRole('button', { name: 'Save banner', exact: true }).waitFor({ timeout: 120000 })
  await waitLayers(2)
  await save()
  const baseline = structuredClone(project.canvasData)
  await openDissector()
  json('baseline', baseline)
  step('Uploading source into the fixture job boundary')
  const source = resolve('output/editable-artwork-reference-pack/concepts/concept-2-local-lifestyle-back-A4.jpg')
  evidence.sourceSha256 = createHash('sha256').update(readFileSync(source)).digest('hex')
  await page.locator('input[type=file]').setInputFiles(source)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel job', exact: true }).waitFor()
  await screenshot('01-running')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await openDissector()
  await page.getByRole('button', { name: 'Cancel job', exact: true }).waitFor()
  assert.equal(evidence.uploads, 1)
  evidence.assertions.reopenResumesWithoutReupload = true
  step('Cancelling with an earlier poll held in flight')
  holdPoll = true
  await page.waitForTimeout(2300)
  assert.ok(pendingPoll, 'An earlier GET must be in flight')
  await page.getByRole('button', { name: 'Cancel job', exact: true }).click()
  await page.getByText('Job cancelled', { exact: true }).waitFor()
  await pendingPoll.fulfill({ json: completed() })
  pendingPoll = undefined
  await page.waitForTimeout(400)
  assert.equal(await page.getByText('Job cancelled', { exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Import to Editor', exact: true }).count(), 0)
  assert.deepEqual(project.canvasData, baseline)
  evidence.assertions.lateCompletionCannotReviveCancellation = true
  await screenshot('02-cancelled')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Save banner', exact: true }).waitFor()
  await waitLayers(2)
  await openDissector()
  await page.getByText('Job cancelled', { exact: true }).waitFor()
  evidence.assertions.reloadResumesPersistedCancellation = true
  step('Retrying asynchronously and cancelling without reopening')
  await page.getByRole('button', { name: 'Retry analysis', exact: true }).click()
  await page.getByText('Waiting to analyze', { exact: true }).first().waitFor()
  const cancelRetry = page.getByRole('button', { name: 'Cancel job', exact: true })
  assert.equal(await cancelRetry.isEnabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Retry analysis', exact: true }).count(), 0)
  await screenshot('03-queued-retry')
  job = snapshot('analyzing')
  await page.getByText('Analyzing layers', { exact: true }).first().waitFor()
  await cancelRetry.click()
  await page.getByText('Job cancelled', { exact: true }).waitFor()
  assert.deepEqual(project.canvasData, baseline)
  evidence.assertions.cancelRetryWithoutClosingDialog = true
  await screenshot('03b-cancelled-retry')
  await page.getByRole('button', { name: 'Retry analysis', exact: true }).click()
  await page.getByText('Waiting to analyze', { exact: true }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Cancel job', exact: true }).isEnabled(), true)
  job = completed()
  await page.getByRole('button', { name: 'Import to Editor', exact: true }).waitFor()
  await screenshot('04-result-review')
  step('Importing the reviewed result and proving one-step undo')
  await page.getByRole('button', { name: 'Import to Editor', exact: true }).click()
  await waitLayers(1)
  assert.equal(evidence.imports, 1)
  await save()
  const imported = structuredClone(project.canvasData)
  await screenshot('05-imported')
  await page.keyboard.press('Meta+z')
  await waitLayers(2)
  await save()
  assert.deepEqual(project.canvasData, baseline)
  await screenshot('06-undo')
  await page.keyboard.press('Meta+Shift+z')
  await waitLayers(1)
  await save()
  assert.deepEqual(project.canvasData, imported)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Save banner', exact: true }).waitFor()
  await waitLayers(1)
  await screenshot('07-reloaded')
  await openDissector()
  await page.getByText('Artwork imported', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Import to Editor', exact: true }).count(), 0)
  evidence.assertions.importedJobCannotImportAgain = true
  evidence.assertions.oneUndoRedoAndSaveReload = true
  assert.equal(evidence.retries, 2)
  assert.equal(evidence.cancellations, 2)
  assert.equal(evidence.uploads, 1)
  assert.deepEqual(evidence.fixtureErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.status = 'passed'
  writeFileSync(`${out}/review.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Banner Studio job recovery proof</title><style>body{font:16px/1.5 system-ui;max-width:1200px;margin:30px auto;background:#f4f5f7;color:#172033}img{width:100%;border:1px solid #b8c1ca}figure{margin:24px 0}a{color:#164db5}</style><h1>Saved artwork analysis jobs</h1><p>Actual Nuxt editor with synthetic auth, provider and project APIs. This verifies job controls and editor undo; it does not demonstrate automatic extraction quality or hosted execution.</p><p>One upload, two asynchronous retries, two cancellations, one import and four fixture saves. Late completion did not revive the cancelled job. Undo/redo and reload passed.</p><p><a href="evidence.json">Browser evidence</a> · <a href="../postgres-proof.json">Independent local PostgreSQL evidence</a></p>${['01-running', '02-cancelled', '03-queued-retry', '03b-cancelled-retry', '04-result-review', '05-imported', '06-undo', '07-reloaded'].map(name => `<figure><figcaption>${name}</figcaption><img src="${name}.png" alt="${name}"></figure>`).join('')}</html>`)
  step('All local browser assertions passed')
} catch (error) {
  evidence.status = 'failed'
  evidence.failure = error.stack
  await screenshot('failure').catch(() => {})
  writeFileSync(`${out}/failure-aria.txt`, await page.locator('body').ariaSnapshot().catch(() => 'unavailable'))
} finally {
  persist()
  await browser.close()
}
if (evidence.status !== 'passed') process.exitCode = 1
