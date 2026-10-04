import { createError, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { requireSocialClientAccess, isSocialClientId } from '~~/server/utils/social/clientAccess'
import { executeGodModeTransactionMutation } from '~~/server/utils/godMode/transactionCoordinator'
import { BANNER_SOCIAL_DRAFT } from '~~/server/utils/banner/godModeSocialDraft'
import { createBannerSocialDraft } from '~~/server/utils/banner/socialDraft'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = await readBody(event)
  const jobId = body?.renderJobId
  if (typeof jobId !== 'string' || !isSocialClientId(jobId)) throw createError({ statusCode: 400, statusMessage: 'A valid render job is required' })
  return executeGodModeTransactionMutation(event, BANNER_SOCIAL_DRAFT, transaction,
    db => createBannerSocialDraft(event, jobId, user.id, db),
    async (db, id) => {
      const { rows: [post] } = await db.query(`SELECT id, client_id FROM social_posts
        WHERE id = $1 AND metadata->>'source' = 'banner_studio' AND metadata->>'renderJobId' = $2`, [id, jobId])
      if (!post) throw createError({ statusCode: 409, statusMessage: 'The original draft is no longer available' })
      await requireSocialClientAccess(event, post.client_id)
      return { id: post.id, postId: post.id, clientId: post.client_id }
    })
})
