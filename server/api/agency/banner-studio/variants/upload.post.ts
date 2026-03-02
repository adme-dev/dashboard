import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { projectId, feedId, formatKey, html, width, height, rowIndex, rowData, clickUrl } = body

  if (!projectId || !feedId || !formatKey || !html) {
    throw createError({ statusCode: 400, statusMessage: 'projectId, feedId, formatKey, and html are required' })
  }
  if (!width || !height || width < 1 || height < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Valid width and height are required' })
  }
  if (rowIndex === undefined || rowIndex === null || rowIndex < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid rowIndex is required' })
  }

  if (clickUrl && !isValidHttpUrl(clickUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'clickUrl must be a valid HTTP(S) URL' })
  }

  // Verify project and feed exist
  const project = await queryOne('SELECT id FROM banner_projects WHERE id = $1', [projectId])
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const feed = await queryOne('SELECT id FROM banner_feeds WHERE id = $1 AND project_id = $2', [feedId, projectId])
  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  // Inject click-through wrapper if clickUrl is provided
  let finalHtml = html
  if (clickUrl) {
    finalHtml = finalHtml.replace(
      '<div class="ad">',
      `<a href="${escapeHtml(clickUrl)}" target="_blank" rel="noopener" style="text-decoration:none;display:block;"><div class="ad" style="cursor:pointer;">`,
    )
    finalHtml = finalHtml.replace(
      /<\/div>\s*(<script|<\/body)/,
      '</div></a>$1',
    )
  }

  // Upload to R2 with deterministic path
  const r2Key = `banner-variants/${projectId}/${formatKey}/${rowIndex}/index.html`
  const buffer = Buffer.from(finalHtml, 'utf-8')
  const { url } = await uploadFile(buffer, r2Key, 'text/html')

  // Upsert variant record
  const row = await queryOne(`
    INSERT INTO banner_variants (
      project_id, feed_id, format_key, row_index, row_data,
      r2_key, url, width, height, file_size, click_url, generated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (project_id, feed_id, format_key, row_index)
    DO UPDATE SET
      row_data = $5, r2_key = $6, url = $7,
      file_size = $10, click_url = $11,
      generated_by = $12, generated_at = NOW(), is_live = TRUE
    RETURNING
      id, project_id AS "projectId", feed_id AS "feedId",
      format_key AS "formatKey", row_index AS "rowIndex",
      row_data AS "rowData", r2_key AS "r2Key", url,
      width, height, file_size AS "fileSize",
      click_url AS "clickUrl", is_live AS "isLive",
      generated_by AS "generatedBy", generated_at AS "generatedAt"
  `, [
    projectId, feedId, formatKey, rowIndex, JSON.stringify(rowData || {}),
    r2Key, url, width, height, buffer.length, clickUrl || null, user.id,
  ])

  return row
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
