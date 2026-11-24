import { chromium } from '/Volumes/Backups/Development/OrcaWorkspaces/dashboard/dashboard/prepare-fixes-assets/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const S = process.env.S
const tag = process.argv[2] || 'after'
const scenario = process.argv[3] || 'layout'
const BASE = 'http://localhost:3417'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const media = name => readFileSync(`${S}/media/${name}`)
const now = '2026-11-24T00:00:00Z'

const user = { id: 'u1', email: 'proof@example.test', name: 'Proof User', role: 'owner', is_active: true, permissionGroups: ['ADMIN', 'CREATIVE', 'CLIENTS', 'FINANCE', 'MANAGEMENT', 'MEDIA'] }
const state = JSON.parse(readFileSync(`${S}/state.json`, 'utf8'))
const project = { id: PROJECT, clientId: null, createdBy: 'u1', title: 'Forecourt launch film', mediaType: 'av', isTest: false, status: 'draft', currentTimelineId: 't1', createdAt: now, updatedAt: now }
const timeline = { id: 't1', projectId: PROJECT, version: 1, editRevision: 0, label: null, state, schemaVersion: 2, createdBy: 'u1', createdAt: now }

const asset = (id, title, r2Key, thumb) => ({ id, clientId: null, createdBy: 'u1', title, sourceProjectId: PROJECT, sourceJobId: null, r2Key, format: r2Key.endsWith('.mp4') ? 'footage' : 'still', width: 1280, height: 720, durationSec: r2Key.endsWith('.mp4') ? 4 : null, thumbnailKey: thumb ? 'k' : null, thumbnailUrl: thumb ? `/api/agency/video/assets/${id}/thumbnail` : null, captionVttKey: null, captionVttUrl: null, transcript: null, metadata: {}, generationPrompt: null, generationModelId: null, createdAt: now, updatedAt: now })
const db = {
  assets: [asset('a-still', 'Showroom still', 'media/p/still/showroom.png', true), asset('a-video', 'Walkaround (no saved frame)', 'video/walkaround.mp4', false)],
  thumbs: { 'a-still': 'still.png' },
  files: { 'a-still': ['still.png', 'image/png'], 'a-video': ['clip.mp4', 'video/mp4'] },
  jobs: [],
  log: []
}
const items = () => db.assets.map(a => ({ id: `item-${a.id}`, bucketId: a.format === 'still' ? 'b-stills' : 'b-footage', assetId: a.id, r2Key: a.r2Key, title: a.title, role: 'uploaded', directive: {}, status: 'ready', createdAt: now, updatedAt: now }))
const actions = [
  ['erase-fill', 'Erase and heal', 'Paint over something to remove it.'],
  ['mask-lift', 'Lift', 'Paint over a subject to cut it out.'],
  ['background-removal', 'Remove background', 'Keep the subject, drop the rest.'],
  ['layer-decomposition', 'Separate layers', 'Split the picture into layers you can animate.'],
  ['mask-only', 'Mask only', 'Save the painted mask.']
].map(([id, label, description]) => ({ id, label, description, outputKinds: [], available: true, unavailableReason: null }))

