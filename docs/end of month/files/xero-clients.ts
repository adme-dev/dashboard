/**
 * ADME Advertising — Xero Client Registry
 *
 * All 161 Xero contacts with account codes. Used for:
 * 1. Validating Monday.com client names against Xero legal entities
 * 2. Fuzzy matching when Monday uses shorthand (e.g. "Northern" → "Northern Motor Group")
 * 3. Determining payment terms (7-day standard, 14-day for Northern Group)
 * 4. TrackingName2 = 'Client', TrackingOption2 = exact Xero contact name
 *
 * Source: Customers_Xero.csv (exported from Xero Contacts)
 */

export interface XeroClient {
  name: string    // exact Xero contact name (must match for import)
  code: string    // Xero account number
}

export const XERO_CLIENTS: XeroClient[] = [
  { name: 'Alan Mance Holden & HSV', code: 'AM2' },\n  { name: 'Alan Mance Holden Melton', code: 'AM3' },\n  { name: 'Alan Mance Kia', code: 'AM4' },\n  { name: 'Alan Mance Melton & Bacchus Marsh', code: 'AM5' },\n  { name: 'Alan Mance Melton Mitsubishi & Nissan', code: 'AM7' },\n  { name: 'Alan Mance Mitsubishi', code: 'AM6' },\n  { name: 'Alan Mance Mitsubishi Footscray, Isuzu, Suzuki, Chery', code: 'AM9' },\n  { name: 'Alan Mance Motors Pty Ltd', code: 'AM1' },\n  { name: 'Alfagomma Australia Pty Ltd', code: 'ALFA' },\n  { name: 'Arctic Campers Pty Ltd', code: 'ARCAMP' },\n  { name: 'Astoria GWM', code: 'BAH8' },\n  { name: 'Ballarat BMW', code: 'BMH6 Motus' },\n  { name: 'Ballarat City Subaru', code: 'BMH3 Motus' },\n  { name: 'Ballarat GMSV & Holden', code: 'BMH4 Motus' },\n  { name: 'Ballarat Isuzu Ute', code: 'BMH IU' },\n  { name: 'Ballarat Mazda', code: 'BMJLR1 Motus' },\n  { name: 'Ballarat Motor Holdings Pty Ltd', code: 'BMH7 Motus' },\n  { name: 'Ballarat Skoda', code: 'BMH2 Motus' },\n  { name: 'Bay City Auto Group', code: 'BCAG1' },\n  { name: 'Bay City Holden & HSV', code: 'BCAG2' },\n  { name: 'Bay City Mahindra', code: 'BCAG11' },\n  { name: 'Bayside European', code: 'BSMG1' },\n  { name: 'Bayside Skoda', code: 'BSMG2' },\n  { name: 'Beachside Volkswagen', code: 'BSMG3' },\n  { name: 'Berwick GWM/Haval', code: 'BerMGrp-GH' },\n  { name: 'Berwick Jeep', code: 'BerMGrp-J' },\n  { name: 'Berwick KIA', code: 'BerMGrp-K' },\n  { name: 'Berwick Motor Group Pty Ltd', code: 'BerMG-Group' },\n  { name: 'Berwick Nissan', code: 'BerMGrp-N' },\n  { name: 'Berwick KGM Ssangyong', code: 'BerMGrp-SS' },\n  { name: 'Blood Auto Group Pty Ltd', code: 'BLMGRP1' },\n  { name: 'Blood Hyundai', code: 'BLMGRP2' },\n  { name: 'Blood Suzuki', code: 'BLMGRP3' },\n  { name: 'Brighton Auto', code: 'BAG1' },\n  { name: 'Brighton Automotive Holdings Pty Ltd', code: 'BAH1' },\n  { name: 'Brighton Holden', code: 'BAG3' },\n  { name: 'Brighton Hyundai', code: 'BAG8' },\n  { name: 'Brighton INEOS', code: 'BAH7' },\n  { name: 'Brighton MG', code: 'BAG6' },\n  { name: 'Brighton Mitsubishi', code: 'BAG4' },\n  { name: 'Brighton Nissan', code: 'BAH2' },\n  { name: 'Brighton Renault', code: 'BAH4' },\n  { name: 'Brighton Service', code: 'BAG7' },\n  { name: 'Brighton Suzuki', code: 'BAH3' },\n  { name: 'Caravan Hire Co Pty Ltd', code: 'CHC' },\n  { name: 'Chadstone Kia', code: 'GWSO1' },\n  { name: 'Chadstone Mitsubishi', code: 'GWSO2' },\n  { name: 'Chery Mornington', code: 'MDG8' },\n  { name: 'City Mazda', code: 'EAGERS2' },\n  { name: 'Coffey Ford', code: 'EAGERS3' },\n  { name: 'Courtney and Patterson Ford', code: 'CPFORD1' },\n  { name: 'Courtney and Patterson Ford Service', code: 'CPFORD2' },\n  { name: 'DanceSport Australia', code: 'DSA' },\n  { name: 'Dr Neels du Toit', code: 'DRTOIT' },\n  { name: 'Eagers VIC Pty Ltd', code: 'EAGERS1' },\n  { name: 'Ferntree Gully Automotive', code: 'FTGD1' },\n  { name: 'Ferntree Gully Chery', code: 'FTGD8' },\n  { name: 'Ferntree Gully Holden & GMSV', code: 'FTGD2' },\n  { name: 'Ferntree Gully Isuzu Ute', code: 'FTGD6' },\n  { name: 'Ferntree Gully JAC', code: 'FTGD9' },\n  { name: 'Ferntree Gully LDV', code: 'FTGD3' },\n  { name: 'Ferntree Gully KGM Ssangyong', code: 'FTGD7' },\n  { name: 'Ferntree Gully Suzuki', code: 'FTGD4' },\n  { name: 'Ferntree Gully Volkswagen', code: 'FTGD5' },\n  { name: 'FNQ Motor Group Pty Ltd', code: 'FNQM1' },\n  { name: 'Frankston GMSV', code: 'BCAG13' },\n  { name: 'Frankston Isuzu Ute', code: 'BCAG9' },\n  { name: 'Frankston KIA', code: 'BCAG4' },\n  { name: 'Frankston Mahindra', code: 'BCAG12' },\n  { name: 'Frankston Mitsubishi', code: 'BCAG5' },\n  { name: 'Frankston Nissan', code: 'BCAG6' },\n  { name: 'Frankston Renault', code: 'BCAG10' },\n  { name: 'Frankston KGM Ssangyong', code: 'BCAG7' },\n  { name: 'Frankston Suzuki', code: 'BCAG3' },\n  { name: 'Garry and Warren Smith', code: 'GWSO4' },\n  { name: 'Garry and Warren Smith Honda', code: 'GWSS1' },\n  { name: 'Garry and Warren Smith Suzuki', code: 'GWSO3' },\n  { name: 'Geelong Chery', code: 'BLMGRP4' },\n  { name: 'Geelong KIA', code: 'BLMGRP5' },\n  { name: 'Geelong Mazda', code: 'BLMGRP6' },\n  { name: 'Gendore Group', code: 'GTM2' },\n  { name: 'Gendore Tractors & Machinery Pty Ltd', code: 'GTM1' },\n  { name: 'Get You Finance Pty Ltd', code: 'GUF' },\n  { name: 'Gippsland Isuzu Ute', code: 'GMG6 Motus' },\n  { name: 'Gippsland Land Rover', code: 'VSL7' },\n  { name: 'Gippsland MG', code: 'VSL1' },\n  { name: 'Gippsland Motor Group Pty Ltd', code: 'GMG5' },\n  { name: 'Gippsland Suzuki', code: 'VSL4' },\n  { name: 'GWS Kia', code: 'GWSS2' },\n  { name: 'GWS Peninsula Honda', code: 'GWSS3' },\n  { name: 'GWS Springvale Pty Ltd', code: 'GWSS4' },\n  { name: 'Innisfail Mazda', code: 'FNQM2' },\n  { name: 'Innisfail Nissan', code: 'FNQM3' },\n  { name: 'Island Coast Ford', code: 'FNQM4' },\n  { name: 'Island Coast Mitsubishi', code: 'FNQM5' },\n  { name: 'Kevin Dennis Holden & HSV', code: 'KDM1' },\n  { name: 'Kevin Dennis Skoda', code: 'KDM2' },\n  { name: 'Kevin Dennis Volkswagen', code: 'KDM3' },\n  { name: 'Knox GWM', code: 'KNOX1' },\n  { name: 'Leongatha Holden', code: 'GMG7' },\n  { name: 'Leongatha Isuzu Ute', code: 'GMG3' },\n  { name: 'Leongatha Subaru', code: 'GMG-LS' },\n  { name: 'Mansfield Motor Group VIC', code: 'MFMG' },\n  { name: 'Melbourne City Hyundai', code: 'EAGERS4' },\n  { name: 'Melbourne City MG', code: 'EAGERS5' },\n  { name: 'Mentone GWM', code: 'BAH9' },\n  { name: 'Mentone LDV', code: 'BAH6' },\n  { name: 'Mercedes-Benz Ringwood', code: 'EAGERS6' },\n  { name: 'Mornington JAC Motors', code: 'PDG2' },\n  { name: 'Mornington Kia', code: 'PDG3' },\n  { name: 'Mornington Mazda', code: 'MOM' },\n  { name: 'Mornington MG', code: 'MDG3' },\n  { name: 'Mornington Nissan', code: 'BCAG8' },\n  { name: 'Motus Australia Pty Ltd', code: 'Motus' },\n  { name: 'National Car Buyers', code: 'NCB' },\n  { name: 'North Eastern 4x4', code: 'CPFORD3' },\n  { name: 'Northern Isuzu Ute', code: 'NMG9' },\n  { name: 'Northern JAC Motors', code: 'NMG18' },\n  { name: 'Northern Jeep', code: 'NMG6' },\n  { name: 'Northern KIA', code: 'NMG10' },\n  { name: 'Northern MG', code: 'NMG11' },\n  { name: 'Northern Motor Group', code: 'NMG1' },\n  { name: 'Northern Motor Group Service (415)', code: 'NMG16' },\n  { name: 'Northern Nissan', code: 'NMG12' },\n  { name: 'Northern RAM', code: 'NMG14' },\n  { name: 'Northern KGM Ssangyong', code: 'NMG15' },\n  { name: 'Northern Used Cars', code: 'NMG3' },\n  { name: 'P.M. Regional Pty Ltd', code: 'PMR1' },\n  { name: 'Pakenham Isuzu Ute', code: 'PAKIU' },\n  { name: 'Peninsula Dealer Group - Ford', code: 'PDG1' },\n  { name: 'Peter Davey Suzuki', code: 'PDWT1' },\n  { name: 'Sale Ford', code: 'SMG2' },\n  { name: 'Sale Hyundai', code: 'SMG3' },\n  { name: 'Sale Motors Group', code: 'SMG1' },\n  { name: 'Sale Nissan', code: 'SMG4' },\n  { name: 'Snowy River RV Pty Ltd', code: 'SRRV' },\n  { name: 'Springwood Mazda', code: 'OLDM1' },\n  { name: 'The Big Garage', code: 'TBG1' },\n  { name: 'Traralgon Automotive Group', code: 'TAGRP' },\n  { name: 'Traralgon GMSV', code: 'GMG8' },\n  { name: 'Traralgon Mazda', code: 'TLMG2' },\n  { name: 'Traralgon Mitsubishi', code: 'GMG4' },\n  { name: 'Traralgon Subaru', code: 'TLMG4' },\n  { name: 'Traralgon Volkswagen', code: 'VSL6' },\n  { name: 'Valley 4x4 and Outdoor', code: 'VMG7' },\n  { name: 'Valley Ford', code: 'VMG4' },\n  { name: 'Valley GWM', code: 'VMG8' },\n  { name: 'Valley Kia', code: 'VMG6' },\n  { name: 'Valley Motor Group Pty Ltd', code: 'VMG1' },\n  { name: 'Valley Polaris', code: 'VMG9' },\n  { name: 'Victorian Motor Traders Pty Ltd', code: 'VMT' },\n  { name: 'Victorian RV Sales Pty Ltd', code: 'VRVS' },\n  { name: 'Volvo Cars Waverley', code: 'WMG7' },\n  { name: 'Waverley MG', code: 'WMG9' },\n  { name: 'Waverley Mitsubishi', code: 'WMG6' },\n  { name: 'Waverley Nissan', code: 'WMG3' },\n  { name: 'Waverley Renault', code: 'WMG4' },\n  { name: 'Waverley Skoda', code: 'WMG8' },\n  { name: 'Waverley Volkswagen', code: 'WMG5' },\n  { name: 'Werribee Toyota', code: 'PDWT2' },\n  { name: 'Zupps Aspley', code: 'ZUPP' }
]

