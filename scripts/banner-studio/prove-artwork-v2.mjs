// Actual local Nuxt UI with explicitly mocked auth, storage and AI. Never target a hosted origin.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:3137'
const out = resolve('output/editable-artwork-v2'); mkdirSync(out, { recursive: true })
const source = readFileSync('/Users/paulgiurin/Documents/Projects/dashboard/output/eastern-subaru-mailout-20261026/codex-jpeg-concepts/concept-1-bold-retail-lifestyle-A4.jpg')
const hash = createHash('sha256').update(source).digest('hex')
const project = JSON.parse(readFileSync('output/editable-artwork-pilot/project.json', 'utf8'))
project.id = '12345678-1234-4234-8234-123456789012'; project.clientId = null; project.createdBy = 'local-pilot'; project.updatedAt = new Date().toISOString()
const key = Object.keys(project.canvasData)[0], assetId = '12345678-1234-4234-8234-123456789013'
let saves = 0, generationCalls = 0, letteringCalls = 0
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } })
// Isolated synthetic lettering fixtures are drawn from scratch, never derived from customer artwork.
const rasterFixture = async wording => Buffer.from(await page.evaluate(text => {
 const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 180
 const ctx = canvas.getContext('2d'); ctx.font = 'bold 70px Arial'; ctx.fillStyle = '#00449f'; ctx.fillText(text, 24, 112)
 return canvas.toDataURL('image/png').split(',')[1]
}, wording), 'base64')
const rasterSource = await rasterFixture('RELOCATION SALE'), rasterResult = await rasterFixture('GRAND OPENING')
const rasterSourceId = '12345678-1234-4234-8234-123456789014', rasterResultId = '12345678-1234-4234-8234-123456789015'
const rasterSourceUrl = base + '/fixture-lettering-source.png', rasterResultUrl = base + '/fixture-lettering-result.png'
project.canvasData[key].layers.push({ id: 9001, type: 'image', name: 'Synthetic isolated lettering fixture', src: rasterSourceUrl, srcType: 'image', fit: 'contain', x: 160, y: 950, w: 1200, h: 270, zIndex: 100, opacity: 1, animIn: 'none', animOut: 'none' })
await page.route('**/fixture-lettering-source.png', route => route.fulfill({ body: rasterSource, contentType: 'image/png' }))
await page.route('**/fixture-lettering-result.png', route => route.fulfill({ body: rasterResult, contentType: 'image/png' }))
writeFileSync(out + '/synthetic-lettering-source.png', rasterSource)
writeFileSync(out + '/synthetic-lettering-result.png', rasterResult)
let rasterCalls = 0
const errors = [], consoleErrors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
await page.context().addCookies([{ name: 'auth_status', value: 'logged_in', url: base }])
await page.route('**/fixture-concept.jpg', route => route.fulfill({ body: source, contentType: 'image/jpeg' }))
await page.route('**/api/**', async route => {
 const request = route.request(), path = new URL(request.url()).pathname
 let data = []
 if (path === '/api/auth/me') data = { user: { id: 'local-pilot', name: 'Local fixture session', email: 'pilot@example.invalid', role: 'owner', permissionGroups: [] } }
 else if (path === '/api/agency/banner-studio/projects/' + project.id) {
  if (request.method() === 'PATCH') {
   const body = request.postDataJSON(); assert.equal(body.expectedRevision, project.updatedAt)
   Object.assign(project, { canvasData: body.canvasData, name: body.name, updatedAt: new Date(Date.parse(project.updatedAt) + 1000).toISOString() }); saves++
   writeFileSync(out + '/saved-project.json', JSON.stringify(project, null, 2))
  }
  data = project
 } else if (path === '/api/agency/banner-studio/projects') data = [project]
 else if (path === '/api/agency/banner-studio/assets') data = { assets: [{ id: assetId, name: 'Approved leafy retail reference', mimeType: 'image/jpeg', clientId: null, uploadedBy: 'local-pilot', url: base + '/fixture-concept.jpg' }, { id: rasterSourceId, name: 'Synthetic isolated lettering source (fixture)', mimeType: 'image/png', clientId: null, uploadedBy: 'local-pilot', url: rasterSourceUrl }] }
 else if (path === '/api/agency/banner-studio/ai/generate') {
  generationCalls++; const body = request.postDataJSON(); assert.equal(body.sourceRevision, project.updatedAt)
  assert.deepEqual(body.referenceAssetIds, [assetId]); assert.ok(body.approvedCopy.includes('The Great Eastern Subaru Relocation Sale'))
  data = { proposalId: 'fixture-generation', projectId: project.id, sourceRevision: project.updatedAt, formatKey: key, mode: 'generation', asset: { id: assetId, url: base + '/fixture-concept.jpg', width: 2480, height: 3508, sha256: hash }, evidence: { provider: 'test-fixture', model: 'not-live-inference', requestId: null, cost: null }, referenceAssetIds: [assetId], referenceHashes: [hash], warnings: ['Local fixture — no model inference'], verification: 'review-required' }
 } else if (path === '/api/agency/banner-studio/ai/lettering') {
  letteringCalls++; const body = request.postDataJSON(); assert.equal(body.sourceRevision, project.updatedAt)
  data = { proposalId: 'fixture-lettering', projectId: project.id, sourceRevision: project.updatedAt, formatKey: key, layerId: body.layerId, mode: 'native', wording: body.wording, nativeStyle: { fontFamily: 'Arial', fontSize: 82, fontWeight: 800, fontStyle: 'normal', color: '#00449f', textAlign: 'left', lineHeight: 1.1, letterSpacing: '0px' }, evidence: { provider: 'test-fixture', model: 'not-live-inference', requestId: null, cost: null }, referenceAssetIds: [], warnings: ['Local fixture — no model inference'], verification: 'review-required' }
  if (body.mode === 'raster') {
   rasterCalls++; assert.equal(body.sourceWording, 'RELOCATION SALE'); assert.equal(body.isolationConfirmed, true); assert.equal(body.layerId, 9001); assert.equal(body.wording, 'GRAND OPENING')
   assert.equal(project.canvasData[key].layers.find(layer => layer.id === 9001).src, rasterSourceUrl)
   data = { ...data, mode: 'raster', nativeStyle: undefined, asset: { id: rasterResultId, url: rasterResultUrl, width: 800, height: 180, sha256: createHash('sha256').update(rasterResult).digest('hex') }, referenceAssetIds: [rasterSourceId], referenceHashes: [createHash('sha256').update(rasterSource).digest('hex')] }
  }
 } else if (path === '/api/agency/banner-studio/effects/presets') data = { presets: [] }
 else if (path === '/api/notifications') data = { notifications: [], unreadCount: 0, hasMore: false }
 else if (/counts|unread/.test(path)) data = { count: 0, unread: 0 }
 else if (/session|status|settings|preferences/.test(path)) data = {}
 await route.fulfill({ json: data })
})
try {
 await page.goto(base + '/agency/banner-studio/' + project.id, { waitUntil: 'domcontentloaded', timeout: 120000 })
 await page.locator('#lyr-5').waitFor({ timeout: 120000 })
 await page.locator('#lyr-5').click({ position: { x: 10, y: 3 } })
 await page.getByRole('button', { name: 'Edit with AI', exact: true }).click()
 await page.getByLabel('Text', { exact: true }).fill('A NEW HOME. A WARM WELCOME.')
 await page.getByRole('button', { name: 'Generate preview', exact: true }).click()
 await page.getByText('Preview in composition', { exact: true }).waitFor()
 await page.screenshot({ path: out + '/lettering-preview.png' })
 await page.getByLabel('I checked exact words, fit, clipping, background and protected content in the canvas preview.').check()
 await page.getByRole('button', { name: 'Apply lettering', exact: true }).click()
 assert.match(await page.locator('#lyr-5').innerText(), /A NEW HOME/)
 await page.keyboard.press('Meta+z'); assert.match(await page.locator('#lyr-5').innerText(), /WE’VE MOVED/)
 await page.keyboard.press('Meta+Shift+z'); await page.keyboard.press('Meta+s')
 await page.waitForTimeout(500)
 await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#lyr-5').waitFor({ timeout: 120000 })
 assert.match(await page.locator('#lyr-5').innerText(), /A NEW HOME/)
 // First-use raster lettering has no prior recipe or source marker.
 const rasterBaseline = JSON.parse(JSON.stringify(project.canvasData[key].layers))
 assert.equal(rasterBaseline.find(layer => layer.id === 9001).letteringRecipe, undefined)
 await page.locator('#lyr-9001').click({ button: 'right' })
 await page.getByRole('menuitem', { name: 'Edit with AI', exact: true }).click()
 await page.getByLabel('Source wording', { exact: true }).fill('RELOCATION SALE')
 await page.getByLabel('This is an isolated lettering cutout with a clean background and no duplicate lettering underneath.').check()
 await page.getByLabel('Text', { exact: true }).fill('GRAND OPENING')
 await page.getByLabel('Instructions', { exact: true }).fill('Keep the blue bold lettering. Synthetic test fixture only.')
 await page.getByLabel('Result', { exact: true }).click()
 await page.getByRole('option', { name: 'Redraw with AI', exact: true }).click()
 await page.getByRole('button', { name: 'Generate preview', exact: true }).click()
 await page.getByText('Preview in composition', { exact: true }).waitFor()
 assert.equal(await page.locator('#lyr-9001 img').getAttribute('src'), rasterResultUrl)
 assert.deepEqual(project.canvasData[key].layers, rasterBaseline)
 await page.screenshot({ path: out + '/raster-lettering-preview.png' })
 await page.getByLabel('Show original in canvas for comparison').check()
 assert.equal(await page.locator('#lyr-9001 img').getAttribute('src'), rasterSourceUrl)
 await page.getByLabel('Show original in canvas for comparison').uncheck()
 await page.getByLabel('I checked exact words, fit, clipping, background and protected content in the canvas preview.').check()
 await page.getByRole('button', { name: 'Apply lettering', exact: true }).click()
 assert.equal(await page.locator('#lyr-9001 img').getAttribute('src'), rasterResultUrl)
 await page.screenshot({ path: out + '/raster-lettering-applied.png' })
 await page.keyboard.press('Meta+z')
 assert.equal(await page.locator('#lyr-9001 img').getAttribute('src'), rasterSourceUrl)
 await page.screenshot({ path: out + '/raster-lettering-undone.png' })
 await page.keyboard.press('Meta+Shift+z')
 const rasterSave = page.waitForResponse(response => response.url().endsWith('/api/agency/banner-studio/projects/' + project.id) && response.request().method() === 'PATCH')
 await page.keyboard.press('Meta+s'); await rasterSave
 const rasterSaved = project.canvasData[key].layers.find(layer => layer.id === 9001)
 assert.equal(rasterSaved.letteringRecipe.wording, 'GRAND OPENING'); assert.equal(rasterSaved.letteringRecipe.sourceWording, 'RELOCATION SALE')
 assert.equal(rasterSaved.letteringRecipe.reference, rasterSourceUrl); assert.deepEqual(rasterSaved.letteringRecipe.proposal.referenceAssetIds, [rasterSourceId])
 assert.deepEqual(project.canvasData[key].layers.filter(layer => layer.id !== 9001), rasterBaseline.filter(layer => layer.id !== 9001))
 await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#lyr-9001').waitFor({ timeout: 120000 })
 assert.equal(await page.locator('#lyr-9001 img').getAttribute('src'), rasterResultUrl)
 await page.locator('#lyr-9001').click()
 await page.getByRole('button', { name: 'Edit with AI', exact: true }).click()
 assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), 'GRAND OPENING')
 assert.equal(await page.getByLabel('Instructions', { exact: true }).inputValue(), 'Keep the blue bold lettering. Synthetic test fixture only.')
 await page.screenshot({ path: out + '/raster-lettering-reopened.png' })
 await page.getByRole('button', { name: 'Create artwork', exact: true }).click()
 await page.getByLabel('Reusable style name', { exact: true }).fill('Leafy retail proof')
 await page.getByLabel('Campaign brief', { exact: true }).fill('Bold retail artwork with leafy suburban family lifestyle and approved vehicles.')
 await page.getByLabel('Exact approved copy', { exact: true }).fill('The Great Eastern Subaru Relocation Sale')
 await page.getByText('Choose campaign references', { exact: true }).click()
 await page.getByRole('option', { name: 'Approved leafy retail reference' }).click()
 await page.keyboard.press('Escape')
 await page.getByRole('button', { name: 'Generate complete concept', exact: true }).click()
 await page.getByText('Review before import', { exact: true }).waitFor({ timeout: 10000 })
 await page.setViewportSize({ width: 1800, height: 1600 })
 await page.getByAltText('Generated complete campaign concept for review').scrollIntoViewIfNeeded()
 await page.getByAltText('Generated complete campaign concept for review').screenshot({ path: out + '/concept-preview-image.png' })
 await page.screenshot({ path: out + '/concept-preview.png' })
 await page.setViewportSize({ width: 1800, height: 1200 })
 await page.getByLabel('I reviewed the visible copy, original assets and leafy setting; this concept is approved for import.').check()
 await page.getByRole('button', { name: 'Import reviewed concept and save', exact: true }).click()
 await page.waitForTimeout(700)
 assert.equal(project.canvasData[key].artworkCreation.styles[0].name, 'Leafy retail proof')
 await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#lyr-5').waitFor({ timeout: 120000 })
 await page.getByRole('button', { name: 'Create artwork', exact: true }).click()
 await page.getByText('Bold Retail Lifestyle · starter', { exact: true }).click()
 await page.getByRole('option', { name: 'Leafy retail proof · version 1', exact: true }).click()
 assert.equal(await page.getByLabel('Reusable style name', { exact: true }).inputValue(), 'Leafy retail proof')
 assert.equal(await page.getByLabel('Campaign brief', { exact: true }).inputValue(), '')
 assert.equal(await page.getByLabel('Exact approved copy', { exact: true }).inputValue(), '')
 await page.screenshot({ path: out + '/saved-style-reopened.png' })
 writeFileSync(out + '/ui-evidence.json', JSON.stringify({ letteringPreviewApplyUndoRedoReload: true, firstUseRasterRightClickPreviewApplyUndoReload: true, rasterOriginalReferenceRetained: true, rasterCalls, generatedConceptReviewImportSave: true, customStyleReopened: true, saves, generationCalls, letteringCalls, provider: 'explicit fixtures, not live inference', persistence: 'file-backed API fixture, not hosted database', errors, consoleErrors }, null, 2))
 assert.deepEqual(errors, [])
 console.log('PASS: actual Nuxt UI lettering + generation + saved style flow; fixture provider/storage only')
} catch (error) {
 await page.screenshot({ path: out + '/failure.png' }); writeFileSync(out + '/failure.txt', await page.locator('body').innerText()); writeFileSync(out + '/errors.json', JSON.stringify({ errors, consoleErrors }, null, 2)); throw error
} finally { await browser.close() }
