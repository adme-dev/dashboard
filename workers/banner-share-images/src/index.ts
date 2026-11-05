import { bannerShareCaptureOptions } from '../../../shared/bannerShareCapture'

interface Env {
  BROWSER: { quickAction: (action: 'screenshot', options: Record<string, unknown>) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/screenshot') return new Response(null, { status: 404 })
    if (Number(request.headers.get('content-length')) > 3 * 1024 * 1024) return new Response(null, { status: 413 })
    let input: { html?: unknown, width?: unknown, height?: unknown, time?: unknown }
    try { input = await request.json() } catch { return new Response(null, { status: 400 }) }
    if (!input || typeof input !== 'object') return new Response(null, { status: 400 })
    const { html, width, height, time } = input
    if (typeof html !== 'string' || html.length > 2 * 1024 * 1024
      || typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > 1200
      || typeof height !== 'number' || !Number.isInteger(height) || height < 1 || height > 1200
      || typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > 3) {
      return new Response(null, { status: 400 })
    }
    return env.BROWSER.quickAction('screenshot', bannerShareCaptureOptions(html, width, height, time))
  }
}
