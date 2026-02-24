/**
 * ADME Advertising — Chart of Accounts Mapping Engine
 *
 * Maps Monday.com job descriptions to Xero account codes via keyword matching.
 * Source of truth: Kellie White's COA list (Oct 2024 email) + Dropdown_menu_for_Media_Tracking.xlsx
 *
 * Usage:
 *   import { mapToAccount, COA_ACCOUNTS } from './coa-map'
 *   const result = mapToAccount('Facebook & Instagram PPC Payable to Meta')
 *   // → { code: '330', category: 'Other (PPC)', tracking: 'Facebook Ads', taxType: 'GST Free Expenses', margin: 0 }
 */

// ── Xero Chart of Accounts ──────────────────────────────────────────────────
export const COA_ACCOUNTS = {
  '205': { category: 'Printing',            margin: 1.0 },
  '210': { category: 'Production',          margin: 1.0 },
  '215': { category: 'Marketing',           margin: 1.0 },
  '216': { category: 'Digital Advertising',  margin: 1.0 },
  '217': { category: 'Social Media',        margin: 1.0 },
  '219': { category: 'Video Production',    margin: 1.0 },
  '220': { category: 'Media',              margin: 0.10 },  // bill at cost × 1.10
  '225': { category: 'Website',            margin: 1.0 },
  '330': { category: 'Other (PPC)',        margin: 0.0 },   // passthrough, no markup
} as const

export type COACode = keyof typeof COA_ACCOUNTS
export type GSTType = 'GST on Income' | 'GST Free Expenses' | 'GST on Expenses'

export interface COAMapping {
  code: COACode
  category: string
  tracking: string
  taxType: GSTType
  margin: number
}

// ── Keyword → Account Mapping Rules ─────────────────────────────────────────
// Order matters: first match wins. More specific rules come before general ones.
// Keywords are matched case-insensitive against the job description.

interface MappingRule {
  keywords: string[]
  code: COACode
  tracking: string
  taxType: GSTType
}

