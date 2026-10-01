import { z } from 'zod'

// A view of the saved manifest, never a writable conversion of its components.
export const PageStudioSavedPagesSchema = z.object({
  schemaVersion: z.literal(2),
  pages: z.array(z.object({
    id: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    route: z.string().max(2048).startsWith('/'),
    visibility: z.enum(['public', 'hidden', 'draft', 'archived']),
    seo: z.object({ title: z.string().max(300).optional(), description: z.string().max(1000).optional() }),
    forms: z.array(z.object({
      id: z.string().min(1).max(128),
      name: z.string().max(120).optional(),
      fields: z.array(z.object({
        id: z.string().min(1).max(128),
        name: z.string().max(80),
        type: z.enum(['text', 'email', 'tel', 'date', 'number', 'textarea', 'select', 'checkbox', 'hidden']),
        required: z.boolean().optional(),
        description: z.string().max(240).optional(),
        options: z.array(z.string().max(120)).max(50).optional()
      })).max(100).optional().catch(undefined)
    })).max(100)
  })).min(1).max(200)
})

export interface PageStudioSavedPages {
  checkpointId: string
  pages: z.infer<typeof PageStudioSavedPagesSchema>['pages']
}
