// Brief -> Monday "Campaign Type" code mapping.
//
// The Marketing board (13392458) "Items to Action" group tracks live ad campaigns,
// each tagged with a "Campaign Type" dropdown code (column dropdown_mm1m4gkk). This
// module is the bridge the campaign-automation layer uses to turn a submitted brief
// (its template + the objective/type field the operator chose) into that code — so a
// brief can be written back to Monday as a typed campaign item, and inbound Monday
// items can be reconciled against the brief that produced them.
//
// Codes are the live board labels as of 2026-06-28:
//   Google:  G_Search G_PMaxStandard G_PMaxInventory G_Display G_YouTube G_DemandGen
//   Meta:    M_Traffic M_AIA_Traffic M_Leads M_AIA_Leads M_Awareness M_Boosted
//   TikTok:  T_Boosted T_Awareness
//   Spotify: S_Awareness
//
// Returns null when no EXACT board code exists for the combination (e.g. a Meta
// "Sales" objective — the board has no M_Sales). Callers must treat null as "leave
// the Monday Campaign Type unset / route for manual tagging", never guess a code.

export const MONDAY_CAMPAIGN_TYPES = [
  'G_Search', 'G_PMaxStandard', 'G_PMaxInventory', 'G_Display', 'G_YouTube', 'G_DemandGen',
  'M_Traffic', 'M_AIA_Traffic', 'M_Leads', 'M_AIA_Leads', 'M_Awareness', 'M_Boosted',
  'T_Boosted', 'T_Awareness', 'S_Awareness',
] as const
export type MondayCampaignType = (typeof MONDAY_CAMPAIGN_TYPES)[number]

// Which field on each ad template carries the objective/type discriminator.
const OBJECTIVE_FIELD: Record<string, string> = {
  'meta-aia': 'objective',
  'facebook-ads': 'campaign_objective',
  'google-ads': 'campaign_type',
  'google-pmax': 'pmax_type',
  'tiktok-ads': 'advertising_objective',
}

// template slug -> (objective/type value -> Monday code | null when no exact code).
const CAMPAIGN_TYPE_MAP: Record<string, Record<string, MondayCampaignType | null>> = {
  // Meta Automotive Inventory Ads — the dominant job type on the board.
  'meta-aia': {
    traffic: 'M_AIA_Traffic',
    leads: 'M_AIA_Leads',
    sales: null, // board has no M_AIA_Sales
  },
  // Meta Ads Campaign (standard, non-AIA).
  'facebook-ads': {
    awareness: 'M_Awareness',
    traffic: 'M_Traffic',
    engagement: 'M_Boosted',
    leads: 'M_Leads',
    app_promo: null,
    sales: null, // board has no M_Sales / M_Conversions
  },
  // Google Ads Campaign (Search family).
  'google-ads': {
    search: 'G_Search',
    dsa: 'G_Search', // Dynamic Search Ads is a Search subtype
    call_only: 'G_Search', // Call-only runs on the Search network
  },
  // Google Performance Max.
  'google-pmax': {
    standard: 'G_PMaxStandard',
    inventory: 'G_PMaxInventory',
  },
  // TikTok Ads Campaign — board only carries Awareness/Boosted codes.
  'tiktok-ads': {
    reach: 'T_Awareness',
    video_views: 'T_Awareness',
    community_interaction: 'T_Boosted',
    traffic: 'T_Boosted',
    app_promotion: null,
    lead_generation: null,
    website_conversions: null,
    product_sales: null,
  },
}

export interface BriefCampaignTypeInput {
  /** Brief template slug, e.g. 'meta-aia'. */
  templateSlug: string
  /** Submitted field values keyed by field_key (flattened brief_field_values). */
  fields?: Record<string, unknown> | null
  /** Explicit objective override; skips the field lookup when provided. */
  objective?: string | null
}

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/**
 * Resolve the Monday "Campaign Type" code for a submitted brief.
 *
 * Returns null when the template is not an ad template, when no objective was
 * supplied, or when the objective has no exact board code. A null result means
 * "leave the Monday Campaign Type column unset" — do not substitute a guess.
 */
export function briefToMondayCampaignType(
  input: BriefCampaignTypeInput,
): MondayCampaignType | null {
  const table = CAMPAIGN_TYPE_MAP[input.templateSlug]
  if (!table) return null

  const fieldKey = OBJECTIVE_FIELD[input.templateSlug]
  const raw = input.objective ?? (input.fields ? input.fields[fieldKey] : undefined)
  const key = norm(raw)
  if (!key) return null

  return table[key] ?? null
}

/** True when this template maps onto a Monday Campaign Type at all (i.e. is an ad template). */
export function isMondayMappableTemplate(slug: string): boolean {
  return slug in CAMPAIGN_TYPE_MAP
}
