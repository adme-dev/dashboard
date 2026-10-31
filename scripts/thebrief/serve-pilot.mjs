import { createServer } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// Private, local-only comparison server. Never expose source exports publicly.
const root = await realpath(process.argv[2] || '.')
const port = Number(process.argv[3] || 8776)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' }
const csp = 'default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' data: https://fonts.gstatic.com; img-src \'self\' data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\''
createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', csp)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cache-Control', 'no-store')
  // Sandboxed comparisons have opaque origins; local fonts require CORS.
  response.setHeader('Access-Control-Allow-Origin', '*')
  try {
    if (request.headers.host !== `127.0.0.1:${port}` || !['GET', 'HEAD'].includes(request.method)) throw new Error('Unsupported request')
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname)
    const file = await realpath(resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`))
    if (!file.startsWith(root + sep) || !types[extname(file)]) throw new Error('Unsupported path')
    const body = await readFile(file)
    response.setHeader('Content-Type', types[extname(file)])
    response.setHeader('Accept-Ranges', 'bytes')
    // Media seeking needs byte ranges; serve one bounded range when requested.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '')
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1
      if (start > end || start >= body.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end()
        return
      }
      response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 })
      response.end(request.method === 'HEAD' ? undefined : body.subarray(start, end + 1))
      return
    }
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    response.writeHead(404).end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`Private pilot: http://127.0.0.1:${port}/`))
