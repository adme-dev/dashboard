// Local workerd proof only. Never imported by the deployment entrypoint.
import { gifEncoder } from '../src/codec'

export default {
  async fetch(request: Request) {
    const bytes = new Uint8Array(await request.arrayBuffer())
    const encoder = gifEncoder(2, 2, 200)
    encoder.frame(bytes)
    return new Response(new Uint8Array(encoder.finish()).buffer, { headers: { 'content-type': 'image/gif' } })
  }
}
