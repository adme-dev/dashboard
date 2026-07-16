export interface SocialNewsClientProfile {
  clientId?: string
  clientName?: string
  sourceBriefId: string | null
  industry: string
  targetAudience: string
  contentPillars: string[]
  includeKeywords: string[]
  excludeKeywords: string[]
  makes: string[]
  brandVoice: string
  defaultTone: string
  aiInstructions: string
  preferredPlatforms: string[]
  timezone: string
  defaultWorkflow: 'draft' | 'schedule'
}

const PLATFORMS = new Set(['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google-business'])

function text(value: unknown, max = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function list(value: unknown, maxItems = 40, maxLength = 100): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const clean = text(item, maxLength)
    const key = clean.toLocaleLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    result.push(clean)
    if (result.length >= maxItems) break
  }
  return result
}

function pick(input: Record<string, unknown>, camel: string, snake: string): unknown {
  return input[camel] ?? input[snake]
}

export function normalizeSocialNewsClientProfile(input: Record<string, unknown> = {}): SocialNewsClientProfile {
  const timezoneInput = text(pick(input, 'timezone', 'timezone'), 100) || 'Australia/Melbourne'
  let timezone = 'Australia/Melbourne'
  try { Intl.DateTimeFormat('en-AU', { timeZone: timezoneInput }); timezone = timezoneInput } catch { /* safe default */ }
  const workflow = text(pick(input, 'defaultWorkflow', 'default_workflow'), 20)
  const preferredPlatforms = list(pick(input, 'preferredPlatforms', 'preferred_platforms'), 10, 40).filter(platform => PLATFORMS.has(platform))
  return {
    clientId: text(pick(input, 'clientId', 'client_id'), 100) || undefined,
    clientName: text(pick(input, 'clientName', 'client_name'), 255) || undefined,
    sourceBriefId: text(pick(input, 'sourceBriefId', 'source_brief_id'), 100) || null,
    industry: text(pick(input, 'industry', 'industry'), 255),
    targetAudience: text(pick(input, 'targetAudience', 'target_audience')),
    contentPillars: list(pick(input, 'contentPillars', 'content_pillars')),
    includeKeywords: list(pick(input, 'includeKeywords', 'include_keywords')),
    excludeKeywords: list(pick(input, 'excludeKeywords', 'exclude_keywords')),
    makes: list(pick(input, 'makes', 'makes')),
    brandVoice: text(pick(input, 'brandVoice', 'brand_voice')),
    defaultTone: text(pick(input, 'defaultTone', 'default_tone'), 100) || 'professional',
    aiInstructions: text(pick(input, 'aiInstructions', 'ai_instructions'), 4_000),
    preferredPlatforms,
    timezone,
    defaultWorkflow: workflow === 'schedule' ? 'schedule' : 'draft',
  }
}
