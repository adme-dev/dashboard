/**
 * ADME Advertising — Media Tracking Categories
 *
 * All 62 tracking categories from the 'Dropdown Menu for Media Tracking' workbook.
 * These map to Xero's TrackingName1 = 'Media', TrackingOption1 = category name.
 *
 * Source: Dropdown_menu_for_Media_Tracking.xlsx (Kellie White, Oct 2024)
 *
 * DISCREPANCY NOTES (verified against Kellie's COA list in email):
 *   - Dropdown shows "Digital Advertising → (215)" but Kellie's COA says 215=Marketing, 216=Digital Advertising
 *   - Dropdown shows "Social Media → (215)" but Kellie's COA says 217=Social Media
 *   - Dropdown shows "Video Productions → (217)" but Kellie's COA says 219=Video Production
 *   - Dropdown shows "Websites → (230)" but Kellie's COA says 225=Website (230 doesn't exist in COA list)
 *   - Dropdown includes "IT & Cloud Platforms → (325)" which isn't in Kellie's COA list
 *   RESOLUTION: Using Kellie's email COA codes as authoritative (these are the Xero chart of accounts).
 *   The dropdown descriptions are used for TrackingOption1 values.
 */

import type { COACode, GSTType } from './coa-map'

export interface TrackingCategory {
  name: string              // exact dropdown value (used as TrackingOption1)
  coaCode: COACode          // Xero chart of accounts code
  gstType: GSTType          // GST classification
  description: string       // what this covers
  vendors?: string[]        // specific vendor names (for media buys)
}

