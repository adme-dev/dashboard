import { randomUUID } from 'uncrypto'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { queryOne } from '~~/server/utils/db'

const MAX_FORMATS = 10
const MAX_DIMENSION = 2000
const MAX_FRAMES = 600 // 10s at 60fps

interface VideoExportFormat {
  key: string
  html: string
  width: number
  height: number
}

interface VideoExportResult {
  formatKey: string
  url: string
  fileSize: number
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { projectId, formats, fps = 30, quality = 1, crf = 23 } = body as {
    projectId: string
    formats: VideoExportFormat[]
    fps?: number
    quality?: 1 | 2
    crf?: number // H.264 CRF: 0-51, lower = better quality, 18-28 reasonable
  }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }
  if (!formats?.length) {
    throw createError({ statusCode: 400, statusMessage: 'formats array is required' })
  }
  if (formats.length > MAX_FORMATS) {
    throw createError({ statusCode: 400, statusMessage: `Max ${MAX_FORMATS} formats per export` })
  }

  const validFps = Math.min(60, Math.max(12, Math.round(fps)))
  const validCrf = Math.min(51, Math.max(0, Math.round(crf)))

  // Check ffmpeg availability
  let spawnSync: typeof import('child_process').spawnSync
  let spawn: typeof import('child_process').spawn
  let tmpdir: typeof import('os').tmpdir
  let fs: typeof import('fs')
  let path: typeof import('path')
  try {
    const cp = await import('child_process')
    spawnSync = cp.spawnSync
    spawn = cp.spawn
    const os = await import('os')
    tmpdir = os.tmpdir
    fs = await import('fs')
    path = await import('path')

    const check = spawnSync('ffmpeg', ['-version'], { timeout: 5000 })
    if (check.status !== 0) {
      throw new Error('ffmpeg not found')
    }
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'MP4 export requires ffmpeg. Install ffmpeg on the server to enable video export.',
    })
  }

  const browser = await getBrowser(event)
  if (!browser) {
    throw createError({ statusCode: 503, statusMessage: 'Browser rendering not available' })
  }

  const results: VideoExportResult[] = []

  try {
    for (const fmt of formats) {
      if (fmt.width > MAX_DIMENSION || fmt.height > MAX_DIMENSION) continue

      const page = await browser.newPage()
      const vpW = fmt.width * quality
      const vpH = fmt.height * quality
      await page.setViewport({ width: vpW, height: vpH, deviceScaleFactor: 1 })
      await page.setJavaScriptEnabled(true)

      try {
        await page.setContent(fmt.html, { waitUntil: 'networkidle0', timeout: 15000 })
        await page.waitForTimeout(500)

        // Get animation duration from GSAP
        let duration = 5
        try {
          duration = await page.evaluate(() => {
            const g = (window as any).gsap
            if (!g) return 5
            const children = g.globalTimeline.getChildren(false)
            if (children.length > 0) return children[0].duration()
            return 5
          })
        } catch {
          // Default duration
        }
        duration = Math.min(duration, 30) // Cap at 30 seconds

        const totalFrames = Math.min(MAX_FRAMES, Math.ceil(duration * validFps))

        // Create temp directory for frames
        const tmpDir = path.join(tmpdir(), `banner-video-${randomUUID()}`)
        fs.mkdirSync(tmpDir, { recursive: true })

        try {
          // Capture frames
          for (let f = 0; f < totalFrames; f++) {
            const seekTime = (f / validFps)

            await page.evaluate((t: number) => {
              const g = (window as any).gsap
              if (!g) return
              const children = g.globalTimeline.getChildren(false)
              if (children.length > 0) {
                children[0].seek(t)
              }
            }, seekTime)

            await page.waitForTimeout(20) // Let render settle

            const framePath = path.join(tmpDir, `frame_${String(f).padStart(5, '0')}.png`)
            await page.screenshot({
              path: framePath,
              type: 'png',
              clip: { x: 0, y: 0, width: vpW, height: vpH },
            })
          }

          // Encode to MP4 with ffmpeg
          const outputPath = path.join(tmpDir, 'output.mp4')
          await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
              '-y',
              '-framerate', String(validFps),
              '-i', path.join(tmpDir, 'frame_%05d.png'),
              '-c:v', 'libx264',
              '-crf', String(validCrf),
              '-pix_fmt', 'yuv420p',
              '-movflags', '+faststart',
              '-vf', `scale=${vpW}:${vpH}:flags=lanczos`,
              outputPath,
            ], { timeout: 120000 })

            ffmpeg.on('close', (code) => {
              if (code === 0) resolve()
              else reject(new Error(`ffmpeg exited with code ${code}`))
            })
            ffmpeg.on('error', reject)
          })

          // Read MP4 and upload
          const mp4Buffer = fs.readFileSync(outputPath)
          const r2Key = `banner-videos/${projectId}/${fmt.key}_${randomUUID()}.mp4`
          const { url, size } = await uploadFile(mp4Buffer, r2Key, 'video/mp4')

          // Track export
          await queryOne(`
            INSERT INTO banner_exports (project_id, format_key, r2_key, url, file_size, export_type, quality, exported_by)
            VALUES ($1, $2, $3, $4, $5, 'mp4', $6, $7)
            RETURNING id
          `, [projectId, fmt.key, r2Key, url, size, quality, user.id])

          results.push({ formatKey: fmt.key, url, fileSize: size })
        } finally {
          // Clean up temp directory
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true })
          } catch { /* ignore cleanup errors */ }
        }
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
