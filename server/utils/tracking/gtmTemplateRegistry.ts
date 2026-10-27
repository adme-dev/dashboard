import { z } from 'zod'
import type { GtmParameter } from '~~/server/utils/googleTagManagerClient'
// Pinned Google-authored fixtures establish representation, NOT live write acceptance.
export const GTM_TEMPLATE_EVIDENCE = {
  'tag.google.v1':
    'https://github.com/google/site-kit-wp/blob/5d622ae5ead711e36db48aab6fe9946a06632f8e/assets/js/modules/tagmanager/datastore/__fixtures__/live-container-version--web-google-tag.json',
  'tag.ga4_event.v1':
    'https://github.com/google-marketing-solutions/ga4-gtm-utilities/blob/9a4d06d2edbcf677ee178a58cae77069e9b34a07/features/eventTags.js',
  'tag.google_ads_conversion.v1':
    'https://github.com/google-marketing-solutions/gtm-boilerplate/blob/10216cf81945a68be3dfb2e71bde353aaf5f1cea/google_tag_manager_web/src/web-container.json'
} as const
const text = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (v) => !/[<>{}]/.test(v),
    'Scripts and variable interpolation are unsupported'
  )
const id = z.string().regex(/^\d{1,20}$/)
const base = { name: text, notes: z.string().max(500).optional() }
const tag = {
  ...base,
  firingTriggerId: z
    .array(id)
    .min(1)
    .max(10)
    .refine((v) => new Set(v).size === v.length),
  parentFolderId: id.optional()
}
export const GtmTemplateSchema = z.discriminatedUnion('templateId', [
  z.strictObject({ templateId: z.literal('folder.v1'), ...base }),
  z.strictObject({
    templateId: z.literal('trigger.window_loaded.v1'),
    ...base
  }),
  z.strictObject({
    templateId: z.literal('tag.google.v1'),
    ...tag,
    tagId: z.string().regex(/^(?:G|GT|AW|DC)-[A-Z0-9]+$/)
  }),
  z.strictObject({
    templateId: z.literal('tag.ga4_event.v1'),
    ...tag,
    eventName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),
    measurementIdOverride: z.string().regex(/^G-[A-Z0-9]+$/),
    eventParameters: z
      .array(
        z.strictObject({
          name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),
          value: text
        })
      )
      .max(25)
      .refine((v) => new Set(v.map((x) => x.name)).size === v.length)
      .optional()
  }),
  z.strictObject({
    templateId: z.literal('tag.google_ads_conversion.v1'),
    ...tag,
    conversionId: id,
    conversionLabel: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    conversionValue: z
      .string()
      .regex(/^\d+(?:\.\d{1,6})?$/)
      .optional(),
    orderId: text.optional(),
    currencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    enableConversionLinker: z.boolean().optional()
  })
])
export type GtmTemplateInput = z.infer<typeof GtmTemplateSchema>
export function compileGtmTemplate(raw: unknown): {
  kind: 'tags' | 'triggers' | 'folders'
  body: Record<string, any>
} {
  const input = GtmTemplateSchema.parse(raw)
  const body: Record<string, any> = {
    name: input.name,
    ...(input.notes === undefined ? {} : { notes: input.notes })
  }
  if (input.templateId === 'folder.v1') return { kind: 'folders', body }
  if (input.templateId === 'trigger.window_loaded.v1')
    return { kind: 'triggers', body: { ...body, type: 'windowLoaded' } }
  body.firingTriggerId = input.firingTriggerId
  if (input.parentFolderId) body.parentFolderId = input.parentFolderId
  const parameter: GtmParameter[] = []
  const scalar = (
    key: string,
    value: string,
    type: 'template' | 'boolean' = 'template'
  ) => parameter.push({ type, key, value })
  if (input.templateId === 'tag.google.v1') {
    body.type = 'googtag'
    scalar('tagId', input.tagId)
  }
  if (input.templateId === 'tag.ga4_event.v1') {
    body.type = 'gaawe'
    scalar('eventName', input.eventName)
    scalar('measurementIdOverride', input.measurementIdOverride)
    if (input.eventParameters?.length)
      parameter.push({
        type: 'list',
        key: 'eventSettingsTable',
        list: input.eventParameters.map((p) => ({
          type: 'map',
          map: [
            { type: 'template', key: 'parameter', value: p.name },
            { type: 'template', key: 'parameterValue', value: p.value }
          ]
        }))
      })
  }
  if (input.templateId === 'tag.google_ads_conversion.v1') {
    body.type = 'awct'
    scalar('conversionId', input.conversionId)
    scalar('conversionLabel', input.conversionLabel)
    for (const key of ['conversionValue', 'orderId', 'currencyCode'] as const)
      if (input[key] !== undefined) scalar(key, input[key])
    if (input.enableConversionLinker !== undefined)
      scalar(
        'enableConversionLinker',
        String(input.enableConversionLinker),
        'boolean'
      )
  }
  return { kind: 'tags', body: { ...body, parameter } }
}