export const TRACKING_CATEGORIES: TrackingCategory[] = [
  // ── COA 330 — PPC / Passthrough (0% margin) ──
  { name: 'Facebook Ads',          coaCode: '330', gstType: 'GST Free Expenses',  description: 'Facebook/Meta/Instagram PPC spend — GST FREE' },
  { name: 'Google Ads',            coaCode: '330', gstType: 'GST on Expenses',    description: 'Google Search/Display/PMax PPC spend — GST payable' },
  { name: 'Digital Media-YouTube', coaCode: '330', gstType: 'GST on Expenses',    description: 'YouTube PPV/pre-roll — Google GST payable' },
  { name: 'Microsoft Ads',         coaCode: '330', gstType: 'GST on Expenses',    description: 'Bing/Yahoo PPC — GST payable' },
  { name: 'LinkedIN',              coaCode: '330', gstType: 'GST on Expenses',    description: 'LinkedIn PPC — GST payable' },
  { name: 'Spotify',               coaCode: '330', gstType: 'GST on Expenses',    description: 'Spotify audio ads — GST payable' },
  { name: 'Emailing',              coaCode: '330', gstType: 'GST on Expenses',    description: 'Campaign Monitor eDM send fees — GST payable' },
  { name: 'Dispatch Fees TVC',     coaCode: '330', gstType: 'GST on Expenses',    description: 'TVC dispatch/distribution fees — GST payable' },

  // ── COA 220 — Media (10% margin) ──
  { name: 'Billboards',                     coaCode: '220', gstType: 'GST on Income', description: 'OOH/billboard advertising',      vendors: ['APN Outdoor'] },
  { name: 'Carsales.com.au',                coaCode: '220', gstType: 'GST on Income', description: 'Carsales media (not IT/Cloud)' },
  { name: 'Cinema',                          coaCode: '220', gstType: 'GST on Income', description: 'Cinema advertising',             vendors: ['Val Morgan', 'Star Media Platinum', 'Media Motive'] },
  { name: 'Digital Media-Banners',           coaCode: '220', gstType: 'GST on Income', description: 'Digital display/banner ads',     vendors: ['Epoch Times digital'] },
  { name: 'Impact Screen',                  coaCode: '220', gstType: 'GST on Income', description: 'Shopping centre impact screens', vendors: ['Val Morgan Outdoor'] },
  { name: 'Magazine Publications',           coaCode: '220', gstType: 'GST on Income', description: 'Magazine print media' },
  { name: 'MMS',                             coaCode: '220', gstType: 'GST on Income', description: 'MMS send charges' },
  { name: 'SMS',                             coaCode: '220', gstType: 'GST on Income', description: 'SMS send charges' },
  { name: 'Shopping Ctr Display',            coaCode: '220', gstType: 'GST on Income', description: 'Shopping centre displays',      vendors: ['QICP Epping'] },

  // Newspapers
  { name: 'Paper - Epoch Times',             coaCode: '220', gstType: 'GST on Income', description: 'Epoch Times print' },
  { name: 'Paper - Fairfax',                coaCode: '220', gstType: 'GST on Income', description: 'Fairfax newspapers' },
  { name: 'Paper - Herald Sun',             coaCode: '220', gstType: 'GST on Income', description: 'Herald Sun' },
  { name: 'Paper - Indus Age',              coaCode: '220', gstType: 'GST on Income', description: 'Indus Age newspaper' },
  { name: 'Paper - Jewish News',            coaCode: '220', gstType: 'GST on Income', description: 'Jewish News' },
  { name: 'Paper - Korean',                 coaCode: '220', gstType: 'GST on Income', description: 'Korean Today newspaper' },
  { name: 'Paper - Leader',                 coaCode: '220', gstType: 'GST on Income', description: 'Leader/Valley Weekly/Eastern/Northern Star Weekly' },
  { name: 'Paper - Metro Media Services',   coaCode: '220', gstType: 'GST on Income', description: 'SW Brimbank, SW Northern' },
  { name: 'Paper - MMP Star',               coaCode: '220', gstType: 'GST on Income', description: 'WesternPort/Southern Peninsula/Mornington/Frankston News' },
  { name: 'Paper - MPNG',                   coaCode: '220', gstType: 'GST on Income', description: 'Mornington Peninsula News Group' },
  { name: 'Paper - Network Classifieds',    coaCode: '220', gstType: 'GST on Income', description: 'Cranbourne/Dandenong/Berwick News' },
  { name: 'Paper - Philtimes',              coaCode: '220', gstType: 'GST on Income', description: 'Philippine Times' },
  { name: 'Paper - Star & Mail News Groups', coaCode: '220', gstType: 'GST on Income', description: 'Mt Evelyn Mail/Ranges Trader' },
  { name: 'Paper - Traralgon Express',      coaCode: '220', gstType: 'GST on Income', description: 'Traralgon Express' },
  { name: 'Paper - Viet Times',             coaCode: '220', gstType: 'GST on Income', description: 'Vietnamese Times' },

  // Radio
  { name: 'Radio - 101.1 Mix FM',           coaCode: '220', gstType: 'GST on Income', description: 'Mix FM radio' },
  { name: 'Radio - 3AW',                    coaCode: '220', gstType: 'GST on Income', description: '3AW radio' },
  { name: 'Radio - 3CW (Chinese)',           coaCode: '220', gstType: 'GST on Income', description: 'Chinese radio 3CW' },
  { name: 'Radio - 3GG',                    coaCode: '220', gstType: 'GST on Income', description: '3GG radio (Gippsland)' },
  { name: 'Radio - 3MP (ARN)',              coaCode: '220', gstType: 'GST on Income', description: '3MP radio' },
  { name: 'Radio - ATN',                    coaCode: '220', gstType: 'GST on Income', description: 'ATN radio' },
  { name: 'Radio - Fox FM',                 coaCode: '220', gstType: 'GST on Income', description: 'Fox FM radio' },
  { name: 'Radio - Gold 104.3 (ARN)',       coaCode: '220', gstType: 'GST on Income', description: 'Gold 104.3 radio' },
  { name: 'Radio - KIIS (ARN-Double T)',    coaCode: '220', gstType: 'GST on Income', description: 'KIIS FM radio' },
  { name: 'Radio - Nova FM',                coaCode: '220', gstType: 'GST on Income', description: 'Nova FM radio' },
  { name: 'Radio - NZ',                     coaCode: '220', gstType: 'GST on Income', description: 'NZ radio (MediaWorks)' },
  { name: 'Radio - SEN',                    coaCode: '220', gstType: 'GST on Income', description: 'SEN sports radio' },
  { name: 'Radio - Smoothfm 91.5',          coaCode: '220', gstType: 'GST on Income', description: 'Smooth FM radio' },
  { name: 'Radio - Triple M',               coaCode: '220', gstType: 'GST on Income', description: 'Triple M radio' },
  { name: 'Radio - TR fm & Gold',           coaCode: '220', gstType: 'GST on Income', description: 'Gippsland TR FM 99.5/99.9, Gold 1242/FM 98.3' },
  { name: 'Radio - Stellantis',             coaCode: '220', gstType: 'GST on Income', description: 'Stellantis radio' },
  { name: 'Radio - Zagame',                 coaCode: '220', gstType: 'GST on Income', description: 'Zagame radio' },

  // TV
  { name: 'TV - ATN',                       coaCode: '220', gstType: 'GST on Income', description: 'ATN television' },
  { name: 'TV - MG',                        coaCode: '220', gstType: 'GST on Income', description: 'MG television' },
  { name: 'TV - Nine',                      coaCode: '220', gstType: 'GST on Income', description: 'Channel Nine' },
  { name: 'TV - Seven',                     coaCode: '220', gstType: 'GST on Income', description: 'Channel Seven' },
  { name: 'TV - Southern Cross Austereo',   coaCode: '220', gstType: 'GST on Income', description: 'SCA television' },
  { name: 'TV - Ten',                       coaCode: '220', gstType: 'GST on Income', description: 'Network Ten' },
  { name: 'TV - Win Victoria',              coaCode: '220', gstType: 'GST on Income', description: 'WIN TV Victoria' },

  // ── COA 216 — Digital Advertising (100% margin) ──
  { name: 'Digital Advertising',  coaCode: '216', gstType: 'GST on Income', description: 'PPC management fees, SEO, SEM management, display management' },

  // ── COA 215 — Marketing (100% margin) ──
  { name: 'Marketing & Media',   coaCode: '215', gstType: 'GST on Income', description: 'Strategy, media booking fees, consultation' },
  { name: 'Social Media',        coaCode: '217', gstType: 'GST on Income', description: 'Organic social management, community management, GBP' },

  // ── COA 205 — Printing (100% margin) ──
  { name: 'Printing',            coaCode: '205', gstType: 'GST on Income', description: 'Print production & distribution' },
  { name: 'Promotional Items',   coaCode: '205', gstType: 'GST on Income', description: 'POS, promotional merchandise' },

  // ── COA 210 — Production (100% margin) ──
  { name: 'Production',          coaCode: '210', gstType: 'GST on Income', description: 'Design, EDM, creative, animation, retouching' },

  // ── COA 219 — Video Production (100% margin) ──
  { name: 'Video Productions',   coaCode: '219', gstType: 'GST on Income', description: 'Video, TVC, Reels, photography' },

  // ── COA 225 — Website (100% margin) ──
  { name: 'Websites',            coaCode: '225', gstType: 'GST on Income', description: 'Website hosting, management, landing pages, pop-ups' },
]

// ── Lookup by name ──────────────────────────────────────────────────────────
export function getTrackingCategory(name: string): TrackingCategory | undefined {
  return TRACKING_CATEGORIES.find(t => t.name.toLowerCase() === name.toLowerCase())
}

// ── Get all categories for a given COA code ─────────────────────────────────
export function getCategoriesForCOA(code: COACode): TrackingCategory[] {
  return TRACKING_CATEGORIES.filter(t => t.coaCode === code)
}

// ── Dropdown options for UI ─────────────────────────────────────────────────
export function getDropdownOptions(): string[] {
  return TRACKING_CATEGORIES.map(t => t.name).sort()
}
