import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { fetchMetaSourcePostImage } from '~~/server/utils/socialInbox/sourcePostMedia'

interface SourcePostRecord {
  platform: string
  source_post_id: string | null
  access_token: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const source = await queryOne<SourcePostRecord>(
    `SELECT conversation.platform, conversation.source_post_id, account.access_token
       FROM social_conversations AS conversation
       JOIN social_accounts AS account ON account.id = conversation.social_account_id
      WHERE conversation.id = $1
        AND account.is_active = TRUE`,
    [id]
  )
  if (!source?.source_post_id) {
    throw createError({ statusCode: 404, statusMessage: 'Source post image not available' })
  }

  const image = await fetchMetaSourcePostImage({
    platform: source.platform,
    sourcePostId: source.source_post_id,
    accessToken: source.access_token
  })
  if (!image) {
    throw createError({ statusCode: 404, statusMessage: 'Source post image not available' })
  }

  return new Response(image.body, {
    headers: {
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(image.body.byteLength),
      'Content-Type': image.contentType,
      'X-Content-Type-Options': 'nosniff'
    }
  })
})
