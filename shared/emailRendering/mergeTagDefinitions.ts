import { z } from 'zod'

// Custom definitions are authoring aids, never arbitrary subscriber properties.
// Namespace keeps present and future sender-owned fields out of this catalog.
export const RESERVED_MERGE_KEYS = ['email', 'name', 'first_name', 'unsubscribe_url'] as const
export const MergeKeySchema = z.string().regex(/^custom_[a-z][a-z0-9_]{0,55}$/)
// These characters are ambiguous across plain-text and HTML token contexts.
// Keep fallback literals portable until the renderer has a context-aware codec.
// eslint-disable-next-line no-control-regex
export const MergeFallbackSchema = z.string().trim().min(1).max(200).regex(/^[^{}|<>&\x00-\x1f\x7f]+$/)
export const MergeDefinitionInputSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  token: MergeKeySchema,
  preview_value: z.string().trim().max(256),
  fallback: MergeFallbackSchema
}).strict()
export const MergeDefinitionPatchSchema = MergeDefinitionInputSchema.pick({ name: true, preview_value: true, fallback: true }).partial().strict()
export type MergeDefinitionInput = z.infer<typeof MergeDefinitionInputSchema>
export type MergeDefinition = MergeDefinitionInput & { id: string }
export type MergeChoice = { name: string, token: string, value: string }

export const BUILTIN_MERGE_CHOICES: MergeChoice[] = [
  { name: 'First name', token: 'first_name', value: '{{first_name | there}}' },
  { name: 'Full name', token: 'name', value: '{{name | friend}}' },
  { name: 'Email address', token: 'email', value: '{{email}}' },
  { name: 'Unsubscribe URL', token: 'unsubscribe_url', value: '{{unsubscribe_url}}' }
]
export const SAMPLE_MERGE_VALUES: Record<string, string> = {
  first_name: 'Alex', name: 'Alex Example', email: 'alex@example.invalid',
  unsubscribe_url: 'https://example.invalid/unsubscribe'
}
export function mergeDefinitionToken(definition: Pick<MergeDefinitionInput, 'token' | 'fallback'>): string {
  return `{{${MergeKeySchema.parse(definition.token)} | ${MergeFallbackSchema.parse(definition.fallback)}}}`
}
export function mergeChoices(definitions: MergeDefinition[]): MergeChoice[] {
  return [...BUILTIN_MERGE_CHOICES, ...definitions.map(d => ({ name: d.name, token: d.token, value: mergeDefinitionToken(d) }))]
}
/** Strictly validated editor metadata; unknown authored tokens stay visible text. */
export function isAuthorableMergeToken(value: string): boolean {
  if (value.length > 384) return false
  const match = /^\{\{([a-z][a-z0-9_]*)(?: \| ([^{}]+))?\}\}$/.exec(value)
  if (!match) return false
  const key = match[1]!
  if (!(RESERVED_MERGE_KEYS as readonly string[]).includes(key) && !MergeKeySchema.safeParse(key).success) return false
  return match[2] === undefined ? (RESERVED_MERGE_KEYS as readonly string[]).includes(key) : MergeFallbackSchema.safeParse(match[2]).success
}
export function sampleMergeVariables(definitions: MergeDefinition[], samples: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = Object.create(null)
  for (const key of RESERVED_MERGE_KEYS) values[key] = (samples[key] ?? SAMPLE_MERGE_VALUES[key]!).slice(0, 256)
  for (const definition of definitions) {
    if (MergeDefinitionInputSchema.safeParse(definitionInput(definition)).success) values[definition.token] = definition.preview_value
  }
  return values
}
function definitionInput({ client_id, name, token, preview_value, fallback }: MergeDefinition): MergeDefinitionInput {
  return { client_id, name, token, preview_value, fallback }
}
