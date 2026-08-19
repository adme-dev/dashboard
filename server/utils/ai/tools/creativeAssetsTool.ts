import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import type { CreativeAssetArgs } from './creativeAssets'

const params = z.object({
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  clientName: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export const creativeAssetsTool: AiTool<CreativeAssetArgs> = {
  name: 'get_creative_assets',
  description: 'Resolve running campaign/ad creatives to XeroFlow Banner Studio, current and migrated Monday, and ad-platform assets with provenance and usable URLs when available. Monday discovery is bounded to governed local item mappings, excludes screenshot-like files, returns deduplicated clientIds/clientNames arrays, and never assigns a campaign ID without an explicit link. Returns explicit partial coverage when a platform creative has no build provenance, and never presents sync time as artwork build time. Filter by campaign ID/name or client and paginate with cursor.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: async (args, ctx) => (await import('./creativeAssets')).getCreativeAssets(args, ctx),
}
