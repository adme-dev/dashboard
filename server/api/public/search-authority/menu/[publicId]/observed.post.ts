import { getRouterParam, setHeader } from 'h3'
import { z } from 'zod'
import { execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const publicId = z.string().uuid().safeParse(getRouterParam(event, 'publicId'))
  if (!publicId.success) throw createError({ statusCode: 404, statusMessage: 'Menu configuration not found' })
  const updated = await execute(`UPDATE search_authority_menu_configs
    SET last_observed_at = NOW()
    WHERE public_id = $1 AND enabled = TRUE
      AND (last_observed_at IS NULL OR last_observed_at < NOW() - INTERVAL '15 minutes')`, [publicId.data])
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'no-store')
  return { ok: updated > 0 }
})
