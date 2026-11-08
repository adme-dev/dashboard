// workers/audio-jobs/container/overlayCapture.mjs
// Headless Chromium transparent-PNG frame capture for GSAP banner overlays.
// Ported from the video-composite-render-spike; drives the GSAP timeline via
// gsap.globalTimeline.getChildren(false)[0] (the banner builder's master tl),
// NOT window.__seek (spike-only mechanism).
import { prepareStaticCopyPage, inspectExactCopy } from './copyMeasurement.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveFrameRuntime, seekFrameRuntime } from './frameRuntime.mjs'

/**
 * Capture transparent-PNG frames of a GSAP banner HTML page.
 *
 * @param {import('puppeteer-core').Browser} browser
 * @param {{ html: string, width: number, height: number, fps: number, durationSec: number, outDir: string }} opts
 * @returns {Promise<{ frames: number }>}
 */
export async function captureOverlay(browser, { html, width, height, fps, durationSec, outDir, requiredCopy }) {
  mkdirSync(outDir, { recursive: true })

  const page = await browser.newPage()
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 })

    // Load the HTML string — networkidle0 ensures fonts + GSAP fully settled.
    const exactInput = requiredCopy?.length ? { html, width, height, fps, durationSec, required: requiredCopy } : null
    if (exactInput) {
      const findings = await prepareStaticCopyPage(page, exactInput)
      if (findings.length) throw new Error(`Exact copy capture blocked: ${findings[0].code}`)
    } else await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })

    const runtime = await resolveFrameRuntime(page, durationSec)
    const totalDuration = runtime.duration

    const frames = Math.ceil(totalDuration * fps)

    for (let f = 0; f < frames; f++) {
      const t = f / fps

      await seekFrameRuntime(page, runtime.mode, t)

      if (exactInput && (await inspectExactCopy(page, exactInput)).length) throw new Error('Exact copy changed during capture')

      const framePath = join(outDir, `ovl_${String(f).padStart(5, '0')}.png`)
      await page.screenshot({
        omitBackground: true,   // transparent PNG — the key new capability
        type: 'png',
        clip: { x: 0, y: 0, width, height },
        path: framePath,
      })
    }

    return { frames }
  } finally {
    await page.close().catch(() => {})
  }
}
