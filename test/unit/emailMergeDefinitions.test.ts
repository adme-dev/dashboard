import { describe, expect, it } from 'vitest'
import { BUILTIN_MERGE_CHOICES, MergeDefinitionInputSchema, MergeDefinitionPatchSchema, isAuthorableMergeToken, mergeDefinitionToken, sampleMergeVariables } from '../../shared/emailRendering/mergeTagDefinitions'

const input = { client_id: '11111111-1111-4111-8111-111111111111', name: 'Offer', token: 'custom_offer', preview_value: 'Sample only', fallback: 'Ask our team' }

describe('merge authoring definitions', () => {
  it('writes an explicit bounded literal fallback, independent of later catalog edits', () => {
    const token = mergeDefinitionToken(input)
    expect(token).toBe('{{custom_offer | Ask our team}}')
    input.fallback = 'New fallback'
    expect(token).toBe('{{custom_offer | Ask our team}}')
    input.fallback = 'Ask our team'
  })
  it.each(['email', 'name', 'first_name', 'unsubscribe_url', 'location', '__proto__', 'custom_Name', 'custom_'])('rejects reserved or unsupported subscriber token %s', (token) => {
    expect(MergeDefinitionInputSchema.safeParse({ ...input, token }).success).toBe(false)
  })
  it.each(['', 'x'.repeat(201), 'x|y', '{{name}}', '<script>', 'A&B', 'line\nbreak'])('rejects ambiguous fallback %s', (fallback) => {
    expect(MergeDefinitionInputSchema.safeParse({ ...input, fallback }).success).toBe(false)
  })
  it('preserves quote punctuation in portable fallbacks for parent metadata resolution', () => {
    expect(mergeDefinitionToken({ token: 'custom_offer', fallback: `We're offering "more"` })).toBe(`{{custom_offer | We're offering "more"}}`)
  })
  it('keeps identity immutable in patches and bounds sample data', () => {
    expect(MergeDefinitionPatchSchema.safeParse({ token: 'custom_new' }).success).toBe(false)
    expect(MergeDefinitionPatchSchema.safeParse({ client_id: input.client_id }).success).toBe(false)
    expect(MergeDefinitionInputSchema.safeParse({ ...input, preview_value: 'x'.repeat(257) }).success).toBe(false)
  })
  it('permits only known canonical token metadata while preserving unsupported text outside chips', () => {
    expect(BUILTIN_MERGE_CHOICES.every(choice => isAuthorableMergeToken(choice.value))).toBe(true)
    expect(isAuthorableMergeToken(mergeDefinitionToken(input))).toBe(true)
    expect(isAuthorableMergeToken('{{location}}')).toBe(false)
    expect(isAuthorableMergeToken('{{custom_offer}}')).toBe(false)
    expect(isAuthorableMergeToken('{{first_name | <img>}}')).toBe(false)
  })
  it('builds sample-only variables from allowlisted sender fields and valid namespaced definitions', () => {
    const variables = sampleMergeVariables([{ ...input, id: 'id' }, { ...input, id: 'bad', token: 'email', preview_value: 'stolen' }], { first_name: 'Taylor', unsupported: 'value' })
    expect(variables.first_name).toBe('Taylor')
    expect(variables.email).toBe('alex@example.invalid')
    expect(variables.custom_offer).toBe('Sample only')
    expect(variables.unsupported).toBeUndefined()
  })
})
