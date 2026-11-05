import { z } from 'zod'

export const PageStudioTemplateCardSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(160), category: z.literal('automotive'),
  versionId: z.string().uuid(), format: z.enum(['code-pages', 'typed']), status: z.enum(['preparing', 'ready']),
  thumbnail: z.null(), canPreview: z.boolean(), canUse: z.boolean(),
  unavailableReason: z.string().min(1).max(200).nullable()
}).strict().refine(card => (!card.canPreview || card.status === 'ready') && (!card.canUse || card.canPreview), 'Ready actions require a published preview and supported copy format')
export type PageStudioTemplateCard = z.infer<typeof PageStudioTemplateCardSchema>
export const PageStudioTemplateListQuery = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict()
export const PageStudioTemplateListSchema = z.object({ items: z.array(PageStudioTemplateCardSchema).max(50), nextCursor: z.string().uuid().nullable() }).strict()
export type PageStudioTemplateList = z.infer<typeof PageStudioTemplateListSchema>

export const PageStudioTemplatePreviewSchema = z.object({ versionId: z.string().uuid(), url: z.string().url() }).strict()
export const PageStudioTemplateUseSchema = z.object({ requestId: z.string().uuid(), versionId: z.string().uuid(), siteId: z.string().uuid(), status: z.enum(['preparing', 'ready']) }).strict()
export const PageStudioTemplateUseRequest = z.object({ requestId: z.string().uuid(), name: z.string().trim().min(1).max(160), route: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), clientId: z.string().uuid().optional() }).strict()
