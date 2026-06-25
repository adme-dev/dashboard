// workers/audio-jobs/container/bannerCapture.mjs
// Chromium captures GSAP frames of a banner HTML page at WxH; ffmpeg encodes to MP4.
// Ported from the former server/api/agency/banner-studio/export-video.post.ts loop.
// Uses @cloudflare/puppeteer + /usr/bin/chromium — matches overlayCapture.mjs idioms.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createPageDiagnostics, resolveFrameRuntime, seekFrameRuntime } from './frameRuntime.mjs'

const MAX_FRAMES = 600

export async function captureBannerMp4({ html, width, height, fps, crf, quality }) {
  const vpW = width * (quality || 1)
  const vpH = height * (quality || 1)
  // Dynamically import @cloudflare/puppeteer — matches the render-composite route idiom.
  const puppeteer = (await import('@cloudflare/puppeteer')).default
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const tmp = join(tmpdir(), `banner-${randomUUID()}`)
  mkdirSync(tmp, { recursive: true })
  let page = null
  let diagnostics = null
  try {
    page = await browser.newPage()
    diagnostics = createPageDiagnostics(page)
    await page.setViewport({ width: vpW, height: vpH, deviceScaleFactor: 1 })

    // Load the HTML string — networkidle0 ensures fonts + GSAP fully settled.
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })

    const runtime = await resolveFrameRuntime(page, 5)
    let duration = runtime.duration

    duration = Math.min(duration, 30)
    const totalFrames = Math.min(MAX_FRAMES, Math.ceil(duration * fps))

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps

      await seekFrameRuntime(page, runtime.mode, t)

      await page.screenshot({
        path: join(tmp, `frame_${String(f).padStart(5, '0')}.png`),
        type: 'png',
        clip: { x: 0, y: 0, width: vpW, height: vpH },
      })
    }

    const out = join(tmp, 'out.mp4')
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-framerate', String(fps),
        '-i', join(tmp, 'frame_%05d.png'),
        '-c:v', 'libx264',
        '-crf', String(crf),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-vf', `scale=${vpW}:${vpH}:flags=lanczos`,
        out,
      ], { timeout: 120000 })
      let stderr = ''
      ff.stderr?.on('data', d => { stderr += d.toString() })
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-800)}`)))
      ff.on('error', reject)
    })
    return readFileSync(out)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const suffix = diagnostics?.events?.length ? ` diagnostics=${diagnostics.format()}` : ''
    throw new Error(`${message}${suffix}`)
  } finally {
    await page?.close().catch(() => {})
    await browser.close().catch(() => {})
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
