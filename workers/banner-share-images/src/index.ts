import { bannerShareCaptureOptions } from '../../../shared/bannerShareCapture'

interface Env {
  BROWSER: { quickAction: (action: 'screenshot', options: Record<string, unknown>) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    const exporting = path === '/export-slide'
    if (request.method !== 'POST' || (!exporting && path !== '/screenshot')) return new Response(null, { status: 404 })
    if (Number(request.headers.get('content-length')) > 3 * 1024 * 1024) return new Response(null, { status: 413 })
    let input: { html?: unknown, width?: unknown, height?: unknown, time?: unknown, quality?: unknown }
    try {
      input = await request.json()
    } catch {
      return new Response(null, { status: 400 })
    }
    if (!input || typeof input !== 'object') return new Response(null, { status: 400 })
    const { html, width, height, time, quality } = input
    const limit = exporting ? 8000 : 1200
    if (typeof html !== 'string' || html.length > 2 * 1024 * 1024
      || typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > limit
      || typeof height !== 'number' || !Number.isInteger(height) || height < 1 || height > limit
      || typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > 300) {
      return new Response(null, { status: 400 })
    }
    const options = bannerShareCaptureOptions(html, width, height, time)
    if (exporting) {
      if (typeof quality !== 'number' || !Number.isInteger(quality) || quality < 1 || quality > 100) return new Response(null, { status: 400 })
      options.screenshotOptions.quality = quality
    }
    return env.BROWSER.quickAction('screenshot', options)
  }
}
