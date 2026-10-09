import { describe, expect, it } from 'vitest'
import { insertEmailFieldReference, replaceEmailFieldReference } from '../../shared/pageStudio/emailTemplateFieldEditing'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'

const field = { fieldId: 'name', label: 'First name', type: 'text' as const }
describe('atomic manual field reference editing', () => {
  it('adds a stable reference and explicit fallback as one detached draft change', () => {
    const original = starterEmailTemplate('customer')
    const before = structuredClone(original)
    const next = insertEmailFieldReference(original, 'booking', field, 'there', 'subject')
    expect(original).toEqual(before)
    expect(next.schemaVersion).toBe(2)
    expect(next.subject).toContain('{{field.booking.name}}')
    expect(next.fieldBindings).toEqual([{ formKey: 'booking', fieldId: 'name', type: 'text', fallback: 'there' }])
    expect(insertEmailFieldReference(next, 'booking', field, 'friend', 'preheader').fieldBindings).toHaveLength(1)
  })
  it('rejects invalid targets and length overflow without changing the original', () => {
    const original = starterEmailTemplate('customer')
    const before = structuredClone(original)
    expect(() => insertEmailFieldReference(original, 'booking', field, '', 'missing')).toThrow()
    expect(() => insertEmailFieldReference({ ...original, subject: 'x'.repeat(200) }, 'booking', field, '', 'subject')).toThrow()
    expect(original).toEqual(before)
  })
  it('replaces every occurrence with literal fallback text and restores legacy shape', () => {
    let template = insertEmailFieldReference(starterEmailTemplate('customer'), 'booking', field, '$& there', 'subject')
    template = insertEmailFieldReference(template, 'booking', field, '$& there', 'block:intro')
    const next = replaceEmailFieldReference(template, 'field.booking.name')
    expect(next.schemaVersion).toBe(1)
    expect(next).not.toHaveProperty('fieldBindings')
    expect(next.subject).toContain('$& there')
    expect(JSON.stringify(next)).not.toContain('field.booking.name')
    expect(template.fieldBindings).toHaveLength(1)
  })
  it('withholds conversion of variable-looking fallbacks while allowing unused binding cleanup', () => {
    const template = insertEmailFieldReference(starterEmailTemplate('customer'), 'booking', field, '{{site.name}}', 'subject')
    expect(() => replaceEmailFieldReference(template, 'field.booking.name')).toThrow()
    template.subject = 'Plain text'
    expect(replaceEmailFieldReference(template, 'field.booking.name').schemaVersion).toBe(1)
  })
})
