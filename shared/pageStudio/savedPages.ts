import { z } from 'zod'

const Fields = z.array(z.object({
  id: z.string().min(1).max(128), name: z.string().max(80),
  type: z.enum(['text', 'email', 'tel', 'date', 'number', 'textarea', 'select', 'checkbox', 'hidden']),
  required: z.boolean().optional(), description: z.string().max(240).optional(),
  options: z.array(z.string().max(120)).max(50).optional()
})).max(100)
const SavedFormSchema = z.object({ id: z.string().min(1).max(128), name: z.string().max(120).optional(), fields: Fields.optional().catch(undefined) })
const SharedFormLibrarySchema = z.object({
  schemaVersion: z.literal(1),
  definitions: z.array(z.object({
    id: z.string().min(1).max(128), revision: z.number().int().positive(),
    form: SavedFormSchema.extend({ fields: Fields }),
    placements: z.array(z.object({ pageId: z.string().min(1), formId: z.string().min(1), fieldIds: z.record(z.string(), z.string()) })).max(200)
  })).max(200)
})
// A view of the saved manifest, never a writable conversion of its components.
export const PageStudioSavedPagesSchema = z.object({
  schemaVersion: z.literal(2),
  formLibrary: SharedFormLibrarySchema.optional(),
  pages: z.array(z.object({
    id: z.string().min(1).max(128), title: z.string().min(1).max(200),
    route: z.string().max(2048).startsWith('/'),
    visibility: z.enum(['public', 'hidden', 'draft', 'archived']),
    seo: z.object({ title: z.string().max(300).optional(), description: z.string().max(1000).optional() }),
    forms: z.array(SavedFormSchema).max(100)
  })).min(1).max(200)
}).superRefine((value, ctx) => {
  if (!value.formLibrary) return
  const mapped = new Set<string>()
  const definitions = new Set<string>()
  for (const definition of value.formLibrary.definitions) {
    if (definitions.has(definition.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate shared form definition' })
    definitions.add(definition.id)
    for (const placement of definition.placements) {
      const key = `${placement.pageId}:${placement.formId}`
      const form = value.pages.find(page => page.id === placement.pageId)?.forms.find(item => item.id === placement.formId)
      if (mapped.has(key) || !form?.fields || definition.form.fields.length !== form.fields.length || Object.keys(placement.fieldIds).length !== form.fields.length || new Set(Object.values(placement.fieldIds)).size !== form.fields.length
        || definition.form.fields.some(field => !form.fields?.some(local => local.id === placement.fieldIds[field.id] && local.type === field.type))) ctx.addIssue({ code: 'custom', message: 'Invalid shared form placement' })
      mapped.add(key)
    }
  }
  if (value.pages.some(page => page.forms.some(form => !mapped.has(`${page.id}:${form.id}`)))) ctx.addIssue({ code: 'custom', message: 'Unmapped shared form placement' })
})

export interface PageStudioSavedPages {
  checkpointId: string
  pages: z.infer<typeof PageStudioSavedPagesSchema>['pages']
  formLibrary?: z.infer<typeof SharedFormLibrarySchema>
}
