/** Rebuild catalog previews from the actual email element, never the browser canvas.
 * pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/email-template-previews.ts
 * Requires the existing Playwright Chrome channel. Does not call app APIs or send mail.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { EDM_STARTER_TEMPLATES, buildStarterTemplateDocument } from '../app/utils/edmPresets'
import { renderTemplateDocumentLocally } from '../workers/email-rendering/src/render/document'

const root = fileURLToPath(new URL('../', import.meta.url))
const publicRoot = path.join(root, 'public')
const out = path.join(publicRoot, 'email/template-previews')
const selected = process.argv.slice(2)
const templates = selected.length ? EDM_STARTER_TEMPLATES.filter(s => selected.includes(s.id)) : EDM_STARTER_TEMPLATES
if (!templates.length || selected.some(id => !templates.some(t => t.id === id))) throw new Error('Unknown template selection')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const evidence: Record<string, unknown>[] = []
try {
  for (const starter of templates) {
    const page = await browser.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 1 })
    try {
      // Absolute base resolves imported root-relative asset URLs. Every image is
      // served from the same checked-out public directory as the release.
      await page.route('https://app.xeroflow.io/**', async route => {
        const url = new URL(route.request().url())
        const file = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname))
        if (!file.startsWith(publicRoot + path.sep)) return route.abort()
        try {
          const body = await readFile(file)
          const contentType = file.endsWith('.png') ? 'image/png' : /\.jpe?g$/i.test(file) ? 'image/jpeg' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'
          await route.fulfill({ body, contentType })
        } catch { await route.abort() }
      })
      const html = renderTemplateDocumentLocally(buildStarterTemplateDocument(starter.id), { subjectLine: starter.subject, previewText: starter.previewText })
      await page.setContent(html.replace('<head>', '<head><base href="https://app.xeroflow.io/">'), { waitUntil: 'networkidle' })
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {}))) })
      const broken = await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src')))
      if (broken.length) throw new Error(`${starter.id}: broken images: ${broken.join(', ')}`)
      const email = page.locator('.email-container')
      const bounds = await email.boundingBox()
      if (!bounds || Math.round(bounds.width) !== 600) throw new Error(`${starter.id}: expected a 600px email, got ${bounds?.width}`)
      await email.screenshot({ path: path.join(out, starter.id + '.jpeg'), type: 'jpeg', quality: 86 })
      evidence.push({ id: starter.id, width: bounds.width, height: bounds.height, imageCount: await page.locator('img').count(), brokenImages: 0 })
    } finally { await page.close() }
  }
} finally { await browser.close() }
const receipt = path.join(root, '.nuxt/email-template-preview-evidence.json')
await mkdir(path.dirname(receipt), { recursive: true })
await writeFile(receipt, JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence))
