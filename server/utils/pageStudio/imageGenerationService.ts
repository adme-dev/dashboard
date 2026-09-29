import { z } from 'zod'
import { ImageQuoteReceiptSchema, ImageQuoteRequestSchema, type ImageQuoteReceipt } from '~~/shared/pageStudio/imageGeneration'
import type { ContentAuthorityRequest } from './businessContent'
import { withImageGenerationAuthority } from './imageGenerationAuthority'
import { buildImageQuote, imageModelCatalog } from './imageQuotes'
import { persistImageQuote } from './imageQuoteStore'
import { ImageCreditError, ImageCreditHistoryCursorSchema, readImageCredits, readImageCreditHistory, type ImageCreditBalance } from './imageCredits'

type Dependencies = Parameters<typeof withImageGenerationAuthority>[3]
export type ImageNativeOperation = 'catalog' | 'account' | 'quote'
export const ImageAccountRequestSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), before: ImageCreditHistoryCursorSchema.optional() }).strict()
export function parseImageOperationInput(operation: ImageNativeOperation, input: unknown) {
  const schema = operation === 'quote' ? ImageQuoteRequestSchema : operation === 'account' ? ImageAccountRequestSchema : z.object({}).strict()
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new ImageCreditError('IMAGE_REQUEST_INVALID', 400, 'Invalid image request')
  return parsed.data
}
type Catalog = { models: ReturnType<typeof imageModelCatalog>, balance: ImageCreditBalance, canGenerate: boolean, canPurchase: boolean }
type Account = { balance: ImageCreditBalance, canPurchase: boolean, history: Awaited<ReturnType<typeof readImageCreditHistory>> }
type QuoteReceipt = { quote: ImageQuoteReceipt }
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'quote', input: unknown, dependencies?: Dependencies): Promise<QuoteReceipt>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'catalog', input: unknown, dependencies?: Dependencies): Promise<Catalog>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'account', input: unknown, dependencies?: Dependencies): Promise<Account>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: ImageNativeOperation, input: unknown, dependencies?: Dependencies): Promise<QuoteReceipt | Catalog | Account>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: ImageNativeOperation, input: unknown, dependencies: Dependencies = {}): Promise<QuoteReceipt | Catalog | Account> {
  const parsed = parseImageOperationInput(operation, input)
  return withImageGenerationAuthority(request, operation === 'quote', async (db, context) => {
    const { scope } = context
    if (operation === 'quote') {
      if (!context.config) throw new ImageCreditError('IMAGE_GENERATION_UNAVAILABLE', 503, 'Image generation is not configured for this website')
      const quote = await persistImageQuote(db, await buildImageQuote(context.config, scope, context.actor, parsed))
      // Pick only public quote fields. No native scope, actor or provider routing leaks.
      const { scope: _scope, actor: _actor, gatewayId: _gateway, fingerprint: _fingerprint, policyVersion: _policy, ...receipt } = quote
      return { quote: ImageQuoteReceiptSchema.parse(receipt) }
    }
    if (scope.environment === 'preview') throw new ImageCreditError('IMAGE_GENERATION_UNAVAILABLE', 503, 'Image credits require a configured environment')
    const walletScope = { tenantId: scope.tenantId, clientId: scope.clientId, environment: scope.environment }
    const balance = await readImageCredits(db, walletScope)
    if (operation === 'catalog') return { models: context.config ? imageModelCatalog(context.config) : [], balance, canGenerate: context.canGenerate, canPurchase: context.canPurchase }
    const options = ImageAccountRequestSchema.parse(parsed)
    return { balance, canPurchase: context.canPurchase, history: await readImageCreditHistory(db, walletScope, {
      ...options, ...(context.canPurchase ? {} : { siteId: scope.siteId })
    }) }
  }, dependencies)
}
