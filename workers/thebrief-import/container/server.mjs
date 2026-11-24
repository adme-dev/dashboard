import { createServer } from 'node:http'
import { prepareTheBriefGroup, MAX_THEBRIEF_ZIP_BYTES } from '../../../scripts/thebrief/prepare-group.mjs'

let busy = false
export function createImportServer() {
  return createServer(async (request, response) => {
    const send = async (status, body) => {
      if (response.destroyed) return
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      await new Promise((resolve) => {
        response.once('finish', resolve)
        response.once('close', resolve)
        response.end(JSON.stringify(body))
      })
    }
    if (request.method !== 'POST' || request.url !== '/prepare') return send(404, { message: 'Not found' })
    if (busy) return send(429, { message: 'Another group is being prepared; try again shortly' })
    if (Number(request.headers['content-length']) > MAX_THEBRIEF_ZIP_BYTES) return send(413, { message: 'TheBrief ZIP exceeds 64 MB' })
    busy = true
    try {
      const chunks = []
      let length = 0
      for await (const chunk of request) {
        length += chunk.length
        if (length > MAX_THEBRIEF_ZIP_BYTES) return send(413, { message: 'TheBrief ZIP exceeds 64 MB' })
        chunks.push(chunk)
      }
      const fileName = decodeURIComponent(String(request.headers['x-thebrief-filename'] || 'TheBrief.zip')).slice(0, 250)
      const result = await prepareTheBriefGroup(Buffer.concat(chunks, length), fileName)
      await send(200, result)
    } catch (cause) {
      if (!response.headersSent) await send(422, { message: cause instanceof Error ? cause.message.slice(0, 500) : 'This ZIP could not be prepared' })
    } finally { busy = false }
  })
}

if (process.env.THEBRIEF_IMPORT_SERVER === '1') {
  const server = createImportServer()
  server.requestTimeout = 240000
  server.listen(8080, '0.0.0.0')
  process.on('SIGTERM', () => server.close(() => process.exit(0)))
}
