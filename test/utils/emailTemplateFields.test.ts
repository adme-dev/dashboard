import { describe, expect, it } from 'vitest'
import { ValidatedEmailTemplateSchema, starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'
import { emailTemplateFieldVariables, validateEmailTemplateFieldBindings } from '../../shared/pageStudio/emailTemplateFields'

const binding = { formKey: 'booking', fieldId: 'first_name', type: 'text' as const, fallback: 'there' }
const boundTemplate = () => ({ ...starterEmailTemplate('customer'), schemaVersion: 2 as const, subject: 'Hello {{field.booking.first_name}}', fieldBindings: [binding] })
const catalogue = [{ key: 'booking', form: { fields: [{ id: 'first_name', name: 'First name', type: 'text' }] } }]

describe('stable email field references', () => {
  it('accepts explicitly bound variables and preserves existing templates without metadata', () => {
    expect(ValidatedEmailTemplateSchema.parse(boundTemplate()).fieldBindings).toEqual([binding])
    expect(ValidatedEmailTemplateSchema.parse(starterEmailTemplate('team'))).not.toHaveProperty('fieldBindings')
    expect(ValidatedEmailTemplateSchema.safeParse({ ...boundTemplate(), schemaVersion: 1 }).success).toBe(false)
  })
  it('rejects missing fallbacks, duplicate bindings, unknown tokens and hidden fields', () => {
    const { fallback: _fallback, ...missing } = binding
    for (const fieldBindings of [[missing], [binding, binding], [{ ...binding, type: 'hidden' }]]) {
      expect(ValidatedEmailTemplateSchema.safeParse({ ...boundTemplate(), fieldBindings }).success).toBe(false)
    }
    expect(ValidatedEmailTemplateSchema.safeParse({ ...boundTemplate(), subject: '{{field.booking.deleted}}' }).success).toBe(false)
  })
  it('follows IDs through label changes and invalidates field removal, type changes or foreign form scope', () => {
    const template = boundTemplate()
    expect(validateEmailTemplateFieldBindings(template, catalogue)).toEqual([])
    const renamed = structuredClone(catalogue)
    renamed[0].form.fields[0].name = 'Preferred name'
    expect(validateEmailTemplateFieldBindings(template, renamed)).toEqual([])
    expect(validateEmailTemplateFieldBindings(template, [])).not.toEqual([])
    expect(validateEmailTemplateFieldBindings(template, [{ key: 'booking', form: { fields: [] } }])).not.toEqual([])
    expect(validateEmailTemplateFieldBindings(template, [{ key: 'booking', form: { fields: [{ id: 'first_name', type: 'email' }] } }])).not.toEqual([])
    expect(validateEmailTemplateFieldBindings(template, catalogue, 'contact')).not.toEqual([])
  })
  it('uses explicit literal fallback for empty answers and other forms without reading their values', () => {
    const fields = catalogue[0].form.fields
    expect(emailTemplateFieldVariables(boundTemplate(), { formKey: 'booking', fields, answers: { first_name: 'Ada' } })).toEqual({ 'field.booking.first_name': 'Ada' })
    for (const answers of [{}, { first_name: '' }, { first_name: '   ' }]) {
      expect(emailTemplateFieldVariables(boundTemplate(), { formKey: 'booking', fields, answers })).toEqual({ 'field.booking.first_name': 'there' })
    }
    expect(emailTemplateFieldVariables(boundTemplate(), { formKey: 'contact', fields, answers: { first_name: 'Private foreign answer' } })).toEqual({ 'field.booking.first_name': 'there' })
  })
  it('fails on stale matching-form schemas instead of masking them with a fallback', () => {
    expect(() => emailTemplateFieldVariables(boundTemplate(), { formKey: 'booking', fields: [], answers: {} })).toThrow()
    expect(() => emailTemplateFieldVariables(boundTemplate(), { formKey: 'booking', fields: catalogue[0].form.fields, answers: { first_name: 'x'.repeat(8001) } })).toThrow()
    expect(() => emailTemplateFieldVariables(boundTemplate(), { formKey: 'booking', fields: [{ id: 'first_name', type: 'hidden' }], answers: {} })).toThrow()
  })
  it('keeps fallback text literal and permits an explicit empty fallback', () => {
    const template = { ...boundTemplate(), fieldBindings: [{ ...binding, fallback: '{{site.name}} <b>literal</b>' }] }
    expect(emailTemplateFieldVariables(template, { formKey: 'booking', fields: catalogue[0].form.fields, answers: {} })).toEqual({ 'field.booking.first_name': '{{site.name}} <b>literal</b>' })
    expect(ValidatedEmailTemplateSchema.safeParse({ ...boundTemplate(), fieldBindings: [{ ...binding, fallback: '' }] }).success).toBe(true)
  })
  it('invalidates legacy-to-shared adoption instead of matching a field by its label', () => {
    const template = { ...boundTemplate(), fieldBindings: [{ ...binding, formKey: 'page_one:contact' }] }
    expect(validateEmailTemplateFieldBindings(template, catalogue)).not.toEqual([])
  })
  it('supports legacy placement keys without conflating duplicated field IDs in other forms', () => {
    const template = { ...starterEmailTemplate('team'), schemaVersion: 2 as const, subject: '{{field.page_one:contact.first_name}}', fieldBindings: [{ ...binding, formKey: 'page_one:contact' }] }
    expect(ValidatedEmailTemplateSchema.safeParse(template).success).toBe(true)
    expect(emailTemplateFieldVariables(template, { formKey: 'page_two:contact', fields: catalogue[0].form.fields, answers: { first_name: 'Other' } })).toEqual({ 'field.page_one:contact.first_name': 'there' })
  })
})
