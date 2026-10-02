import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

export const VideoClientProfileSchema = z.object({
  enabled: z.boolean(), monthlyCapCents: z.number().int().min(0).max(100000),
  allowedModelIds: z.array(z.string()).min(1).max(20).refine(ids => ids.every(id => listSelectableVideoGenerationModels().some(m => m.id === id && m.surface === 'tenant')), 'Select supported client models'),
  brandName: z.string().trim().min(1).max(200),
  brandWebsite: z.union([z.literal(''), z.string().url().refine(url => new URL(url).protocol === 'https:', 'Use an HTTPS website')]),
  brandKitId: z.string().uuid().nullable().optional(),
  styleGuide: z.string().trim().max(12000), templatePrompt: z.string().trim().max(2000), socialBrief: z.string().trim().max(4000)
})
export type VideoClientProfile = z.infer<typeof VideoClientProfileSchema>
export type VideoClientProfileView = VideoClientProfile & { localStyleGuide: string, guideKitName: string | null }

export async function loadVideoClientProfile(clientId: string): Promise<VideoClientProfileView | null> {
  const row = await queryOneFresh<{ enabled: boolean, monthly_cap_cents: number, allowed_model_ids: string[], brand_name: string, brand_website: string, style_guide: string, template_prompt: string, social_brief: string, linked_kit_id: string | null, linked_kit_name: string | null, linked_guidelines: string | null }>(`
    SELECT p.*, bk.id AS linked_kit_id, bk.name AS linked_kit_name, bk.guidelines AS linked_guidelines
    FROM client_video_generation_profiles p
    LEFT JOIN brand_kits bk ON bk.id = p.brand_kit_id AND bk.client_id = p.client_id
    WHERE p.client_id::text = $1`, [clientId])
  if (!row) return null
  return { enabled: row.enabled, monthlyCapCents: Number(row.monthly_cap_cents), allowedModelIds: row.allowed_model_ids,
    brandName: row.brand_name, brandWebsite: row.brand_website,
    brandKitId: row.linked_kit_id ?? null, guideKitName: row.linked_kit_name ?? null,
    localStyleGuide: row.style_guide, styleGuide: row.linked_kit_id ? row.linked_guidelines ?? '' : row.style_guide,
    templatePrompt: row.template_prompt, socialBrief: row.social_brief }
}
