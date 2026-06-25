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
