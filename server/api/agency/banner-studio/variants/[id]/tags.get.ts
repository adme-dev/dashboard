import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Variant ID is required' })
  }

  const query = getQuery(event)
  const tagType = (query.type as string) || 'all'

  const row = await queryOne(`
    SELECT
      id, url, width, height, format_key AS "formatKey",
      row_index AS "rowIndex", click_url AS "clickUrl"
    FROM banner_variants
    WHERE id = $1 AND is_live = TRUE
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Variant not found or not live' })
  }

  const safeUrl = escapeHtml(row.url)
  const tags: Array<{ type: string; code: string; label: string }> = []

  if (tagType === 'all' || tagType === 'iframe') {
    tags.push({
      type: 'iframe',
      label: 'iframe Embed',
      code: `<iframe src="${safeUrl}" width="${row.width}" height="${row.height}" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" style="border:none;overflow:hidden;"></iframe>`,
    })
  }

  if (tagType === 'all' || tagType === 'javascript') {
    const divId = `var-${row.formatKey}-r${row.rowIndex}-${row.id.slice(0, 8)}`
    tags.push({
      type: 'javascript',
      label: 'JavaScript Tag',
      code: `<div id="${divId}" style="width:${row.width}px;height:${row.height}px;position:relative;overflow:hidden;">
  <iframe src="${safeUrl}" width="${row.width}" height="${row.height}" frameborder="0" scrolling="no" style="border:none;"></iframe>
</div>
<script>
(function(){
  var c=document.getElementById("${divId}");
  if(c){c.style.display="block";}
})();
<\/script>`,
    })
  }

  if (tagType === 'all' || tagType === 'amphtml') {
    tags.push({
      type: 'amphtml',
      label: 'AMP HTML',
      code: `<amp-ad
  width="${row.width}"
  height="${row.height}"
  type="custom"
  data-url="${safeUrl}">
</amp-ad>`,
    })
  }

  if (tagType === 'all' || tagType === 'direct') {
    tags.push({
      type: 'direct',
      label: 'Direct URL',
      code: row.url,
    })
  }

  return {
    variantId: row.id,
    formatKey: row.formatKey,
    rowIndex: row.rowIndex,
    width: row.width,
    height: row.height,
    url: row.url,
    tags,
  }
})
