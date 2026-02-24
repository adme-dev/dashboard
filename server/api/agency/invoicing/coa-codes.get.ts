/**
 * GET /api/agency/invoicing/coa-codes
 * Returns all 9 COA codes with categories, margins, and descriptions.
 * Static business logic — no Xero API call needed.
 */
import { requireAuth } from '~~/server/utils/auth'
import { COA_ACCOUNTS } from '~~/server/utils/invoicing/coa-map'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const codes = Object.entries(COA_ACCOUNTS).map(([code, info]) => ({
    code,
    category: info.category,
    margin: info.margin,
    description: getDescription(code),
  }))

  return { codes }
})

function getDescription(code: string): string {
  const descriptions: Record<string, string> = {
    '205': 'Print production: brochures, signage, business cards, catalogues',
    '210': 'Production: design, EDM, creative, animation (default catch-all)',
    '215': 'Marketing: strategy, consultation, copywriting, planning',
    '216': 'Digital advertising: PPC management fees, SEO management',
    '217': 'Social media: organic social management, community management',
    '219': 'Video production: TVC, reels, photography, drone',
    '220': 'Media: radio, TV, print, billboards, cinema (10% margin)',
    '225': 'Website: hosting, landing pages, SEO, web support',
    '330': 'PPC passthrough: exact ad spend, no markup (Meta/Google/Microsoft)',
  }
  return descriptions[code] || ''
}