const MAPPING_RULES: MappingRule[] = [
  // ═══ COA 330 — PPC Passthrough (0% margin) ═══
  // CRITICAL: Facebook/Meta = GST FREE. Google = GST ON EXPENSES.
  // This is the #1 source of BAS errors in agency accounting.

  // Facebook / Meta / Instagram — GST FREE (foreign entity, no AU GST)
  {
    keywords: [
      'facebook ppc', 'facebook ads', 'facebook & instagram ppc',
      'meta ads', 'meta ppc', 'instagram ads', 'instagram ppc',
      'payable to meta', 'facebook campaign',
    ],
    code: '330', tracking: 'Facebook Ads', taxType: 'GST Free Expenses',
  },

  // Google — GST ON EXPENSES (Google AU registered for GST since 2016)
  {
    keywords: [
      'google ppc', 'google ads', 'google search ppc', 'google search (ppc)', 'google adwords',
      'google search & display (ppc)', 'google search & display ppc',
      'google performance max ads (ppc)', 'google performance max ads ppc',
      'google pmax inventory', 'payable to google',
      'sem', 'search ads', 'youtube ads', 'pmax', 'performance max',
    ],
    code: '330', tracking: 'Google Ads', taxType: 'GST on Expenses',
  },

  // YouTube PPC — under Google, GST ON EXPENSES
  {
    keywords: ['youtube ppv', 'youtube ppc'],
    code: '330', tracking: 'Digital Media-YouTube', taxType: 'GST on Expenses',
  },

  // Microsoft / Bing / Yahoo — GST ON EXPENSES (AU-registered)
  {
    keywords: ['microsoft ppc', 'microsoft ads', 'bing ads', 'yahoo ads', 'microsoft search ads'],
    code: '330', tracking: 'Microsoft Ads', taxType: 'GST on Expenses',
  },

  // LinkedIn PPC — GST ON EXPENSES
  {
    keywords: ['linkedin ppc', 'linkedin ads'],
    code: '330', tracking: 'LinkedIN', taxType: 'GST on Expenses',
  },

  // Spotify PPC — GST ON EXPENSES
  {
    keywords: ['spotify ppc', 'spotify ads'],
    code: '330', tracking: 'Spotify', taxType: 'GST on Expenses',
  },

  // eDM / Campaign Monitor — GST ON EXPENSES
  {
    keywords: ['edm third party send', 'campaign monitor'],
    code: '330', tracking: 'Emailing', taxType: 'GST on Expenses',
  },

  // Dispatch Fees TVC — GST ON EXPENSES
  {
    keywords: ['dispatch fees tvc', 'dispatch fee'],
    code: '330', tracking: 'Dispatch Fees TVC', taxType: 'GST on Expenses',
  },


  // ═══ COA 220 — Media (10% margin) ═══
  // Bill at cost × 1.10. All GST on Income.

  // Radio stations (specific)
  { keywords: ['radio - 101.1', 'mix fm'],           code: '220', tracking: 'Radio - 101.1 Mix FM',    taxType: 'GST on Income' },
  { keywords: ['radio - 3aw', '3aw'],                code: '220', tracking: 'Radio - 3AW',             taxType: 'GST on Income' },
  { keywords: ['radio - 3cw', 'chinese radio'],      code: '220', tracking: 'Radio - 3CW (Chinese)',   taxType: 'GST on Income' },
  { keywords: ['radio - 3gg'],                        code: '220', tracking: 'Radio - 3GG',             taxType: 'GST on Income' },
  { keywords: ['radio - 3mp', '3mp'],                code: '220', tracking: 'Radio - 3MP (ARN)',       taxType: 'GST on Income' },
  { keywords: ['radio - atn'],                        code: '220', tracking: 'Radio - ATN',             taxType: 'GST on Income' },
  { keywords: ['radio - fox', 'fox fm'],              code: '220', tracking: 'Radio - Fox FM',          taxType: 'GST on Income' },
  { keywords: ['radio - gold', 'gold 104'],           code: '220', tracking: 'Radio - Gold 104.3 (ARN)', taxType: 'GST on Income' },
  { keywords: ['radio - kiis', 'kiis fm'],            code: '220', tracking: 'Radio - KIIS (ARN-Double T)', taxType: 'GST on Income' },
  { keywords: ['radio - nova', 'nova fm'],            code: '220', tracking: 'Radio - Nova FM',         taxType: 'GST on Income' },
  { keywords: ['radio - nz'],                          code: '220', tracking: 'Radio - NZ',              taxType: 'GST on Income' },
  { keywords: ['radio - sen', 'sen radio'],            code: '220', tracking: 'Radio - SEN',             taxType: 'GST on Income' },
  { keywords: ['radio - smooth', 'smoothfm'],          code: '220', tracking: 'Radio - Smoothfm 91.5',  taxType: 'GST on Income' },
  { keywords: ['radio - triple m', 'triple m'],        code: '220', tracking: 'Radio - Triple M',       taxType: 'GST on Income' },
  { keywords: ['radio - tr fm', 'tr fm', 'gold 1242'], code: '220', tracking: 'Radio - TR fm & Gold',   taxType: 'GST on Income' },
  { keywords: ['radio - stellantis'],                  code: '220', tracking: 'Radio - Stellantis',      taxType: 'GST on Income' },
  { keywords: ['radio - zagame'],                      code: '220', tracking: 'Radio - Zagame',          taxType: 'GST on Income' },

  // Generic radio catch-all
  { keywords: ['radio'],                               code: '220', tracking: 'Radio - 3AW',            taxType: 'GST on Income' },

  // TV
  { keywords: ['tv - atn'],                            code: '220', tracking: 'TV - ATN',               taxType: 'GST on Income' },
  { keywords: ['tv - mg'],                             code: '220', tracking: 'TV - MG',                taxType: 'GST on Income' },
  { keywords: ['tv - nine', 'channel 9'],              code: '220', tracking: 'TV - Nine',              taxType: 'GST on Income' },
  { keywords: ['tv - seven', 'channel 7'],             code: '220', tracking: 'TV - Seven',             taxType: 'GST on Income' },
  { keywords: ['tv - southern cross', 'sca'],          code: '220', tracking: 'TV - Southern Cross Austereo', taxType: 'GST on Income' },
  { keywords: ['tv - ten', 'network ten'],             code: '220', tracking: 'TV - Ten',               taxType: 'GST on Income' },
  { keywords: ['tv - win'],                            code: '220', tracking: 'TV - Win Victoria',      taxType: 'GST on Income' },
  { keywords: ['tvc', 'television'],                   code: '220', tracking: 'TV - Nine',              taxType: 'GST on Income' },

  // Print media / newspapers
  { keywords: ['epoch times'],                         code: '220', tracking: 'Paper - Epoch Times',    taxType: 'GST on Income' },
  { keywords: ['fairfax'],                             code: '220', tracking: 'Paper - Fairfax',        taxType: 'GST on Income' },
  { keywords: ['herald sun'],                          code: '220', tracking: 'Paper - Herald Sun',     taxType: 'GST on Income' },
  { keywords: ['indus age'],                           code: '220', tracking: 'Paper - Indus Age',      taxType: 'GST on Income' },
  { keywords: ['jewish news'],                         code: '220', tracking: 'Paper - Jewish News',    taxType: 'GST on Income' },
  { keywords: ['korean today', 'korean paper'],        code: '220', tracking: 'Paper - Korean',         taxType: 'GST on Income' },
  { keywords: ['leader newspaper', 'leader paper'],    code: '220', tracking: 'Paper - Leader',         taxType: 'GST on Income' },
  { keywords: ['metro media services'],                code: '220', tracking: 'Paper - Metro Media Services', taxType: 'GST on Income' },
  { keywords: ['mmp star', 'westernport news', 'frankston news'], code: '220', tracking: 'Paper - MMP Star', taxType: 'GST on Income' },
  { keywords: ['mpng', 'mornington peninsula news'],  code: '220', tracking: 'Paper - MPNG',           taxType: 'GST on Income' },
  { keywords: ['network classifieds', 'cranbourne news', 'dandenong journal', 'berwick news'], code: '220', tracking: 'Paper - Network Classifieds', taxType: 'GST on Income' },
  { keywords: ['philtimes', 'philippine times'],       code: '220', tracking: 'Paper - Philtimes',      taxType: 'GST on Income' },
  { keywords: ['star & mail', 'mt evelyn mail', 'ranges trader'], code: '220', tracking: 'Paper - Star & Mail News Groups', taxType: 'GST on Income' },
  { keywords: ['traralgon express'],                   code: '220', tracking: 'Paper - Traralgon Express', taxType: 'GST on Income' },
  { keywords: ['viet times'],                          code: '220', tracking: 'Paper - Viet Times',     taxType: 'GST on Income' },
  { keywords: ['newspaper', 'paper ad', 'magazine'],   code: '220', tracking: 'Magazine Publications',  taxType: 'GST on Income' },

  // Other media (220)
  { keywords: ['billboard', 'apn outdoor', 'ooh', 'out of home'], code: '220', tracking: 'Billboards', taxType: 'GST on Income' },
  { keywords: ['carsales'],                            code: '220', tracking: 'Carsales.com.au',        taxType: 'GST on Income' },
  { keywords: ['cinema', 'val morgan'],                code: '220', tracking: 'Cinema',                 taxType: 'GST on Income' },
  { keywords: ['digital media-banner', 'digital banner'], code: '220', tracking: 'Digital Media-Banners', taxType: 'GST on Income' },
  { keywords: ['impact screen'],                       code: '220', tracking: 'Impact Screen',          taxType: 'GST on Income' },
  { keywords: ['mms send', 'mms charge'],              code: '220', tracking: 'MMS',                    taxType: 'GST on Income' },
  { keywords: ['sms send', 'sms charge'],              code: '220', tracking: 'SMS',                    taxType: 'GST on Income' },
  { keywords: ['shopping c', 'shop ctr display', 'qicp'], code: '220', tracking: 'Shopping Ctr Display', taxType: 'GST on Income' },

  // Generic media catch-all (220)
  { keywords: ['media buy', 'media booking', 'sponsorship', 'bus shelter'], code: '220', tracking: 'Marketing & Media', taxType: 'GST on Income' },


  // ═══ COA 225 — Website (100% margin) ═══
  {
    keywords: [
      'website', 'landing page', 'seo', 'hosting', 'domain', 'web update',
      'web support', 'leadlink', 'pop up', 'web design', 'engagr',
      'welcome email', 'website hosting', 'website management',
    ],
    code: '225', tracking: 'Websites', taxType: 'GST on Income',
  },


  // ═══ COA 219 — Video Production (100% margin) ═══
  {
    keywords: [
      'video', 'reelmotion', 'test drive video', 'branding video',
      'reels', 'reel', 'photography', 'photo shoot', 'aerial', 'drone',
      'video production', 'video editing',
    ],
    code: '219', tracking: 'Video Productions', taxType: 'GST on Income',
  },


  // ═══ COA 217 — Social Media (100% margin) ═══
  {
    keywords: [
      'organic facebook', 'organic instagram', 'organic social',
      'social media management', 'social content', 'community management',
      'facebook management', 'instagram management',
      'google business profile', 'gbp', 'my business',
      'tiktok management',
    ],
    code: '217', tracking: 'Social Media', taxType: 'GST on Income',
  },


  // ═══ COA 216 — Digital Advertising (100% margin) ═══
  // Management fees for PPC, not the ad spend itself
  {
    keywords: [
      'google search sem', 'gdn management', 'google local ads',
      'google performance max ads management', 'pmax management',
      'google demand gen', 'facebook & instagram management',
      'facebook & instagram lead gen', 'aia management', 'ofaia',
      'display ads management', 'programmatic', 'preroll', 'pre-roll',
      'retargeting management', 'digital advertising',
      'seo package', 'seo set up', 'seo *',
      'microsoft search ads management',
      'fb page set up', 'top up',
    ],
    code: '216', tracking: 'Digital Advertising', taxType: 'GST on Income',
  },


  // ═══ COA 215 — Marketing (100% margin) ═══
  {
    keywords: [
      'strategy', 'consultation', 'consulting', 'planning',
      'market research', 'analytics report', 'copywriting', 'copy',
      'marketing management', 'dealer tagging', 'employment ad',
      'dealer club', 'booking fee',
    ],
    code: '215', tracking: 'Marketing & Media', taxType: 'GST on Income',
  },


  // ═══ COA 205 — Printing (100% margin) ═══
  {
    keywords: [
      'print', 'brochure', 'dl card', 'flyer', 'poster', 'signage',
      'letterhead', 'business card', 'catalogue', 'catalog',
      'promotional item', 'pos ', 'point of sale', 'distribution',
    ],
    code: '205', tracking: 'Printing', taxType: 'GST on Income',
  },


  // ═══ COA 210 — Production (100% margin) — CATCH-ALL ═══
  // Everything that doesn't match above falls here
  {
    keywords: [
      'edm', 'email design', 'design', 'creative', 'artwork',
      'animation', 'retouching', 'layout', 'production',
      'development', 'gdn ads design', 'ad creation',
      'pmax creation', 'microsoft ads creative',
    ],
    code: '210', tracking: 'Production', taxType: 'GST on Income',
  },
]

