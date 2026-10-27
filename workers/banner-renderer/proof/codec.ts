// Local workerd proof only. Never imported by the deployment entrypoint.
import { gifEncoder } from '../src/codec'
import { fetchBannerRenderResource } from '../src/render'

export default {
  async fetch(request: Request) {
    if (new URL(request.url).pathname === '/resource') {
      // Match production dependency-object invocation, not a direct global call.
      const dependencies = { fetchResource: fetchBannerRenderResource }
      return dependencies.fetchResource('https://resource.fixture.invalid/font', { method: 'GET', redirect: 'manual', credentials: 'omit' })
    }
    const bytes = new Uint8Array(await request.arrayBuffer())
    const encoder = gifEncoder(2, 2, 200)
    encoder.frame(bytes)
    return new Response(new Uint8Array(encoder.finish()).buffer, { headers: { 'content-type': 'image/gif' } })
  }
}
