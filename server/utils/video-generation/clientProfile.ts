import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

export const VideoClientProfileSchema = z.object({
  enabled: z.boolean(), monthlyCapCents: z.number().int().min(0).max(100000),
  allowedModelIds: z.array(z.string()).min(1).max(20).refine(ids => ids.every(id => listSelectableVideoGenerationModels().some(m => m.id === id && m.surface === 'tenant')), 'Select supported client models'),
  brandName: z.string().trim().min(1).max(200),
  brandWebsite: z.union([z.literal(''), z.string().url().refine(url => new URL(url).protocol === 'https:', 'Use an HTTPS website')]),
  styleGuide: z.string().trim().max(12000), templatePrompt: z.string().trim().max(2000), socialBrief: z.string().trim().max(4000)
})
export type VideoClientProfile = z.infer<typeof VideoClientProfileSchema>

export async function loadVideoClientProfile(clientId: string): Promise<VideoClientProfile | null> {
  const row = await queryOneFresh<{ enabled: boolean, monthly_cap_cents: number, allowed_model_ids: string[], brand_name: string, brand_website: string, style_guide: string, template_prompt: string, social_brief: string }>('SELECT * FROM client_video_generation_profiles WHERE client_id::text = $1', [clientId])
  if (!row) return null
  return { enabled: row.enabled, monthlyCapCents: Number(row.monthly_cap_cents), allowedModelIds: row.allowed_model_ids,
    brandName: row.brand_name, brandWebsite: row.brand_website, styleGuide: row.style_guide,
    templatePrompt: row.template_prompt, socialBrief: row.social_brief }
}
