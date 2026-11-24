import { Container, getContainer } from '@cloudflare/containers'

export class TheBriefImportContainer extends Container {
  defaultPort = 8080
  sleepAfter = '60s'
}

interface Env { IMPORTER: Parameters<typeof getContainer>[0] }

// No public route, workers.dev or credentials. Only the authenticated Pages
// endpoint can reach this stateless, independently bounded conversion service.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/prepare') return new Response('Not found', { status: 404 })
    if (Number(request.headers.get('content-length')) > 64 * 1024 * 1024) return Response.json({ message: 'TheBrief ZIP exceeds 64 MB' }, { status: 413 })
    try {
      const instance = getContainer(env.IMPORTER, `import-${crypto.getRandomValues(new Uint8Array(1))[0]! % 2}`)
      const response = await instance.fetch(new Request('http://container/prepare', {
        method: 'POST', body: request.body,
        headers: { 'content-type': 'application/zip', 'x-thebrief-filename': request.headers.get('x-thebrief-filename') || 'TheBrief.zip' },
        signal: AbortSignal.timeout(240000), duplex: 'half'
      } as RequestInit))
      return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    } catch {
      return Response.json({ message: 'ZIP preparation is temporarily unavailable. Your source ZIP is unchanged; try again.' }, { status: 503 })
    }
  }
}