// ── Dealer Groups (shared code prefix = same ownership group) ──────────────
export const DEALER_GROUPS: Record<string, string[]> = {
  'Alan Mance': ['AM1','AM2','AM3','AM4','AM5','AM6','AM7','AM9'],
  'Bay City / Frankston / Mornington': ['BCAG1','BCAG2','BCAG3','BCAG4','BCAG5','BCAG6','BCAG7','BCAG8','BCAG9','BCAG10','BCAG11','BCAG12','BCAG13'],
  'Brighton': ['BAG1','BAG3','BAG4','BAG6','BAG7','BAG8','BAH1','BAH2','BAH3','BAH4','BAH6','BAH7','BAH8','BAH9'],
  'Ballarat Motor Holdings': ['BMH2 Motus','BMH3 Motus','BMH4 Motus','BMH6 Motus','BMH7 Motus','BMH IU','BMJLR1 Motus'],
  'Berwick Motor Group': ['BerMG-Group','BerMGrp-GH','BerMGrp-J','BerMGrp-K','BerMGrp-N','BerMGrp-SS'],
  'Blood Auto Group': ['BLMGRP1','BLMGRP2','BLMGRP3','BLMGRP4','BLMGRP5','BLMGRP6'],
  'Eagers': ['EAGERS1','EAGERS2','EAGERS3','EAGERS4','EAGERS5','EAGERS6'],
  'Ferntree Gully': ['FTGD1','FTGD2','FTGD3','FTGD4','FTGD5','FTGD6','FTGD7','FTGD8','FTGD9'],
  'FNQ Motor Group': ['FNQM1','FNQM2','FNQM3','FNQM4','FNQM5'],
  'Garry & Warren Smith': ['GWSO1','GWSO2','GWSO3','GWSO4','GWSS1','GWSS2','GWSS3','GWSS4'],
  'Gippsland Motor Group': ['GMG3','GMG4','GMG5','GMG6 Motus','GMG7','GMG8'],
  'Kevin Dennis': ['KDM1','KDM2','KDM3'],
  'Northern Motor Group': ['NMG1','NMG3','NMG6','NMG9','NMG10','NMG11','NMG12','NMG14','NMG15','NMG16','NMG18'],
  'Peninsula / Mornington': ['PDG1','PDG2','PDG3'],
  'Sale Motors Group': ['SMG1','SMG2','SMG3','SMG4'],
  'Traralgon': ['GMG4','GMG8','TAGRP','TLMG2','TLMG4','VSL6'],
  'Valley Motor Group': ['VMG1','VMG4','VMG6','VMG7','VMG8','VMG9'],
  'Waverley': ['WMG3','WMG4','WMG5','WMG6','WMG7','WMG8','WMG9'],
}

