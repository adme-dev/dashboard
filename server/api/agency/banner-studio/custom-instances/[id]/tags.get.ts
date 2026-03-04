import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  const row = await queryOne(`
    SELECT id, name, published_url, width, height
    FROM banner_custom_instances
    WHERE id = $1 AND is_published = TRUE
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Instance not published' })
  }

  const safeUrl = escapeHtml(row.published_url)
  const w = row.width || 300
  const h = row.height || 250
  const divId = `custom-ad-${row.id.slice(0, 8)}`

  const tags = [
    {
      type: 'iframe',
      label: 'iframe Embed',
      code: `<iframe src="${safeUrl}" width="${w}" height="${h}" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" style="border:none;overflow:hidden;"></iframe>`,
    },
    {
      type: 'javascript',
      label: 'JavaScript Tag',
      code: `<div id="${divId}" style="width:${w}px;height:${h}px;position:relative;overflow:hidden;">
  <iframe src="${safeUrl}" width="${w}" height="${h}" frameborder="0" scrolling="no" style="border:none;"></iframe>
</div>
<script>
(function(){
  var c=document.getElementById("${divId}");
  if(c){c.style.display="block";}
})();
<\/script>`,
    },
    {
      type: 'amphtml',
      label: 'AMP HTML',
      code: `<amp-ad
  width="${w}"
  height="${h}"
  type="custom"
  data-url="${safeUrl}">
</amp-ad>`,
    },
    {
      type: 'direct',
      label: 'Direct URL',
      code: row.published_url,
    },
  ]

  return {
    instanceId: row.id,
    name: row.name,
    width: w,
    height: h,
    url: row.published_url,
    tags,
  }
})
