import { Container, ContainerProxy } from '@cloudflare/containers'
import { z } from 'zod'
import { SendScanResultSchema } from '../../../shared/types/sendScan'

export { ContainerProxy }

const ScanSourceSchema = z.object({
  jobId: z.string().uuid(),
  objectKey: z.string().min(1).max(1024),
  objectEtag: z.string().trim().min(1).max(255),
  expectedMimeType: z.string().trim().min(1).max(255)
}).strict()

type ScanSource = z.infer<typeof ScanSourceSchema>
type ScannerContainerStub = DurableObjectStub & {
  getScanSource(): Promise<ScanSource | null>
}

async function boundedText(response: Response, maxBytes = 64 * 1024): Promise<string> {
  if (!response.body) throw new Error('Scanner returned no response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let value = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maxBytes) throw new Error('Scanner response exceeded its contract limit')
      value += decoder.decode(chunk.value, { stream: true })
    }
    return value + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

export class ClamAvContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
  enableInternet = false
  interceptHttps = true
  allowedHosts = ['send-scan.r2', 'database.clamav.net']
  envVars = {
    SCAN_MAX_BYTES: String(2 * 1024 * 1024 * 1024)
  }

  async scan(input: ScanSource): Promise<unknown> {
    const source = ScanSourceSchema.parse(input)
    await this.ctx.storage.put('scanSource', source)
    try {
      const response = await this.containerFetch('http://container/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          jobId: source.jobId,
          objectEtag: source.objectEtag,
          expectedMimeType: source.expectedMimeType
        })
      })
      if (!response.ok) throw new Error('Scanner adapter rejected the job')
      return SendScanResultSchema.parse(JSON.parse(await boundedText(response)))
    } finally {
      await this.ctx.storage.delete('scanSource')
    }
  }

  async getScanSource(): Promise<ScanSource | null> {
    const value = await this.ctx.storage.get('scanSource')
    const parsed = ScanSourceSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  }

  override onStart(): void {
    console.log(JSON.stringify({ event: 'send_scan_container_started' }))
  }

  override onError(): void {
    console.error(JSON.stringify({
      event: 'send_scan_container_error',
      reasonCode: 'CONTAINER_RUNTIME_ERROR'
    }))
  }
}

ClamAvContainer.outboundByHost = {
  'send-scan.r2': async (request, env: Env, context) => {
    const url = new URL(request.url)
    if (request.method !== 'GET' || url.pathname !== '/object' || url.search || url.hash) {
      return new Response(null, { status: 403 })
    }
    const id = env.SCAN_CONTAINER.idFromString(context.containerId)
    const stub = env.SCAN_CONTAINER.get(id) as ScannerContainerStub
    const source = await stub.getScanSource()
    if (!source) return new Response(null, { status: 404 })
    const object = await env.MEDIA_BUCKET.get(source.objectKey, {
      onlyIf: { etagMatches: source.objectEtag }
    })
    if (!object || !('body' in object) || object.etag !== source.objectEtag) {
      return new Response(null, { status: 412 })
    }
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        'Content-Length': String(object.size),
        'X-Object-ETag': object.etag,
        'Cache-Control': 'no-store'
      }
    })
  },
  'database.clamav.net': (request) => {
    const url = new URL(request.url)
    const isDatabaseRead = (request.method === 'GET' || request.method === 'HEAD')
      && !url.search
      && !url.hash
      && /^\/(main|daily|bytecode)\.(cvd|cld|cdiff)$/.test(url.pathname)
    if (!isDatabaseRead) return new Response(null, { status: 403 })
    return fetch(request)
  }
}
