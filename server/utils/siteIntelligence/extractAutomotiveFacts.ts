import type { AutomotivePageFacts, SiteIntelligencePageType } from '~~/app/types/site-intelligence'

export const AUTOMOTIVE_EXTRACTION_VERSION = 'automotive-deterministic-v1'

export interface AutomotiveFactEvidence {
  field: string
  excerpt: string
}

export interface AutomotiveExtractionResult {
  extractionVersion: typeof AUTOMOTIVE_EXTRACTION_VERSION
  canonicalUrl: string
  facts: AutomotivePageFacts
  evidence: AutomotiveFactEvidence[]
}

type JsonRecord = Record<string, unknown>

const TRACKING_PARAMS = /^(utm_.+|gclid|dclid|fbclid|msclkid|mc_[ce]id)$/i
const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
}

export function canonicalizeSiteIntelligenceUrl(input: string): string {
  try {
    const url = new URL(input)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    const retained = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMS.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
      ))
    url.search = ''
    for (const [key, value] of retained) url.searchParams.append(key, value)
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return input.trim()
  }
}

export function canonicalizeAutomotiveContent(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractAutomotiveFacts(
  markdown: string,
  metadata: Record<string, unknown>
): AutomotiveExtractionResult {
  const canonicalText = canonicalizeAutomotiveContent(markdown)
  const plainText = markdownToPlainText(canonicalText)
  const sourceUrl = typeof metadata.url === 'string' ? metadata.url : ''
  const structured = selectStructuredVehicle(metadata.jsonLd)
  const structuredOffers = isRecord(structured?.offers) ? structured.offers : null
  const evidence: AutomotiveFactEvidence[] = []

  const structuredPrice = parseMoney(structuredOffers?.price)
  const visibleDriveAway = firstMatch(plainText, /((?:AUD\s*)?\$\s*[\d,]+(?:\.\d{1,2})?)\s*(?:drive[ -]?away|d\/a)\b/i)
  const driveAwayPrice = structuredPrice ?? parseMoney(visibleDriveAway?.[1])
  const driveAwayPriceDisplay = driveAwayPrice === null
    ? null
    : structuredPrice !== null
      ? formatAud(structuredPrice)
      : normalizeMoneyDisplay(visibleDriveAway?.[1])
  addEvidence(evidence, 'driveAwayPrice', driveAwayPriceDisplay)

  const listPriceMatch = firstMatch(plainText, /(?:list|recommended retail|rrp)\s*(?:price)?\s*[:-]?\s*((?:AUD\s*)?\$\s*[\d,]+(?:\.\d{1,2})?)/i)
  const discountMatch = firstMatch(plainText, /(?:save|discount(?:ed)?(?: by)?)\s*[:-]?\s*((?:AUD\s*)?\$\s*[\d,]+(?:\.\d{1,2})?)/i)
  const repaymentMatch = firstMatch(plainText, /((?:AUD\s*)?\$\s*[\d,]+(?:\.\d{1,2})?)\s*(?:per|a|\/)\s*(week|weekly|fortnight|fortnightly|month|monthly)\b/i)
  const comparisonRateMatch = firstMatch(plainText, /(\d{1,2}(?:\.\d{1,3})?\s*%\s*comparison rate)\b/i)
  const termMatch = firstMatch(plainText, /\b(\d{1,3})\s*(month|months|year|years)\b/i)
  const depositMatch = firstMatch(plainText, /(?:deposit|upfront)\s*(?:of)?\s*[:-]?\s*((?:AUD\s*)?\$\s*[\d,]+(?:\.\d{1,2})?)/i)
  const balloonMatch = firstMatch(plainText, /(?:balloon|residual)(?: payment| value)?\s*(?:of)?\s*[:-]?\s*((?:AUD\s*)?\$\s*[\d,]+(?:\.\d{1,2})?)/i)
  const eligibilityMatch = firstMatch(plainText, /\b((?:Australian residents?|approved applicants?|ABN holders?)[^.\n]{0,120}(?:only|apply|eligible)?)/i)
  const expiryMatch = firstMatch(plainText, /\b((?:offer\s+)?(?:ends?|expires?|valid until)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}))\b/i)

  const repaymentPeriod = normalizeRepaymentPeriod(repaymentMatch?.[2])
  const comparisonRateDisplay = normalizePercentDisplay(comparisonRateMatch?.[1])
  const termCount = termMatch?.[1]
  const termUnit = termMatch?.[2]
  const termDisplay = termCount && termUnit ? `${termCount} ${termUnit.toLowerCase()}` : null
  const termMonths = termCount && termUnit ? normalizeTermMonths(Number(termCount), termUnit) : null
  const expiryDay = expiryMatch?.[2]
  const expiryMonth = expiryMatch?.[3]
  const expiryYear = expiryMatch?.[4]
  const expiry = expiryDay && expiryMonth && expiryYear
    ? parseWrittenDate(expiryDay, expiryMonth, expiryYear)
    : null
  addEvidence(evidence, 'finance.repayment', repaymentMatch ? `${normalizeMoneyDisplay(repaymentMatch[1])} per ${repaymentPeriod}` : null)
  addEvidence(evidence, 'finance.comparisonRate', comparisonRateDisplay)
  addEvidence(evidence, 'finance.termMonths', termDisplay)
  addEvidence(evidence, 'expiry', expiryMatch?.[1])

  const ctas = extractCtas(plainText, evidence)
  const disclaimers = extractDisclaimers(canonicalText)
  const modelYear = parseModelYear(structured?.vehicleModelDate) ?? parseModelYear(plainText)
  const variant = cleanText(structured?.vehicleConfiguration)
  const model = cleanText(structured?.model)
  const brand = cleanText(readNestedString(structured?.brand, 'name') ?? structured?.brand)
  const combinedVehicleText = [variant, model, plainText].filter(Boolean).join(' ')
  const stockState = structuredAvailability(structuredOffers?.availability) ?? extractStockState(plainText)
  const offerTypes = extractOfferTypes(plainText, {
    hasPrice: driveAwayPrice !== null || listPriceMatch !== null || discountMatch !== null,
    hasFinance: repaymentMatch !== null || comparisonRateMatch !== null
  })

  const facts: AutomotivePageFacts = {
    pageType: inferPageType(sourceUrl, plainText, structured),
    brand,
    model,
    variant,
    bodyType: extractBodyType(combinedVehicleText),
    powertrain: extractPowertrain(combinedVehicleText),
    modelYear,
    stockState,
    driveAwayPrice,
    driveAwayPriceDisplay,
    listPrice: parseMoney(listPriceMatch?.[1]),
    listPriceDisplay: normalizeMoneyDisplay(listPriceMatch?.[1]),
    discount: parseMoney(discountMatch?.[1]),
    discountDisplay: normalizeMoneyDisplay(discountMatch?.[1]),
    offerTypes,
    finance: {
      deposit: parseMoney(depositMatch?.[1]),
      depositDisplay: normalizeMoneyDisplay(depositMatch?.[1]),
      repayment: parseMoney(repaymentMatch?.[1]),
      repaymentDisplay: repaymentMatch ? `${normalizeMoneyDisplay(repaymentMatch[1])} per ${repaymentPeriod}` : null,
      repaymentPeriod,
      comparisonRate: parsePercent(comparisonRateMatch?.[1]),
      comparisonRateDisplay,
      termMonths,
      termDisplay,
      balloon: parseMoney(balloonMatch?.[1]),
      balloonDisplay: normalizeMoneyDisplay(balloonMatch?.[1]),
      eligibility: cleanText(eligibilityMatch?.[1])
    },
    expiry,
    ctas,
    disclaimers
  }

  return {
    extractionVersion: AUTOMOTIVE_EXTRACTION_VERSION,
    canonicalUrl: canonicalizeSiteIntelligenceUrl(sourceUrl),
    facts,
    evidence: deduplicateEvidence(evidence)
  }
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[-#>*+]+\s*/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstMatch(input: string, pattern: RegExp): RegExpMatchArray | null {
  return input.match(pattern)
}

