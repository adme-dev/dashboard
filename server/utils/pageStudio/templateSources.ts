import { z } from 'zod'

export const TemplateSourcesSchema = z.array(z.object({
  siteId: z.string().uuid(), slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
}).strict()).max(50)

/** A present legacy scalar is authoritative, including when malformed. */
export function readTemplateSources(env: Record<string, unknown>) {
  if (Object.hasOwn(env, 'PAGE_STUDIO_TEMPLATE_SOURCES')) {
    return TemplateSourcesSchema.parse(JSON.parse(String(env.PAGE_STUDIO_TEMPLATE_SOURCES)))
  }
  const bundle = JSON.parse(String(env.PAGE_STUDIO_CUSTOMER_ACTIVATION ?? '{}'))
  return TemplateSourcesSchema.parse(Object.hasOwn(bundle, 'templateSources') ? bundle.templateSources : [])
}
