import { z } from 'zod'

export const PAGE_STUDIO_BLOCK_TYPES = [
  'hero', 'text', 'image', 'cta', 'features', 'stats', 'testimonials', 'faq', 'contact', 'logo-cloud', 'blog-grid'
] as const
export const PAGE_STUDIO_BLOCK_BACKGROUNDS = ['canvas', 'muted', 'brand', 'dark'] as const
export const PAGE_STUDIO_PAGE_VISIBILITIES = ['visible', 'hidden'] as const
export const PAGE_STUDIO_PAGE_STATUSES = ['draft', 'visible', 'archived'] as const
export const PAGE_STUDIO_SHELL_MODES = ['inherit', 'custom', 'hidden'] as const

const PageStudioRoutePathSchema = z.string().trim().max(2048).regex(
  /^\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)?$/,
  'Routes must be lowercase paths beginning with /'
)

const PageStudioRedirectSchema = z.object({
  id: z.string().uuid(),
  fromPath: PageStudioRoutePathSchema,
  toPath: z.string().trim().min(1).max(2048).refine(
    value => value.startsWith('/') || /^https:\/\/[a-z0-9.-]+(?:[/:?#]|$)/i.test(value),
    'Redirect destinations must be an internal path or an HTTPS URL'
  ),
  statusCode: z.union([z.literal(301), z.literal(302)])
}).strict()

const PageStudioBlockItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(180).default(''),
  body: z.string().max(1200).default(''),
  label: z.string().max(80).default(''),
  value: z.string().max(80).default(''),
  imageUrl: z.string().max(2048).default(''),
  imageAlt: z.string().max(300).default(''),
  href: z.string().max(2048).default('')
}).strict()

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
  background: z.enum(PAGE_STUDIO_BLOCK_BACKGROUNDS).default('canvas'),
  items: z.array(PageStudioBlockItemSchema).max(12).optional()
}).strict()

const PageStudioNavigationItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(2048)
}).strict()

const PageStudioFooterGroupSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  links: z.array(PageStudioNavigationItemSchema).max(8)
}).strict()

const PageStudioShellSchema = z.object({
  headerPresetId: z.enum(['minimal', 'standard', 'campaign']),
  footerPresetId: z.enum(['compact', 'multi-column', 'conversion']),
  siteName: z.string().trim().min(1).max(160),
  primaryActionLabel: z.string().max(80).default(''),
  primaryActionHref: z.string().max(2048).default(''),
  navigation: z.array(PageStudioNavigationItemSchema).max(12),
  footerGroups: z.array(PageStudioFooterGroupSchema).max(6),
  copyright: z.string().max(240).default('')
}).strict()

const PageStudioPageSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().toLowerCase().max(80).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?)?$/),
  visibility: z.enum(PAGE_STUDIO_PAGE_VISIBILITIES).default('visible'),
  status: z.enum(PAGE_STUDIO_PAGE_STATUSES).optional(),
  headerMode: z.enum(PAGE_STUDIO_SHELL_MODES).optional(),
  footerMode: z.enum(PAGE_STUDIO_SHELL_MODES).optional(),
  seoTitle: z.string().max(160).default(''),
  seoDescription: z.string().max(320).default(''),
  blocks: z.array(PageStudioBlockSchema).max(60)
}).strict()

export const PageStudioDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(PageStudioPageSchema).min(1).max(100),
  homepageId: z.string().uuid().optional(),
  redirects: z.array(PageStudioRedirectSchema).max(250).optional(),
  shell: PageStudioShellSchema.optional()
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

  const homepage = document.homepageId
    ? pageById.get(document.homepageId)
    : document.pages.find(page => page.parentId === null && page.slug === '')
  if (!homepage || homepage.parentId !== null || homepage.slug !== '') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The homepage ID must reference the root page at /', path: ['homepageId'] })
  } else if (homepage.status === 'archived') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The homepage cannot be archived', path: ['homepageId'] })
  }

  const routeFor = (pageId: string): string => {
    const segments: string[] = []
    const visited = new Set<string>()
    let page = pageById.get(pageId)
    while (page && !visited.has(page.id)) {
      visited.add(page.id)
      if (page.slug) segments.unshift(page.slug)
      page = page.parentId ? pageById.get(page.parentId) : undefined
    }
    return segments.length ? `/${segments.join('/')}` : '/'
  }
  const pageRoutes = new Set(document.pages.map(page => routeFor(page.id)))
  const redirectSources = new Set<string>()
  document.redirects?.forEach((redirect, index) => {
    if (redirect.fromPath === redirect.toPath) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A redirect cannot point to itself', path: ['redirects', index, 'toPath'] })
    }
    if (redirectSources.has(redirect.fromPath)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Redirect source routes must be unique', path: ['redirects', index, 'fromPath'] })
    }
    if (pageRoutes.has(redirect.fromPath)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A redirect cannot replace an existing page route', path: ['redirects', index, 'fromPath'] })
    }
    redirectSources.add(redirect.fromPath)
  })
})

export const PageStudioDocumentSaveSchema = z.object({
  expectedRevision: z.number().int().min(0),
  document: PageStudioDocumentSchema
}).strict()

export type PageStudioBlock = z.infer<typeof PageStudioBlockSchema>
export type PageStudioBlockItem = z.infer<typeof PageStudioBlockItemSchema>
export type PageStudioPage = z.infer<typeof PageStudioPageSchema>
export type PageStudioRedirect = z.infer<typeof PageStudioRedirectSchema>
export type PageStudioShell = z.infer<typeof PageStudioShellSchema>
export type PageStudioDocument = z.infer<typeof PageStudioDocumentSchema>
