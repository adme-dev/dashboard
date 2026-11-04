import { z } from 'zod'

export const PageStudioTemplateCardSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(160), category: z.literal('automotive'),
  versionId: z.string().uuid(), format: z.enum(['code-pages', 'typed']), status: z.literal('preparing'),
  thumbnail: z.null(), canPreview: z.literal(false), canUse: z.literal(false),
  unavailableReason: z.string().min(1).max(200)
}).strict()
export type PageStudioTemplateCard = z.infer<typeof PageStudioTemplateCardSchema>
export const PageStudioTemplateListQuery = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict()
export const PageStudioTemplateListSchema = z.object({ items: z.array(PageStudioTemplateCardSchema).max(50), nextCursor: z.string().uuid().nullable() }).strict()
export type PageStudioTemplateList = z.infer<typeof PageStudioTemplateListSchema>