// ── Payment Terms ───────────────────────────────────────────────────────────
// Standard: 7 days from invoice date
// Northern Group: 14 days from invoice date

export const FOURTEEN_DAY_CLIENTS = [
  'Northern Motor Group',
  'Northern Isuzu Ute',
  'Northern JAC Motors',
  'Northern Jeep',
  'Northern KIA',
  'Northern MG',
  'Northern Motor Group Service (415)',
  'Northern Nissan',
  'Northern RAM',
  'Northern KGM Ssangyong',
  'Northern Used Cars',
]

export function getPaymentTermDays(clientName: string): 7 | 14 {
  return FOURTEEN_DAY_CLIENTS.some(c => clientName.includes(c)) ? 14 : 7
}

// ── Fuzzy matching ──────────────────────────────────────────────────────────
// Monday.com often uses shorthand client names that don't match Xero exactly.
// This finds the best match from the 161 Xero contacts.

export function matchClient(mondayName: string): XeroClient | null {
  const lower = mondayName.toLowerCase().trim()

  // Exact match first
  const exact = XERO_CLIENTS.find(c => c.name.toLowerCase() === lower)
  if (exact) return exact

  // Contains match (Monday name is substring of Xero name or vice versa)
  const contains = XERO_CLIENTS.find(c =>
    c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  )
  if (contains) return contains

  // Word overlap scoring
  const mondayWords = lower.split(/[\s,&-]+/).filter(w => w.length > 2)
  let bestMatch: XeroClient | null = null
  let bestScore = 0

  for (const client of XERO_CLIENTS) {
    const clientWords = client.name.toLowerCase().split(/[\s,&-]+/).filter(w => w.length > 2)
    const overlap = mondayWords.filter(w => clientWords.some(cw => cw.includes(w) || w.includes(cw)))
    const score = overlap.length / Math.max(mondayWords.length, 1)
    if (score > bestScore && score >= 0.5) {
      bestScore = score
      bestMatch = client
    }
  }

  return bestMatch
}

// ── Lookup by account code ──────────────────────────────────────────────────
export function getClientByCode(code: string): XeroClient | undefined {
  return XERO_CLIENTS.find(c => c.code === code)
}
