// workers/audio-jobs/container/overlayCapture.mjs
// Headless Chromium transparent-PNG frame capture for GSAP banner overlays.
// Ported from the video-composite-render-spike; drives the GSAP timeline via
// gsap.globalTimeline.getChildren(false)[0] (the banner builder's master tl),
// NOT window.__seek (spike-only mechanism).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Capture transparent-PNG frames of a GSAP banner HTML page.
 *
 * @param {import('@cloudflare/puppeteer').Browser} browser
 * @param {{ html: string, width: number, height: number, fps: number, durationSec: number, outDir: string }} opts
 * @returns {Promise<{ frames: number }>}
 */
export async function captureOverlay(browser, { html, width, height, fps, durationSec, outDir }) {
  mkdirSync(outDir, { recursive: true })

  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })

  // Load the HTML string — networkidle0 ensures fonts + GSAP fully settled.
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })

  // Resolve actual animation duration from the GSAP master timeline.
  // Must NOT return the timeline object itself — it's thenable; CDP would hang
  // waiting for it to "resolve". Return a primitive (number|null) only.
  const gDuration = await page.evaluate(() => {
    const g = window.gsap
    const c = g && g.globalTimeline.getChildren(false)
    return (c && c[0]) ? c[0].duration() : null
  })
  const totalDuration = typeof gDuration === 'number' ? gDuration : durationSec

  const frames = Math.ceil(totalDuration * fps)

  for (let f = 0; f < frames; f++) {
    const t = f / fps

    // Block-body seek: must NOT return the timeline (thenable → CDP hang).
    await page.evaluate((seekT) => {
      const g = window.gsap
      const c = g && g.globalTimeline.getChildren(false)
      if (c && c[0]) c[0].seek(seekT)
    }, t)

    // One rAF settle to flush GSAP mutations into the DOM before screenshot.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))

    const framePath = join(outDir, `ovl_${String(f).padStart(5, '0')}.png`)
    await page.screenshot({
      omitBackground: true,   // transparent PNG — the key new capability
      type: 'png',
      clip: { x: 0, y: 0, width, height },
      path: framePath,
    })
  }

  await page.close()
  return { frames }
}