function parseMoney(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null
  if (typeof input !== 'string' || !/\d/.test(input)) return null
  const normalized = input.replace(/[^\d.-]/g, '')
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function formatAud(value: number): string {
  return `$${new Intl.NumberFormat('en-AU', { maximumFractionDigits: value % 1 ? 2 : 0 }).format(value)}`
}

function normalizeMoneyDisplay(input: unknown): string | null {
  const value = parseMoney(input)
  return value === null ? null : formatAud(value)
}

function parsePercent(input: unknown): number | null {
  if (typeof input !== 'string') return null
  const match = input.match(/(\d{1,2}(?:\.\d{1,3})?)\s*%/)
  if (!match) return null
  const value = Number(match[1])
  return value >= 0 && value <= 100 ? value : null
}

function normalizePercentDisplay(input: unknown): string | null {
  const value = parsePercent(input)
  return value === null ? null : `${value}% comparison rate`
}

function normalizeRepaymentPeriod(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.toLowerCase()
  if (value.startsWith('week')) return 'week'
  if (value.startsWith('fortnight')) return 'fortnight'
  if (value.startsWith('month')) return 'month'
  return null
}

function normalizeTermMonths(value: number, unit: string): number | null {
  if (!Number.isInteger(value) || value <= 0) return null
  return unit.toLowerCase().startsWith('year') ? value * 12 : value
}

function parseWrittenDate(dayInput: string, monthInput: string, yearInput: string): string | null {
  const day = Number(dayInput)
  const month = MONTHS[monthInput.toLowerCase()]
  const year = Number(yearInput)
  if (!month || year < 2000 || year > 2100 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseModelYear(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null
  const match = String(input).match(/\b(20\d{2})\b/)
  if (!match) return null
  const value = Number(match[1])
  return value >= 2000 && value <= 2100 ? value : null
}

function cleanText(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.replace(/\s+/g, ' ').trim()
  return value ? value.slice(0, 160) : null
}

function readNestedString(input: unknown, key: string): string | null {
  return isRecord(input) ? cleanText(input[key]) : null
}

function isRecord(input: unknown): input is JsonRecord {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function selectStructuredVehicle(input: unknown): JsonRecord | null {
  const candidates: JsonRecord[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!isRecord(value)) return
    candidates.push(value)
    if (Array.isArray(value['@graph'])) value['@graph'].forEach(visit)
  }
  visit(input)
  const selected = candidates.find((candidate) => {
    const types = Array.isArray(candidate['@type']) ? candidate['@type'] : [candidate['@type']]
    return types.some(type => typeof type === 'string' && /vehicle|product/i.test(type))
  }) ?? candidates.find(candidate => isRecord(candidate.offers))
  if (!selected) return null
  return { ...selected, offers: normalizeOffer(selected.offers) }
}

function normalizeOffer(input: unknown): JsonRecord | null {
  if (Array.isArray(input)) return input.find(isRecord) ?? null
  return isRecord(input) ? input : null
}

function structuredAvailability(input: unknown): AutomotivePageFacts['stockState'] {
  if (typeof input !== 'string') return null
  if (/InStock$/i.test(input)) return 'in_stock'
  return null
}

function extractStockState(input: string): AutomotivePageFacts['stockState'] {
  if (/\bdemonstrator\b|\bdemo\b/i.test(input)) return 'demonstrator'
  if (/\bused vehicle\b|\bpre-owned\b/i.test(input)) return 'used'
  if (/\bnew vehicle\b/i.test(input)) return 'new'
  if (/\bin stock\b|\bavailable now\b/i.test(input)) return 'in_stock'
  return null
}

function extractBodyType(input: string): string | null {
  const match = input.match(/\b(SUV|ute|sedan|hatch(?:back)?|wagon|coupe|convertible|van)\b/i)
  const bodyType = match?.[1]
  return bodyType ? bodyType.toUpperCase() === 'SUV' ? 'SUV' : bodyType.toLowerCase() : null
}

function extractPowertrain(input: string): string | null {
  if (/\bplug[ -]?in hybrid\b|\bPHEV\b/i.test(input)) return 'plug-in hybrid'
  if (/\bhybrid\b/i.test(input)) return 'hybrid'
  if (/\belectric\b|\bEV\b/i.test(input)) return 'electric'
  if (/\bdiesel\b/i.test(input)) return 'diesel'
  if (/\bpetrol\b/i.test(input)) return 'petrol'
  return null
}

function inferPageType(url: string, text: string, structured: JsonRecord | null): SiteIntelligencePageType {
  let path: string
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    path = ''
  }
  if (/\/offers?|\/specials?|\/promotions?/.test(path) || isRecord(structured?.offers)) return 'offer'
  if (/\/finance/.test(path) || /comparison rate|repayment|finance/i.test(text)) return 'finance'
  if (/\/inventory|\/stock|\/vehicles/.test(path)) return 'inventory'
  if (/\/service/.test(path)) return 'service'
  if (/\/locations?|\/contact/.test(path)) return 'location'
  if (/\/news|\/articles?|\/blog/.test(path)) return 'article'
  if (path === '' || path === '/') return 'homepage'
  if (/\/models?|\/range/.test(path)) return 'model'
  return 'other'
}

function extractCtas(input: string, evidence: AutomotiveFactEvidence[]): string[] {
  const definitions: Array<[string, RegExp, string]> = [
    ['test_drive', /\b(book|request|arrange)\s+(?:a\s+)?test drive\b/i, 'Book a test drive'],
    ['get_quote', /\b(get|request)\s+(?:a\s+)?quote\b/i, 'Get a quote'],
    ['enquire', /\b(enquire|make an enquiry)\b/i, 'Enquire'],
    ['call', /\b(call us|phone us)\b/i, 'Call us'],
    ['configure', /\b(build|configure)\s+(?:your|a)\b/i, 'Configure'],
    ['reserve', /\b(reserve|secure)\s+(?:now|online|this vehicle)?\b/i, 'Reserve'],
    ['inventory', /\b(view|search|browse)\s+(?:our\s+)?(?:stock|inventory)\b/i, 'View inventory']
  ]
  const values: string[] = []
  for (const [value, pattern, excerpt] of definitions) {
    if (!pattern.test(input)) continue
    values.push(value)
    addEvidence(evidence, 'ctas', excerpt)
  }
  return values.sort()
}

function extractOfferTypes(input: string, flags: { hasPrice: boolean, hasFinance: boolean }): string[] {
  const values = new Set<string>()
  if (flags.hasPrice) values.add('price')
  if (flags.hasFinance) values.add('finance')
  if (/factory bonus/i.test(input)) values.add('factory_bonus')
  if (/trade[ -]?in bonus/i.test(input)) values.add('trade_in_bonus')
  if (/free accessories|accessory pack/i.test(input)) values.add('accessories')
  if (/warranty/i.test(input)) values.add('warranty')
  if (/free servicing|service plan/i.test(input)) values.add('servicing')
  if (/free delivery|delivery included/i.test(input)) values.add('delivery')
  return [...values].sort()
}

function extractDisclaimers(markdown: string): string[] {
  const lines = markdown.split('\n').map(line => line.trim())
  return [...new Set(lines
    .filter(line => (
      /^(?:[*†#]+\s*)?(?:terms(?: and conditions)?|fees,|comparison rate)/i.test(line)
      || (
        /^(?:[*†#]+\s*)?finance\b/i.test(line)
        && /criteria|fees? apply|terms? apply|conditions apply/i.test(line)
      )
    ))
    .map(line => line.replace(/^[*†#]+\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 500))
    .filter(Boolean))]
    .sort()
    .slice(0, 10)
}

function addEvidence(evidence: AutomotiveFactEvidence[], field: string, input: unknown): void {
  const excerpt = cleanText(input)?.slice(0, 240)
  if (excerpt) evidence.push({ field, excerpt })
}

function deduplicateEvidence(evidence: AutomotiveFactEvidence[]): AutomotiveFactEvidence[] {
  const seen = new Set<string>()
  return evidence
    .filter((item) => {
      const key = `${item.field}\u0000${item.excerpt}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => left.field.localeCompare(right.field) || left.excerpt.localeCompare(right.excerpt))
}
