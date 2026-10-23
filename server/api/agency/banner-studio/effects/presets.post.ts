import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { bannerEffectRecipeSchema } from '~~/shared/bannerEffects'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'
import { requireBannerEffectProject } from '~~/server/utils/banner/effectScope'
import { resolveDesignReferences } from '~~/server/utils/banner/designReferences'

const schema = z.object({ projectId: z.string().uuid(), name: z.string().trim().min(1).max(100), scope: z.enum(['client', 'agency']), recipe: bannerEffectRecipeSchema }).strict()
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid effect preset' })
  const { projectId, scope, name, recipe } = parsed.data
  const project = await requireBannerEffectProject(event, projectId)
  const clientId = scope === 'client' ? project.client_id : null
  if (scope === 'client' && !clientId) throw createError({ statusCode: 400, statusMessage: 'Assign this project to a client first' })
  if (scope === 'agency') await requireSocialClientScope(event, undefined)
  if (recipe.referenceIds.length) {
    const refProject = await requireBannerEffectProject(event, recipe.referenceProjectId)
    if (refProject.client_id !== clientId) throw createError({ statusCode: 403, statusMessage: 'References must belong to the preset client or agency scope' })
    await resolveDesignReferences(event, refProject.id, clientId, recipe.referenceIds)
  }
  const preset = await queryOne(`INSERT INTO banner_effect_presets(name,client_id,recipe,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,client_id AS "clientId",recipe`, [name, clientId, JSON.stringify(recipe), user.id])
  return { preset }
})
