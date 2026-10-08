import { EmailFieldBindingSchema, emailFieldVariable } from './emailTemplateFields'
import { EmailTemplateSchema, ValidatedEmailTemplateSchema, type EmailTemplate } from './emailTemplates'

export function insertEmailFieldReference(input: EmailTemplate, formKey: string, field: { fieldId: string, type: string }, fallback: string, target: string): EmailTemplate {
  const draft = EmailTemplateSchema.parse(input)
  const binding = EmailFieldBindingSchema.parse({ formKey, fieldId: field.fieldId, type: field.type, fallback })
  const variable = emailFieldVariable(binding)
  const token = `{{${variable}}}`
  if (target === 'subject') draft.subject += token
  else if (target === 'preheader') draft.preheader += token
  else {
    const block = draft.blocks.find(item => `block:${item.id}` === target)
    if (!block || !('text' in block)) throw new Error('Choose where to insert the field')
    block.text += token
  }
  draft.schemaVersion = 2
  draft.fieldBindings = [...(draft.fieldBindings ?? []).filter(item => emailFieldVariable(item) !== variable), binding]
  return ValidatedEmailTemplateSchema.parse(draft)
}
export function replaceEmailFieldReference(input: EmailTemplate, variable: string): EmailTemplate {
  const draft = EmailTemplateSchema.parse(input)
  const binding = draft.fieldBindings?.find(item => emailFieldVariable(item) === variable)
  if (!binding) throw new Error('Choose an existing field reference')
  const token = `{{${variable}}}`
  const replace = (value: string) => {
    if (!value.includes(token)) return value
    if (/[{}]/.test(binding.fallback)) throw new Error('Edit the variable-looking fallback into plain text before replacing this reference')
    return value.replaceAll(token, () => binding.fallback)
  }
  draft.subject = replace(draft.subject)
  draft.preheader = replace(draft.preheader)
  for (const block of draft.blocks) if ('text' in block) block.text = replace(block.text)
  if (draft.identity) {
    for (const key of ['businessName', 'tagline', 'phone', 'address', 'disclaimer'] as const) draft.identity[key] = replace(draft.identity[key])
  }
  draft.fieldBindings = draft.fieldBindings!.filter(item => emailFieldVariable(item) !== variable)
  if (!draft.fieldBindings.length) {
    draft.schemaVersion = 1
    delete draft.fieldBindings
  }
  return ValidatedEmailTemplateSchema.parse(draft)
}
