import { defineEventHandler, getQuery } from 'h3'
import { queryRowsFresh } from '~~/server/utils/db'
import { requireBannerEffectProject } from '~~/server/utils/banner/effectScope'

export default defineEventHandler(async (event) => {
  const project = await requireBannerEffectProject(event, getQuery(event).projectId)
  const presets = await queryRowsFresh(`SELECT id,name,client_id AS "clientId",recipe,created_at AS "createdAt" FROM banner_effect_presets WHERE archived_at IS NULL AND (client_id IS NULL OR client_id=$1) ORDER BY created_at DESC LIMIT 100`, [project.client_id])
  return { presets }
})
