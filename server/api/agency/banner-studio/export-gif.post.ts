import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { randomUUID } from 'crypto'

const MAX_FORMATS = 25
const MAX_DIMENSION = 2000
const MAX_FRAMES = 100 // 10s at 10fps

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { projectId, formats, fps = 10 } = body

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }
  if (!formats?.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one format is required' })
  }
  if (formats.length > MAX_FORMATS) {
    throw createError({ statusCode: 400, statusMessage: `Maximum ${MAX_FORMATS} formats per request` })
  }
  if (fps < 5 || fps > 15) {
    throw createError({ statusCode: 400, statusMessage: 'fps must be between 5 and 15' })
  }

  // Verify project exists
  const project = await queryOne('SELECT id FROM banner_projects WHERE id = $1', [projectId])
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const browser = await getBrowser(event)
  if (!browser) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Browser rendering not available. Configure Cloudflare Browser Rendering or install puppeteer.',
    })
  }

  const results: Array<{ formatKey: string; url: string; fileSize: number }> = []

  try {
    // Dynamic imports for GIF encoding
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc' as string)
    const { PNG } = await import('pngjs' as string)

    for (const fmt of formats) {
      const { key: formatKey, html, width, height } = fmt
      if (!formatKey || !html || !width || !height) continue
      if (width > MAX_DIMENSION || height > MAX_DIMENSION || width < 1 || height < 1) continue

      const page = await browser.newPage()

      try {
        // JS enabled — GSAP needs it for timeline seeking
        await page.setJavaScriptEnabled(true)
        await page.setViewport({ width, height })
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })

        // Wait for GSAP + assets to load
        await new Promise(r => setTimeout(r, 1000))

        // Get animation duration from GSAP timeline
        const duration = await page.evaluate(() => {
          const g = (globalThis as any).gsap
          if (!g) return 3
          const timelines = g.globalTimeline.getChildren(false)
          if (timelines.length === 0) return 3
          return timelines[0].duration() || 3
        })

        const frameDelay = Math.round(1000 / fps)
        const totalFrames = Math.min(MAX_FRAMES, Math.ceil(duration * fps))

        // Create GIF encoder
        const gif = GIFEncoder()

        // Capture each frame
        for (let i = 0; i < totalFrames; i++) {
          const t = i / fps

          // Seek GSAP timeline to frame time
          await page.evaluate((seekTime: number) => {
            const g = (globalThis as any).gsap
            if (!g) return
            const timelines = g.globalTimeline.getChildren(false)
            if (timelines.length > 0) {
              timelines[0].seek(seekTime)
            }
          }, t)

          // Wait for render to settle
          await new Promise(r => setTimeout(r, 50))

          // Screenshot as PNG
          const screenshotBuffer = await page.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width, height },
          })

          // Decode PNG to RGBA pixels
          const png = PNG.sync.read(Buffer.from(screenshotBuffer))
          const pixels = png.data // Uint8Array RGBA

          // Quantize to 256 colors and apply palette
          const palette = quantize(pixels, 256)
          const index = applyPalette(pixels, palette)

          gif.writeFrame(index, width, height, { palette, delay: frameDelay })
        }

        gif.finish()

        const gifBuffer = Buffer.from(gif.bytes())

        // Upload to R2
        const r2Key = `banner-gifs/${projectId}/${formatKey}_${randomUUID().slice(0, 8)}.gif`
        const { url, size } = await uploadFile(gifBuffer, r2Key, 'image/gif')

        // Create export record
        await queryOne(`
          INSERT INTO banner_exports (project_id, format_key, r2_key, url, file_size, export_type, quality, exported_by)
          VALUES ($1, $2, $3, $4, $5, 'gif', 1, $6)
          RETURNING id
        `, [projectId, formatKey, r2Key, url, size, user.id])

        results.push({ formatKey, url, fileSize: size })
      } finally {
        await page.close().catch(() => {})
      }
    }
  } finally {
    await browser.close().catch(() => {})
  }

  return results
})

async function getBrowser(event: any): Promise<any> {
  // Try Cloudflare Browser Rendering binding
  try {
    const cfBrowser = (event.context as any).cloudflare?.env?.BROWSER
    if (cfBrowser) {
      const puppeteer = await import('@cloudflare/puppeteer' as string)
      return puppeteer.default.launch(cfBrowser)
    }
  } catch {
    // CF Browser Rendering not available
  }

  // Fallback: try puppeteer (for local dev)
  try {
    const puppeteer = await import('puppeteer' as string)
    return puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  } catch {
    return null
  }
}
