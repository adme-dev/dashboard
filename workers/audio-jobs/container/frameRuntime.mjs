export function createPageDiagnostics(page) {
  const events = []
  const push = (event) => {
    events.push({ ...event, at: Date.now() })
    if (events.length > 80) events.shift()
  }

  page.on?.('console', (msg) => {
    const type = typeof msg.type === 'function' ? msg.type() : 'log'
    if (type === 'error' || type === 'warning') {
      push({ type: 'console', level: type, text: truncate(typeof msg.text === 'function' ? msg.text() : String(msg)) })
    }
  })
  page.on?.('requestfailed', (request) => {
    push({
      type: 'requestfailed',
      url: sanitizeUrl(typeof request.url === 'function' ? request.url() : ''),
      failure: truncate(request.failure?.()?.errorText || 'request failed'),
    })
  })
  page.on?.('response', (response) => {
    const status = typeof response.status === 'function' ? response.status() : 0
    if (status >= 400) {
      push({ type: 'http_error', status, url: sanitizeUrl(typeof response.url === 'function' ? response.url() : '') })
    }
  })

  return {
    push,
    events,
    format() {
      return JSON.stringify(events.slice(-12))
    },
  }
}

/** Media requests may stay active while Chromium buffers video. Wait for the
 * first decodable frame and every image/font instead of global network idle. */
export async function waitForBannerAssets(page, timeoutMs = 30000) {
  const readState = () => page.evaluate(() => ({
    fontsReady: document.fonts.status === 'loaded',
    images: Array.from(document.images, (image, index) => ({ index, ready: image.complete && image.naturalWidth > 0, failed: image.complete && image.naturalWidth === 0 })),
    videos: Array.from(document.querySelectorAll('video'), (video, index) => ({ index, ready: video.readyState >= 2, failed: Boolean(video.error) }))
  }))
  try {
    await page.waitForFunction(() =>
      document.fonts.status === 'loaded'
      && Array.from(document.images).every(image => image.complete)
      && Array.from(document.querySelectorAll('video')).every(video => video.readyState >= 2 || video.error),
    { polling: 100, timeout: timeoutMs })
  } catch (error) {
    const state = await readState().catch(() => null)
    const pendingImages = state?.images.filter(image => !image.ready && !image.failed).map(image => image.index) || []
    const pendingVideos = state?.videos.filter(video => !video.ready && !video.failed).map(video => video.index) || []
    throw new Error(`Banner assets did not load within ${timeoutMs}ms (fonts=${state?.fontsReady ?? 'unknown'}, images=${pendingImages.join(',')}, videos=${pendingVideos.join(',')})`, { cause: error })
  }
  const state = await readState()
  const failedImages = state.images.filter(image => image.failed).map(image => image.index)
  const failedVideos = state.videos.filter(video => video.failed).map(video => video.index)
  if (failedImages.length || failedVideos.length) {
    throw new Error(`Banner assets failed to load (images=${failedImages.join(',')}, videos=${failedVideos.join(',')})`)
  }
}

export async function resolveFrameRuntime(page, fallbackDurationSec, timeoutMs = 2500) {
  const hasRuntime = await page.evaluate(() => !!window.__engagrFrame).catch(() => false)
  if (hasRuntime) {
    const ready = await page.waitForFunction(() => window.__engagrFrame && window.__engagrFrame.ready === true, { timeout: timeoutMs })
      .then(() => true)
      .catch(() => false)
    if (!ready) throw new Error(`runtime_not_ready after ${timeoutMs}ms`)
    const duration = await page.evaluate((fallback) => {
      const runtime = window.__engagrFrame
      const value = runtime && typeof runtime.duration === 'number' ? runtime.duration : null
      return value && isFinite(value) && value > 0 ? value : fallback
    }, fallbackDurationSec)
    return { mode: 'runtime', duration: duration > 0 ? duration : fallbackDurationSec }
  }

  const gDuration = await page.evaluate(() => {
    const g = window.gsap
    const c = g && g.globalTimeline && g.globalTimeline.getChildren(false)
    const tl = c && c[0]
    if (!tl) return null
    const total = typeof tl.totalDuration === 'function' ? tl.totalDuration() : null
    if (typeof total === 'number' && isFinite(total) && total > 0) return total
    const duration = typeof tl.duration === 'function' ? tl.duration() : null
    return (typeof duration === 'number' && isFinite(duration) && duration > 0) ? duration : null
  })
  return { mode: 'legacy_gsap', duration: (typeof gDuration === 'number' && gDuration > 0) ? gDuration : fallbackDurationSec }
}

export async function seekFrameRuntime(page, mode, timeSeconds) {
  if (mode === 'runtime') {
    await page.evaluate(async (seekT) => {
      const runtime = window.__engagrFrame
      if (!runtime || typeof runtime.seek !== 'function') throw new Error('runtime seek unavailable')
      await runtime.seek(seekT)
    }, timeSeconds)
  } else {
    await page.evaluate((seekT) => {
      const g = window.gsap
      const c = g && g.globalTimeline && g.globalTimeline.getChildren(false)
      const tl = c && c[0]
      if (tl && typeof tl.pause === 'function') tl.pause()
      if (tl && typeof tl.seek === 'function') tl.seek(seekT)
    }, timeSeconds)
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
}

export function sanitizeUrl(value) {
  if (!value) return value
  if (/^(data|blob):/i.test(value)) return `${value.split(':', 1)[0]}:[redacted]`
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return String(value).replace(/([?][^\s#]*)/g, '?[redacted]').replace(/(#[^\s]*)/g, '#[redacted]')
  }
}

function truncate(value, max = 300) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}...` : text
}
