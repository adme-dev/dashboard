// workers/audio-jobs/container/bannerCapture.mjs
// Chromium captures GSAP frames of a banner HTML page at WxH; ffmpeg encodes to MP4.
// Ported from the former server/api/agency/banner-studio/export-video.post.ts loop.
// Uses @cloudflare/puppeteer + /usr/bin/chromium — matches overlayCapture.mjs idioms.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
  try {
    page = await browser.newPage()
    await page.setViewport({ width: vpW, height: vpH, deviceScaleFactor: 1 })

    // Load the HTML string — networkidle0 ensures fonts + GSAP fully settled.
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })

    // Resolve actual animation duration from the GSAP master timeline.
    // Must NOT return the timeline object itself — it's thenable; CDP would hang
    // waiting for it to "resolve". Return a primitive (number|null) only.
    let duration = 5
    try {
      const gDuration = await page.evaluate(() => {
        const g = window.gsap
        const c = g && g.globalTimeline.getChildren(false)
        return (c && c[0]) ? c[0].duration() : null
      })
      if (typeof gDuration === 'number' && gDuration > 0) {
        duration = gDuration
      }
    } catch { /* default 5s */ }

    duration = Math.min(duration, 30)
    const totalFrames = Math.min(MAX_FRAMES, Math.ceil(duration * fps))

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps

      // Block-body seek: must NOT return the timeline (thenable → CDP hang).
      await page.evaluate((seekT) => {
        const g = window.gsap
        const c = g && g.globalTimeline.getChildren(false)
        if (c && c[0]) c[0].seek(seekT)
      }, t)

      // One rAF settle to flush GSAP mutations into the DOM before screenshot.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))

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
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)))
      ff.on('error', reject)
    })
    return readFileSync(out)
  } finally {
    await page?.close().catch(() => {})
    await browser.close().catch(() => {})
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
