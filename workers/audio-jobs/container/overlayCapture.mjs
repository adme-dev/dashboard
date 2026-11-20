// workers/audio-jobs/container/overlayCapture.mjs
// Headless Chromium transparent-PNG frame capture for GSAP banner overlays.
// Ported from the video-composite-render-spike; drives the GSAP timeline via
// gsap.globalTimeline.getChildren(false)[0] (the banner builder's master tl),
// NOT window.__seek (spike-only mechanism).
import pngjs from 'pngjs'
import { prepareStaticCopyPage, inspectExactCopy } from './copyMeasurement.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveFrameRuntime, seekFrameRuntime, waitForBannerAssets } from './frameRuntime.mjs'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

// Chromium emits RGB on fully opaque frames and RGBA on transparent frames.
// A decoded pixel format change resets FFmpeg's active video and audio filters.
export function normalizeOverlayPng(bytes, width, height) {
  const frame = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (frame.length < 33 || !frame.subarray(0, 8).equals(pngSignature)
    || frame.readUInt32BE(8) !== 13 || frame.toString('ascii', 12, 16) !== 'IHDR'
    || frame.readUInt32BE(16) !== width || frame.readUInt32BE(20) !== height
    || frame[24] !== 8 || (frame[25] !== 2 && frame[25] !== 6)) {
    throw new Error('Unexpected Chromium overlay PNG')
  }
  if (frame[25] === 6) return frame
  const decoded = pngjs.PNG.sync.read(frame)
  return pngjs.PNG.sync.write(decoded, { colorType: 6, inputColorType: 6, bitDepth: 8, deflateLevel: 1, filterType: 0 })
}

/**
 * Capture transparent-PNG frames of a GSAP banner HTML page.
 *
 * @param {import('puppeteer-core').Browser} browser
 * @param {{ html: string, width: number, height: number, fps: number, durationSec: number, outDir: string }} opts
 * @returns {Promise<{ frames: number }>}
 */
export async function captureOverlay(browser, { html, width, height, fps, durationSec, outDir, requiredCopy, signal, onProgress }) {
  mkdirSync(outDir, { recursive: true })

  const page = await browser.newPage()
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 })

    // Streaming video can stay network-active after the DOM is ready. Require
    // decodable media explicitly, as the standalone banner capture does.
    const exactInput = requiredCopy?.length ? { html, width, height, fps, durationSec, required: requiredCopy } : null
    if (exactInput) {
      const findings = await prepareStaticCopyPage(page, exactInput)
      if (findings.length) throw new Error(`Exact copy capture blocked: ${findings[0].code}`)
    } else await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const runtime = await resolveFrameRuntime(page, durationSec)
    // Freeze the authored clock before waiting: an autoplaying timeline can keep
    // setting currentTime while the first video frame is still decoding.
    await seekFrameRuntime(page, runtime.mode, 0)
    await waitForBannerAssets(page)
    const totalDuration = runtime.duration

    const frames = Math.ceil(totalDuration * fps)

    onProgress?.(0, frames)
    for (let f = 0; f < frames; f++) {
      signal?.throwIfAborted()
      const t = f / fps

      await seekFrameRuntime(page, runtime.mode, t)

      if (exactInput && (await inspectExactCopy(page, exactInput)).length) throw new Error('Exact copy changed during capture')

      const framePath = join(outDir, `ovl_${String(f).padStart(5, '0')}.png`)
      const pixels = await page.screenshot({
        omitBackground: true,   // transparent PNG — the key new capability
        type: 'png',
        // These frames are immediately decoded by FFmpeg. Prefer faster lossless
        // PNG encoding over smaller files so portrait footage fits the render deadline.
        optimizeForSpeed: true,
        clip: { x: 0, y: 0, width, height },
      })
      signal?.throwIfAborted()
      writeFileSync(framePath, normalizeOverlayPng(pixels, width, height))
      onProgress?.(f + 1, frames)
    }

    return { frames }
  } finally {
    await page.close().catch(() => {})
  }
}

export async function captureCompositeOverlays(browser, overlays, inputs, dir, signal, report) {
  let previousFrames = 0
  for (const [i, overlay] of overlays.entries()) {
    signal.throwIfAborted()
    const outDir = join(dir, `overlay-${i}`)
    const result = await captureOverlay(browser, {
      html: overlay.html, requiredCopy: overlay.requiredCopy,
      width: overlay.width, height: overlay.height, fps: overlay.fps, durationSec: overlay.durationSec,
      outDir, signal,
      // An authored runtime can outlast the proposed clip duration. Only the
      // final overlay makes the denominator for the complete capture known.
      onProgress(done, total) {
        const progress = { stage: 'capturing', framesDone: previousFrames + done,
          ...(i === overlays.length - 1 ? { framesTotal: previousFrames + total } : {}) }
        try { report(progress) } catch { /* Telemetry cannot invalidate captured frames. */ }
      }
    })
    previousFrames += result.frames
    for (const input of inputs) {
      if (input.clipId === overlay.clipId) input.framesPattern = join(outDir, 'ovl_%05d.png')
    }
  }
}
