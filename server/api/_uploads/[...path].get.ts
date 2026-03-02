/**
 * Serve locally-uploaded files in dev (when R2 is not configured).
 * GET /api/_uploads/banner-assets/user-id/uuid/file.png
 */
import { promises as fs } from 'fs'
import { join, extname } from 'path'

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.json': 'application/json',
}

const LOCAL_UPLOAD_DIR = join(process.cwd(), 'server', 'uploads')

export default eventHandler(async (event) => {
  const pathParam = getRouterParam(event, 'path')
  if (!pathParam) {
    throw createError({ statusCode: 400, statusMessage: 'Path is required' })
  }

  // Prevent path traversal
  const normalized = pathParam.replace(/\.\./g, '')
  const filePath = join(LOCAL_UPLOAD_DIR, normalized)
  if (!filePath.startsWith(LOCAL_UPLOAD_DIR)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  try {
    const buffer = await fs.readFile(filePath)
    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    setResponseHeader(event, 'Content-Type', contentType)
    setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
    return buffer
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }
})
