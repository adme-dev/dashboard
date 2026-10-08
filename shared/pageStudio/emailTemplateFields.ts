import { z } from 'zod'

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
export const EmailFormKeySchema = z.string().min(1).max(257).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*(?::[a-zA-Z0-9][a-zA-Z0-9_-]*)?$/)
export const EmailFieldBindingSchema = z.object({
  formKey: EmailFormKeySchema, fieldId: id,
  type: z.enum(['text', 'email', 'tel', 'date', 'number', 'textarea', 'select', 'checkbox']),
  fallback: z.string().max(200).refine(value => Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127), 'Use single-line fallback text')
}).strict()
export type EmailFieldBinding = z.infer<typeof EmailFieldBindingSchema>
export const emailFieldVariable = (binding: Pick<EmailFieldBinding, 'formKey' | 'fieldId'>) => `field.${binding.formKey}.${binding.fieldId}`
export const EmailFieldBindingsSchema = z.array(EmailFieldBindingSchema).max(100)
  .refine(items => new Set(items.map(emailFieldVariable)).size === items.length, 'Choose each form field only once')
interface Field { id: string, type: string }
interface Template { fieldBindings?: EmailFieldBinding[] }
interface Form { key: string, form: { fields?: readonly Field[] } }

/** Fresh owned schema admission. Labels and configured defaults are irrelevant. */
export function validateEmailTemplateFieldBindings(template: Template, forms: readonly Form[], targetFormKey?: string): string[] {
  const errors: string[] = []
  for (const binding of template.fieldBindings ?? []) {
    const field = forms.find(item => item.key === binding.formKey)?.form.fields?.find(item => item.id === binding.fieldId)
    if ((targetFormKey !== undefined && binding.formKey !== targetFormKey) || !field || field.type !== binding.type) {
      errors.push('A referenced form field was removed, changed type, or is outside this template. Review its field reference before saving.')
    }
  }
  return errors
}

/** Literal values only; never recursively expand fallback/answer contents.
 * Private preview supplies synthetic answers. Delivery must supply admitted,
 * normalised submission values through its own approved authority path. */
export function emailTemplateFieldVariables(template: Template, context: { formKey?: string, fields: readonly Field[], answers?: Readonly<Record<string, string | undefined>> }): Record<string, string> {
  const values: Record<string, string> = {}
  for (const binding of template.fieldBindings ?? []) {
    let value = binding.fallback
    if (context.formKey === binding.formKey) {
      const field = context.fields.find(item => item.id === binding.fieldId)
      if (!field || field.type !== binding.type) throw new Error('The template field schema changed. Review its field reference.')
      const answer = context.answers && Object.hasOwn(context.answers, binding.fieldId) ? context.answers[binding.fieldId] : undefined
      if (answer !== undefined) {
        if (typeof answer !== 'string' || answer.length > 8000) throw new Error('Invalid template field value')
        if (answer.trim()) value = answer
      }
    }
    values[emailFieldVariable(binding)] = value
  }
  return values
}
