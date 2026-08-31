import { z } from 'zod'

export const PAGE_STUDIO_STARTERS = ['automotive-campaign-v1'] as const

export const PageStudioSiteId = z.string().uuid()

export const PageStudioSiteBody = z.object({
  clientId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  route: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,62})$/),
  starterVersion: z.enum(PAGE_STUDIO_STARTERS)
}).strict()

export const PageStudioSiteQuery = z.object({
  clientId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'suspended', 'archived']).optional(),
  search: z.string().trim().min(1).max(160).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
}).strict()

export const PageStudioBuildBody = z.object({
  assets: z.array(z.object({
    body: z.string().max(10 * 1024 * 1024),
    contentType: z.string().trim().min(1).max(200),
    path: z.string().trim().min(1).max(1024),
    status: z.enum(['pending', 'ready', 'rejected'])
  }).strict()).max(100),
  manifest: z.record(z.string(), z.unknown())
}).strict()
