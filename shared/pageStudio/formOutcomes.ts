import { z } from 'zod'

/** Draft outcome contract. Fixed same-site paths only; no answer interpolation. */
const RedirectPath = /^\/(?:[a-zA-Z0-9_-]+\/?)*$/
const ReservedPath = /^\/(?:api|_nuxt|assets)(?:\/|$)/i
export function isFormRedirectPath(value: string): boolean {
  if (!RedirectPath.test(value) || value !== value.trim() || value.startsWith('//')) return false
  return !ReservedPath.test(value)
}
export const FormOutcomeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), message: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ type: z.literal('redirect'), path: z.string().min(1).max(500).refine(isFormRedirectPath, 'Choose a page path such as /thank-you, without query parameters.') }).strict()
])
const Numeric = /^-?(?:\d+\.?\d*|\.\d+)$/
export const FormOutcomeSettingsSchema = z.object({
  fallback: FormOutcomeSchema,
  rules: z.array(z.object({
    fieldId: z.string().min(1).max(128).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
    operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
    value: z.string().min(1).max(500),
    outcome: FormOutcomeSchema
  }).strict().superRefine((rule, ctx) => {
    if (['greater_than', 'less_than'].includes(rule.operator) && (!Numeric.test(rule.value) || !Number.isFinite(Number(rule.value)))) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a finite number for this comparison.' })
    }
  })).max(20)
}).strict()
export type FormOutcomeSettings = z.infer<typeof FormOutcomeSettingsSchema>
export type FormOutcome = z.infer<typeof FormOutcomeSchema>
export const defaultFormOutcomes = (): FormOutcomeSettings => ({ fallback: { type: 'message', message: 'Thank you. Your enquiry has been received.' }, rules: [] })

export function validateFormOutcomeFields(settings: FormOutcomeSettings, fields: Array<{ id: string, type: string }>): string[] {
  return settings.rules.flatMap((rule, index) => {
    const field = fields.find(item => item.id === rule.fieldId && item.type !== 'hidden')
    if (!field) return [`Rule ${index + 1}: choose a field from this form.`]
    if (['greater_than', 'less_than'].includes(rule.operator) && field.type !== 'number') return [`Rule ${index + 1}: numeric comparisons require a number field.`]
    return []
  })
}

/** Simulation only. The public consumer must also verify accepted revision authority. */
export function evaluateFormOutcome(input: unknown, answers: Record<string, string>) {
  const settings = FormOutcomeSettingsSchema.parse(input)
  const matchedRule = settings.rules.findIndex((rule) => {
    if (!Object.hasOwn(answers, rule.fieldId)) return false
    const value = answers[rule.fieldId]
    if (typeof value !== 'string' || value === '') return false
    switch (rule.operator) {
      case 'equals': return value === rule.value
      case 'not_equals': return value !== rule.value
      case 'contains': return value.includes(rule.value)
      case 'greater_than': return Numeric.test(value) && Number.isFinite(Number(value)) && Number(value) > Number(rule.value)
      case 'less_than': return Numeric.test(value) && Number.isFinite(Number(value)) && Number(value) < Number(rule.value)
      default: return false
    }
  })
  return { outcome: matchedRule < 0 ? settings.fallback : (settings.rules[matchedRule]?.outcome ?? settings.fallback), matchedRule: matchedRule < 0 ? null : matchedRule }
}