// ── Default fallback ────────────────────────────────────────────────────────
const DEFAULT_MAPPING: COAMapping = {
  code: '210',
  category: 'Production',
  tracking: 'Production',
  taxType: 'GST on Income',
  margin: 1.0,
}

// ── Main mapping function ───────────────────────────────────────────────────
export function mapToAccount(description: string): COAMapping {
  const lower = (description || '').toLowerCase()

  for (const rule of MAPPING_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      const account = COA_ACCOUNTS[rule.code]
      return {
        code: rule.code,
        category: account.category,
        tracking: rule.tracking,
        taxType: rule.taxType,
        margin: account.margin,
      }
    }
  }

  return { ...DEFAULT_MAPPING }
}

// ── Bulk mapping with confidence scoring ────────────────────────────────────
export interface MappingResult extends COAMapping {
  description: string
  confidence: 'high' | 'medium' | 'low'
  matchedKeyword?: string
}

export function mapToAccountWithConfidence(description: string): MappingResult {
  const lower = (description || '').toLowerCase()

  for (const rule of MAPPING_RULES) {
    const match = rule.keywords.find(kw => lower.includes(kw))
    if (match) {
      const account = COA_ACCOUNTS[rule.code]
      // High confidence if the keyword is specific (>10 chars or exact PPC match)
      const isSpecific = match.length > 10 || ['facebook ppc', 'google ppc', 'payable to meta', 'payable to google'].includes(match)
      return {
        description,
        code: rule.code,
        category: account.category,
        tracking: rule.tracking,
        taxType: rule.taxType,
        margin: account.margin,
        confidence: isSpecific ? 'high' : 'medium',
        matchedKeyword: match,
      }
    }
  }

  return {
    ...DEFAULT_MAPPING,
    description,
    confidence: 'low',
    matchedKeyword: undefined,
  }
}

// ── Validate a manual tracking category → COA code ─────────────────────────
// Used when Monday.com has a tracking dropdown pre-selected
export function trackingToCode(trackingCategory: string): COACode {
  const lower = (trackingCategory || '').toLowerCase()
  for (const rule of MAPPING_RULES) {
    if (rule.tracking.toLowerCase() === lower) {
      return rule.code
    }
  }
  return '210' // default to Production
}
