import { z } from 'zod'

export const PAGE_STUDIO_BLOCK_TYPES = ['hero', 'text', 'image', 'cta'] as const
export const PAGE_STUDIO_BLOCK_BACKGROUNDS = ['canvas', 'muted', 'brand', 'dark'] as const
export const PAGE_STUDIO_PAGE_VISIBILITIES = ['visible', 'hidden'] as const

const PageStudioBlockSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(PAGE_STUDIO_BLOCK_TYPES),
  eyebrow: z.string().max(80).default(''),
  heading: z.string().max(180).default(''),
  body: z.string().max(6000).default(''),
  buttonLabel: z.string().max(80).default(''),
  buttonHref: z.string().max(2048).default(''),
  imageUrl: z.string().max(2048).default(''),
  imageAlt: z.string().max(300).default(''),
  alignment: z.enum(['left', 'center']).default('left'),
  background: z.enum(PAGE_STUDIO_BLOCK_BACKGROUNDS).default('canvas')
}).strict()

const PageStudioPageSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().toLowerCase().max(80).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?)?$/),
  visibility: z.enum(PAGE_STUDIO_PAGE_VISIBILITIES).default('visible'),
  seoTitle: z.string().max(160).default(''),
  seoDescription: z.string().max(320).default(''),
  blocks: z.array(PageStudioBlockSchema).max(60)
}).strict()

export const PageStudioDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(PageStudioPageSchema).min(1).max(100)
}).strict().superRefine((document, context) => {
  const ids = new Set<string>()
  const pageById = new Map(document.pages.map(page => [page.id, page]))
  const siblingSlugs = new Set<string>()
  let homeCount = 0

  document.pages.forEach((page, index) => {
    if (ids.has(page.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Page IDs must be unique', path: ['pages', index, 'id'] })
    }
    ids.add(page.id)
    if (page.parentId === page.id || (page.parentId && !pageById.has(page.parentId))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Page parent is invalid', path: ['pages', index, 'parentId'] })
    }
    if (page.parentId === null && page.slug === '') homeCount += 1
    if (page.slug === '' && page.parentId !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only the homepage can have an empty slug', path: ['pages', index, 'slug'] })
    }
    const siblingKey = `${page.parentId ?? '__root__'}:${page.slug}`
    if (siblingSlugs.has(siblingKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Sibling page slugs must be unique', path: ['pages', index, 'slug'] })
    }
    siblingSlugs.add(siblingKey)

    const visited = new Set([page.id])
    let parentId = page.parentId
    while (parentId) {
      if (visited.has(parentId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Page hierarchy cannot contain a cycle', path: ['pages', index, 'parentId'] })
        break
      }
      visited.add(parentId)
      parentId = pageById.get(parentId)?.parentId ?? null
    }
  })

  if (homeCount !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A document must contain exactly one homepage', path: ['pages'] })
  }
})

export const PageStudioDocumentSaveSchema = z.object({
  expectedRevision: z.number().int().min(0),
  document: PageStudioDocumentSchema
}).strict()

export type PageStudioBlock = z.infer<typeof PageStudioBlockSchema>
export type PageStudioPage = z.infer<typeof PageStudioPageSchema>
export type PageStudioDocument = z.infer<typeof PageStudioDocumentSchema>
