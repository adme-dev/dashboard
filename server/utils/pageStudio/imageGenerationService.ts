import { z } from 'zod'
import { ImageQuoteReceiptSchema, ImageQuoteRequestSchema, type ImageQuoteReceipt, ImageLibraryRequestSchema, type ImageJobReceipt } from '~~/shared/pageStudio/imageGeneration'
import type { ContentAuthorityRequest } from './businessContent'
import { withImageGenerationAuthority, withStudioImageAuthority, type ImageGenerationContext } from './imageGenerationAuthority'
import { buildImageQuote, imageModelCatalog } from './imageQuotes'
import { createImageJob, readImageJob, readImageJobs, readImageLibrary, type ImageJobPrincipal } from './imageJobs'
import { persistImageQuote, readImageQuote } from './imageQuoteStore'
import { ImageCreditError, ImageCreditHistoryCursorSchema, readImageCredits, readImageCreditHistory, type ImageCreditBalance } from './imageCredits'

import type { PageStudioControlQueryClient } from './controlStore'
import type { PageStudioSessionClaims } from './sessions'

type Dependencies = Parameters<typeof withImageGenerationAuthority>[3]
export type ImageNativeOperation = 'catalog' | 'account' | 'quote' | 'generate' | 'read' | 'jobs' | 'library'
export const ImageAccountRequestSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), before: ImageCreditHistoryCursorSchema.optional() }).strict()
export const ImageGenerateRequestSchema = z.object({ quoteId: z.string().uuid() }).strict()
export const ImageReadRequestSchema = z.object({ jobId: z.string().uuid() }).strict()
export const ImageJobsRequestSchema = ImageLibraryRequestSchema.extend({ limit: z.coerce.number().int().min(1).max(50).default(20) })
export function parseImageOperationInput(operation: ImageNativeOperation, input: unknown) {
  const schemas = { quote: ImageQuoteRequestSchema, account: ImageAccountRequestSchema, catalog: z.object({}).strict(), generate: ImageGenerateRequestSchema, read: ImageReadRequestSchema, jobs: ImageJobsRequestSchema, library: ImageJobsRequestSchema }
  const schema = schemas[operation]
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new ImageCreditError('IMAGE_REQUEST_INVALID', 400, 'Invalid image request')
  return parsed.data
}
type Catalog = { models: ReturnType<typeof imageModelCatalog>, balance: ImageCreditBalance, canGenerate: boolean, canPurchase: boolean }
type Account = { balance: ImageCreditBalance, canPurchase: boolean, history: Awaited<ReturnType<typeof readImageCreditHistory>> }
type QuoteReceipt = { quote: ImageQuoteReceipt }
type JobReceipt = { job: ImageJobReceipt }
type JobList = Awaited<ReturnType<typeof readImageJobs>>
type Result = QuoteReceipt | Catalog | Account | JobReceipt | JobList
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'quote', input: unknown, dependencies?: Dependencies): Promise<QuoteReceipt>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'catalog', input: unknown, dependencies?: Dependencies): Promise<Catalog>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'account', input: unknown, dependencies?: Dependencies): Promise<Account>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'generate' | 'read', input: unknown, dependencies?: Dependencies): Promise<JobReceipt>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: 'jobs' | 'library', input: unknown, dependencies?: Dependencies): Promise<JobList>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: ImageNativeOperation, input: unknown, dependencies?: Dependencies): Promise<Result>
export function executeNativeImageOperation(request: ContentAuthorityRequest, operation: ImageNativeOperation, input: unknown, dependencies: Dependencies = {}): Promise<Result> {
  const parsed = parseImageOperationInput(operation, input)
  const principal: ImageJobPrincipal = { source: 'native-login', login: {
    ...request.login, issuedAt: request.login.issuedAt.toISOString(), expiresAt: request.login.expiresAt.toISOString()
  } }
  return withImageGenerationAuthority(request, operation === 'quote' || operation === 'generate',
    (db, context) => executeAuthorizedImageOperation(db, context, principal, operation, parsed), dependencies)
}
export function executeStudioImageOperation(claims: PageStudioSessionClaims, env: Record<string, unknown>, operation: Exclude<ImageNativeOperation, 'account'>, input: unknown, dependencies: Dependencies = {}): Promise<Result> {
  const parsed = parseImageOperationInput(operation, input)
  return withStudioImageAuthority(claims, env, operation === 'quote' || operation === 'generate',
    (db, context) => executeAuthorizedImageOperation(db, context, { source: 'studio-session', claims }, operation, parsed), dependencies)
}
async function executeAuthorizedImageOperation(db: PageStudioControlQueryClient, context: ImageGenerationContext, principal: ImageJobPrincipal, operation: ImageNativeOperation, parsed: unknown): Promise<Result> {
  const { scope } = context
  if (operation === 'quote') {
    if (!context.config) throw new ImageCreditError('IMAGE_GENERATION_UNAVAILABLE', 503, 'Image generation is not configured for this website')
    const quote = await persistImageQuote(db, await buildImageQuote(context.config, scope, context.actor, parsed))
    // Pick only public quote fields. No native scope, actor or provider routing leaks.
    const { scope: _scope, actor: _actor, gatewayId: _gateway, fingerprint: _fingerprint, policyVersion: _policy, ...receipt } = quote
    return { quote: ImageQuoteReceiptSchema.parse(receipt) }
  }
  if (operation === 'generate') {
    const { quoteId } = ImageGenerateRequestSchema.parse(parsed)
    // Existing jobs recover even after quote expiry. New generation must still
    // use a model and Gateway admitted by the current server configuration.
    const existing = await readImageJob(db, scope, quoteId).catch((error) => {
      if (error instanceof ImageCreditError && error.statusCode === 404) return null
      throw error
    })
    if (!existing) {
      const quote = await readImageQuote(db, scope, context.actor, quoteId)
      if (!context.config || quote.gatewayId !== context.config.gatewayId || !context.config.models.some(model => model.id === quote.modelId)) {
        throw new ImageCreditError('IMAGE_GENERATION_UNAVAILABLE', 503, 'This image model is no longer available. Review a new quote.')
      }
    }
    return { job: await createImageJob(db, scope, context.actor, quoteId, principal) }
  }
  if (operation === 'read') return { job: await readImageJob(db, scope, ImageReadRequestSchema.parse(parsed).jobId) }
  if (operation === 'jobs' || operation === 'library') {
    const options = ImageJobsRequestSchema.parse(parsed)
    return operation === 'jobs' ? readImageJobs(db, scope, options) : readImageLibrary(db, scope, options)
  }
  if (scope.environment === 'preview') throw new ImageCreditError('IMAGE_GENERATION_UNAVAILABLE', 503, 'Image credits require a configured environment')
  const walletScope = { tenantId: scope.tenantId, clientId: scope.clientId, environment: scope.environment }
  const balance = await readImageCredits(db, walletScope)
  if (operation === 'catalog') return { models: context.config ? imageModelCatalog(context.config) : [], balance, canGenerate: context.canGenerate, canPurchase: context.canPurchase }
  const options = ImageAccountRequestSchema.parse(parsed)
  return { balance, canPurchase: context.canPurchase, history: await readImageCreditHistory(db, walletScope, {
    ...options, ...(context.canPurchase ? {} : { siteId: scope.siteId })
  }) }
}
