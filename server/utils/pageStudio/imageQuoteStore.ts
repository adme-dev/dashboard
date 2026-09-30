import { z } from 'zod'
import { ImageActorSchema, ImageQuoteSchema, type ImageQuote } from '~~/shared/pageStudio/imageGeneration'
import { PageStudioContentScopeSchema, samePageStudioContentScope, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from './controlStore'
import { ImageCreditError } from './imageCredits'

type Actor = z.infer<typeof ImageActorSchema>
type QuoteRow = { quote: unknown, fingerprint: string, expired: boolean }
const notFound = () => new ImageCreditError('IMAGE_QUOTE_NOT_FOUND', 404, 'Image quote not found')
const expired = () => new ImageCreditError('IMAGE_QUOTE_EXPIRED', 410, 'This image quote expired. Review a new quote before generating.')
function key(scope: PageStudioContentScope, actor: Actor) {
  const validated = PageStudioContentScopeSchema.parse(scope)
  const owner = ImageActorSchema.parse(actor)
  return [validated.tenantId, validated.clientId, validated.siteId, validated.environment, owner.actorRole, owner.actorId]
}
function decode(row: QuoteRow | undefined, scope: PageStudioContentScope, actor: Actor): ImageQuote {
  if (!row) throw notFound()
  if (row.expired) throw expired()
  const parsed = ImageQuoteSchema.safeParse(row.quote)
  if (!parsed.success || !samePageStudioContentScope(parsed.data.scope, scope) || parsed.data.actor.actorId !== actor.actorId
    || parsed.data.actor.actorRole !== actor.actorRole || parsed.data.fingerprint !== row.fingerprint) {
    throw new ImageCreditError('IMAGE_QUOTE_CORRUPT', 503, 'The saved image quote could not be verified')
  }
  return parsed.data
}

/** Trusted native transaction only. The unique intent blocks concurrent inserts;
 * the second statement gets a fresh READ COMMITTED snapshot after any lock wait. */
export async function persistImageQuote(db: PageStudioControlQueryClient, input: ImageQuote): Promise<ImageQuote> {
  const quote = ImageQuoteSchema.parse(input)
  const args = key(quote.scope, quote.actor)
  await db.query(`INSERT INTO page_studio_image_quotes(tenant_id,client_id,site_id,environment,actor_role,actor_id,intent_id,quote_id,fingerprint,quote,expires_at)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::timestamptz WHERE $11::timestamptz>clock_timestamp()
    ON CONFLICT(tenant_id,client_id,site_id,environment,actor_role,actor_id,intent_id) DO NOTHING`,
  [...args, quote.intentId, quote.quoteId, quote.fingerprint, JSON.stringify(quote), quote.expiresAt])
  const row = (await db.query<QuoteRow>(`SELECT quote,fingerprint,expires_at<=clock_timestamp() AS expired FROM page_studio_image_quotes
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND environment=$4 AND actor_role=$5 AND actor_id=$6 AND intent_id=$7`, [...args, quote.intentId])).rows[0]
  if (!row) throw expired()
  if (row.fingerprint !== quote.fingerprint) throw new ImageCreditError('IMAGE_QUOTE_CONFLICT', 409, 'This image request already has different saved inputs')
  return decode(row, quote.scope, quote.actor)
}
export async function readImageQuote(db: PageStudioControlQueryClient, scope: PageStudioContentScope, actor: Actor, quoteId: string): Promise<ImageQuote> {
  if (!z.string().uuid().safeParse(quoteId).success) throw notFound()
  const row = (await db.query<QuoteRow>(`SELECT quote,fingerprint,expires_at<=clock_timestamp() AS expired FROM page_studio_image_quotes
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND environment=$4 AND actor_role=$5 AND actor_id=$6 AND quote_id=$7`, [...key(scope, actor), quoteId])).rows[0]
  const quote = decode(row, scope, actor)
  if (quote.quoteId !== quoteId) throw notFound()
  return quote
}