async function handle(route) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname
  const method = req.method()
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  let m
  if (path === '/api/auth/me') return json({ user })
  if (path === `/api/agency/audio/projects/${PROJECT}` && method === 'GET') return json({ project, timeline })
  if (path.endsWith('/clip-sources')) return json({ sources: {} })
  if (path.endsWith('/render-jobs')) return json({ jobs: [] })
  if (path.endsWith('/timeline') || path.endsWith('/versions')) return json(method === 'GET' ? { versions: [] } : { timeline })
  if (path === '/api/agency/video/assets') return json({ assets: db.assets })
  if (path.endsWith('/buckets')) return json({ buckets: [{ id: 'b-stills', kind: 'stills', name: 'Stills', sortOrder: 1 }, { id: 'b-footage', kind: 'footage', name: 'Footage', sortOrder: 0 }], items: items() })
  if (path.endsWith('/asset-intelligence/models')) return json({ actions, models: [] })
  if (path.endsWith('/intelligence-jobs')) return json({ jobs: db.jobs })
  if (path.endsWith('/derivatives')) return json({ derivatives: [] })
  if ((m = path.match(/\/video\/assets\/([^/]+)\/thumbnail$/))) {
    if (method === 'POST') {
      const body = req.postDataBuffer()
      db.log.push({ call: 'POST thumbnail', asset: m[1], bytes: body?.length ?? 0, jpeg: body ? body.includes(Buffer.from([0xff, 0xd8, 0xff])) : false, contentType: req.headers()['content-type']?.split(';')[0] })
      writeFileSync(`${S}/proof/captured-frame-request.bin`, body ?? Buffer.alloc(0))
      db.thumbs[m[1]] = 'still.png'
      return json({ saved: true, thumbnailUrl: path }, 201)
    }
    const file = db.thumbs[m[1]]
    return file ? route.fulfill({ status: 200, contentType: 'image/png', body: media(file) }) : json({ statusMessage: 'Thumbnail not available' }, 404)
  }
  if ((m = path.match(/\/video\/assets\/([^/]+)\/stream$/))) {
    const [file, type] = db.files[m[1]] ?? []
    if (!file) return json({}, 404)
    const bytes = media(file)
    const range = req.headers().range?.match(/bytes=(\d+)-(\d*)/)
    if (range) {
      const start = Number(range[1]); const end = range[2] ? Number(range[2]) : bytes.length - 1
      return route.fulfill({ status: 206, headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${bytes.length}` }, body: bytes.subarray(start, end + 1) })
    }
    return route.fulfill({ status: 200, headers: { 'content-type': type, 'accept-ranges': 'bytes' }, body: bytes })
  }
  if (path.endsWith('/upload-media') && method === 'POST') {
    const body = req.postDataBuffer()
    const text = body.toString('latin1')
    const field = name => text.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? null
    const filename = text.match(/name="file"; filename="([^"]+)"/)?.[1]
    db.log.push({ call: 'POST upload-media', kind: field('kind'), width: field('width'), height: field('height'), durationSec: field('durationSec'), filename, posterSent: text.includes('name="poster"'), posterIsJpeg: /name="poster"; filename="poster.jpg"\r\nContent-Type: image\/jpeg/.test(text) })
    const id = `a-up-${db.assets.length}`
    const still = field('kind') === 'still'
    db.assets.unshift(asset(id, filename.replace(/\.[^.]+$/, ''), still ? `media/p/still/${filename}` : `media/p/footage/${filename}`, true))
    db.thumbs[id] = still ? 'upload.png' : 'still.png'
    db.files[id] = still ? ['upload.png', 'image/png'] : ['clip.mp4', 'video/mp4']
    return json({ r2_key: db.assets[0].r2Key, url: `/api/agency/video/assets/${id}/stream`, assetId: id, thumbnailSaved: true }, 201)
  }
  if (path.endsWith('/extract') && method === 'POST') {
    const body = JSON.parse(req.postData() || '{}')
    db.log.push({ call: 'POST extract', action: body.action })
    db.jobs.unshift({ id: `j${db.jobs.length}`, sourceAssetId: path.split('/').at(-2), bucketItemId: body.bucketItemId, action: body.action, modelId: 'm', provider: 'p', status: 'queued', prompt: null, brushMaskKey: null, errorMessage: null, createdAt: now })
    return json({ job: { id: 'j', status: 'queued' } }, 201)
  }
  if (path.endsWith('/directive')) return json({ item: items().find(i => i.id === path.split('/').at(-2)) })
  if (path.endsWith('/masks')) return json({ maskKey: 'video-asset-masks/p/a/m.png', url: '/x', size: 1 }, 201)
  if (path === '/api/notifications/stream') return route.abort()
  if (['/api/agency/banner-studio/projects', '/api/agency/clients', '/api/agency/workspaces', '/api/agency/boards/templates', '/api/agency/audio/assets'].includes(path)) return json([])
  if (path === '/api/agency/video/generation/models') return json({ models: [], enabled: false })
  if (path === '/api/agency/video/generation/jobs') return json({ jobs: [] })
  if (path === '/api/notifications') return json({ notifications: [], unreadCount: 0 })
  db.unhandled ??= new Set(); db.unhandled.add(`${method} ${path}`)
  // Everything else in the agency shell: empty.
  return json(method === 'GET' ? {} : { ok: true })
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const out = {}

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark' })
  await context.addCookies([{ name: 'auth_status', value: 'logged_in', url: BASE }])
  const page = await context.newPage()
  page.on('pageerror', e => { (db.errors ??= []).push(String(e).slice(0, 200)) })
  await page.route('**/api/**', handle)
  await page.goto(`${BASE}/agency/audio/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' })
  try { await page.getByRole('tab', { name: 'Prepare' }).first().click({ timeout: Number(process.env.T || 90000) }) } catch (e) {
    await page.screenshot({ path: `${S}/proof/debug.png` })
    console.log('URL', page.url(), 'unhandled', [...(db.unhandled ?? [])], 'errors', db.errors)
    console.log((await page.locator('body').innerText()).slice(0, 600))
    throw e
  }
  await page.locator('[data-prepare-stage]').waitFor({ state: 'attached', timeout: 60000 }); await page.waitForTimeout(1500)
  return { context, page }
}

const rect = (page, sel) => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })

const section = page => page.locator('section[aria-label="Prepare asset"]')
async function selectAsset(page, label) {
  const current = await section(page).locator('button[aria-haspopup]').first().innerText()
  if (current.includes(label)) return
  await section(page).locator('button[aria-haspopup]').first().click()
  await page.getByRole('option', { name: label }).click()
}

if (scenario === 'layout') {
  for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    const { context, page } = await open(width, height)
    await selectAsset(page, 'Showroom still')
    await page.locator('[data-prepare-frame] img').waitFor({ state: 'attached' })
    await page.waitForTimeout(1200)
    // Paint a stroke across the picture.
    const canvas = page.locator('[data-prepare-frame] canvas')
    await page.locator(tag === 'before' ? '[data-prepare-stage]' : '[data-prepare-toolbar]').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(300)
    const box = await canvas.boundingBox()
    if (box && box.height > 4) {
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.42, { steps: 12 })
      await page.mouse.up()
    }
    await page.waitForTimeout(400)
    const root = await rect(page, 'section[aria-label="Prepare asset"]')
    const stage = await rect(page, '[data-prepare-stage]')
    const frame = await rect(page, '[data-prepare-frame]')
    const pane = await page.locator('[data-workspace-pane="prepare"]').evaluate(el => ({ w: el.clientWidth, h: el.clientHeight, scrollH: el.scrollHeight }))
    const columns = await page.locator('section[aria-label="Prepare asset"] > div').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    const pageScrollX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    const painted = await canvas.evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false })
    out[width] = { viewport: `${width}x${height}`, workspace: root, columns, stage, picture: frame, pane, painted, pageScrollX }
    await page.locator(tag === 'before' ? '[data-prepare-stage]' : '[data-prepare-toolbar]').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: `${S}/proof/${tag}-${width}.png` })
    await context.close()
  }
}

