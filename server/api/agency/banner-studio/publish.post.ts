import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { getAppUrl } from '~~/server/utils/appUrl'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { projectId, formatKey, html, width, height, clickUrl, impressionPixel, clickPixel } = body

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }
  if (!formatKey) {
    throw createError({ statusCode: 400, statusMessage: 'formatKey is required' })
  }
  if (!html) {
    throw createError({ statusCode: 400, statusMessage: 'html is required' })
  }
  if (!width || !height || width < 1 || height < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Valid width and height are required' })
  }

  // Validate URLs if provided
  if (clickUrl && !isValidHttpUrl(clickUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'clickUrl must be a valid HTTP(S) URL' })
  }
  if (impressionPixel && !isValidHttpUrl(impressionPixel)) {
    throw createError({ statusCode: 400, statusMessage: 'impressionPixel must be a valid HTTP(S) URL' })
  }
  if (clickPixel && !isValidHttpUrl(clickPixel)) {
    throw createError({ statusCode: 400, statusMessage: 'clickPixel must be a valid HTTP(S) URL' })
  }

  // Verify project exists
  const project = await queryOne('SELECT id, name FROM banner_projects WHERE id = $1', [projectId])
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Check for existing published version
  const existing = await queryOne(
    'SELECT id, version, r2_key FROM banner_published WHERE project_id = $1 AND format_key = $2',
    [projectId, formatKey]
  )

  const nextVersion = existing ? existing.version + 1 : 1

  // Inject click-through wrapper if clickUrl is provided
  let finalHtml = html
  if (clickUrl) {
    // Wrap the .ad div in an anchor tag for click tracking
    finalHtml = finalHtml.replace(
      '<div class="ad">',
      `<a href="${escapeHtml(clickUrl)}" target="_blank" rel="noopener" style="text-decoration:none;display:block;"><div class="ad" style="cursor:pointer;">`
    )
    finalHtml = finalHtml.replace(
      /<\/div>\s*(<script|<\/body)/,
      '</div></a>$1'
    )
  }

  // Inject tracking pixels (user-provided + built-in analytics)
  {
    const pixels: string[] = []

    // Built-in analytics pixels (using projectId+formatKey so we don't need published_id at build time)
    const appUrl = getAppUrl(event).replace(/\/$/, '')
    const basePixelUrl = `${appUrl}/api/public/banner-pixel`
    const pixelParams = `pid=${encodeURIComponent(projectId)}&fk=${encodeURIComponent(formatKey)}`
    pixels.push(`<img src="${basePixelUrl}/impression?${pixelParams}" width="1" height="1" style="position:absolute;left:-9999px;" alt="" />`)
    pixels.push(`<script>document.querySelector('.ad')?.addEventListener('click',function(){new Image().src='${basePixelUrl}/click?${pixelParams}'});<\/script>`)

    // User-provided external pixels
    if (impressionPixel) {
      pixels.push(`<img src="${escapeHtml(impressionPixel)}" width="1" height="1" style="position:absolute;left:-9999px;" alt="" />`)
    }
    if (clickPixel) {
      pixels.push(`<script>document.querySelector('.ad')?.addEventListener('click',function(){new Image().src='${escapeJs(clickPixel)}'});<\/script>`)
    }

    finalHtml = finalHtml.replace('</body>', `${pixels.join('\n')}\n</body>`)
  }

  // Upload to R2 with stable path (version in metadata, not path — so URL stays stable)
  const r2Key = `banner-hosted/${projectId}/${formatKey}/index.html`
  const buffer = Buffer.from(finalHtml, 'utf-8')
  const { url } = await uploadFile(buffer, r2Key, 'text/html')

  if (existing) {
    // Update existing record
    const row = await queryOne(`
      UPDATE banner_published
      SET version = $1, r2_key = $2, url = $3, click_url = $4, impression_pixel = $5,
          click_pixel = $6, width = $7, height = $8, file_size = $9,
          published_by = $10, updated_at = NOW(), is_live = TRUE
      WHERE id = $11
      RETURNING
        id, project_id AS "projectId", format_key AS "formatKey",
        version, r2_key AS "r2Key", url,
        click_url AS "clickUrl", impression_pixel AS "impressionPixel",
        click_pixel AS "clickPixel",
        width, height, file_size AS "fileSize",
        is_live AS "isLive",
        published_by AS "publishedBy",
        published_at AS "publishedAt",
        updated_at AS "updatedAt"
    `, [
      nextVersion, r2Key, url, clickUrl || null, impressionPixel || null,
      clickPixel || null, width, height, buffer.length,
      user.id, existing.id,
    ])

    return row
  } else {
    // Create new record
    const row = await queryOne(`
      INSERT INTO banner_published (project_id, format_key, version, r2_key, url,
        click_url, impression_pixel, click_pixel, width, height, file_size, published_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING
        id, project_id AS "projectId", format_key AS "formatKey",
        version, r2_key AS "r2Key", url,
        click_url AS "clickUrl", impression_pixel AS "impressionPixel",
        click_pixel AS "clickPixel",
        width, height, file_size AS "fileSize",
        is_live AS "isLive",
        published_by AS "publishedBy",
        published_at AS "publishedAt",
        updated_at AS "updatedAt"
    `, [
      projectId, formatKey, nextVersion, r2Key, url,
      clickUrl || null, impressionPixel || null, clickPixel || null,
      width, height, buffer.length, user.id,
    ])

    // Update project status to published
    await queryOne(
      "UPDATE banner_projects SET status = 'published', updated_at = NOW() WHERE id = $1",
      [projectId]
    )

    return row
  }
})

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeJs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
