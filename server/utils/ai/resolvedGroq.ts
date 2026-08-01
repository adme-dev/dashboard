import type { GroqModel } from '~~/server/utils/groqClient'

type GroqOptions = NonNullable<Parameters<typeof generateGroqInsight>[1]>

export type ModelRoutedGroqOptions = Omit<GroqOptions, 'model' | 'featureKey'> & {
  featureKey: string
  defaultModelId: GroqModel
  defaultFallbackModelId?: GroqModel | null
}

export async function generateModelRoutedGroqInsight(
  prompt: string,
  options: ModelRoutedGroqOptions
): Promise<string> {
  let model: GroqModel
  try {
    const { groqModelIdFromAssignment, resolveAiModelAssignment } = await import('~~/server/utils/ai/modelAssignments')
    const assignment = await resolveAiModelAssignment({
      featureKey: options.featureKey,
      defaultProvider: 'groq',
      defaultModelId: options.defaultModelId,
      defaultFallbackModelId: options.defaultFallbackModelId ?? null,
      supportedProviders: ['groq']
    })
    model = groqModelIdFromAssignment(assignment.modelId) as GroqModel
  } catch {
    model = options.defaultModelId
  }
  const {
    defaultModelId: _defaultModelId,
    defaultFallbackModelId: _defaultFallbackModelId,
    featureKey,
    metadata,
    ...rest
  } = options
  const { generateGroqInsight } = await import('~~/server/utils/groqClient')

  return generateGroqInsight(prompt, {
    ...rest,
    featureKey,
    model,
    metadata
  })
}