if (scenario === 'flows') {
  const { context, page } = await open(1440, 900)
  // 1. Upload a still as a library asset.
  await page.locator('[data-upload-input]').setInputFiles(`${S}/media/upload.png`)
  await page.getByText('Picture added to assets').first().waitFor({ timeout: 30000 })
  await page.locator('[data-prepare-frame] img').waitFor({ state: 'attached' })
  await page.waitForTimeout(1500)
  out.upload = { selected: await section(page).locator('button[aria-haspopup]').first().innerText(), runBlocked: await page.locator('[data-run-blocked]').count() ? await page.locator('[data-run-blocked]').innerText() : null, picture: await rect(page, '[data-prepare-frame]') }
  await page.screenshot({ path: `${S}/proof/flow-1-uploaded-still-selected.png` })

  // 2. A video with no saved frame: Separate layers saves the frame on screen, then runs.
  await page.waitForTimeout(4500) // let the first toast clear
  await selectAsset(page, 'Walkaround (no saved frame)')
  await page.locator('[data-prepare-frame] video').waitFor()
  await page.getByRole('radio', { name: /Separate layers/ }).click()
  await page.waitForFunction(() => document.querySelector('[data-prepare-frame] video')?.readyState >= 2)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${S}/proof/flow-2-video-without-frame.png` })
  await page.getByRole('button', { name: 'Run separate layers' }).click()
  await page.getByText('Extraction queued').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${S}/proof/flow-3-frame-saved-and-run-queued.png` })
  // 3. Upload a video: the browser sends a preview frame with it.
  await page.waitForTimeout(4500)
  await page.locator('[data-upload-input]').setInputFiles(`${S}/media/clip.mp4`)
  await page.getByText('Video added to assets').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${S}/proof/flow-4-uploaded-video-with-frame.png` })
  out.calls = db.log
  await context.close()
}

out.unhandled = [...(db.unhandled ?? [])].slice(0, 40)
out.errors = db.errors ?? []
writeFileSync(`${S}/proof/${tag}-${scenario}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
