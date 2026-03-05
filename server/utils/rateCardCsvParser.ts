/**
 * Rate Card CSV Parser — parses ADME service menu CSV format.
 *
 * CSV structure:
 * - Column B (index 1): service name or category header
 * - Column C (index 2): media price (used for Voice Over rates)
 * - Column D (index 3): ADME price
 * - Category headers: rows with text in col B but no price in col C or D
 * - Setup fees: extracted from parenthetical notes in service name
 */

export interface ParsedRateCardItem {
  category: string
  serviceName: string
  price: number | null  // null for POA items
  priceUnit: string
  setupFee: number
  setupNotes: string
  notes: string
}

export interface ParsedCsvResult {
  categories: string[]
  items: ParsedRateCardItem[]
  errors: string[]
}

function parsePrice(raw: string): number | null {
  if (!raw || raw.trim() === '') return null
  const trimmed = raw.trim().toUpperCase()
  if (trimmed === 'POA') return null

  // Strip $ and commas, handle negative
  const cleaned = trimmed.replace(/[$,]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function extractSetupFee(serviceName: string): { cleanName: string; setupFee: number; setupNotes: string } {
  let setupFee = 0
  let setupNotes = ''

  // Match patterns like:
  // "$350 once off set up"
  // "$350 Once off set up"
  // "$495 for creative & copy"
  // "$350 set up"
  // "+$350 Set Up"
  // "(+$350 Once off set up)"
  // "$250 Set up"
  const setupPatterns = [
    /\(\*?\+?\$?([\d,]+)\s+(?:once\s*off\s+)?set\s*up[^)]*\)/gi,
    /\(\+?\$?([\d,]+)\s+for\s+[^)]+\)/gi,
    /\+\s*\$?([\d,]+)\s+(?:once\s*off\s+)?set\s*up/gi,
    /\$?([\d,]+)\s+once\s*off\s+set\s*up/gi,
  ]

  for (const pattern of setupPatterns) {
    const match = serviceName.match(pattern)
    if (match) {
      // Extract dollar amount from the first match
      const amountMatch = match[0].match(/\$?([\d,]+)/)
      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''))
        if (!isNaN(amount) && amount > 0) {
          setupFee = amount
          setupNotes = match[0].replace(/^\(|\)$/g, '').replace(/^\*?\+?/, '').trim()
          break
        }
      }
    }
  }

  // Clean service name: remove the setup fee notation
  let cleanName = serviceName
  for (const pattern of setupPatterns) {
    cleanName = cleanName.replace(pattern, '').trim()
  }
  // Clean up remaining artifacts
  cleanName = cleanName.replace(/\s*\(\s*\)\s*/g, '').replace(/\s+/g, ' ').trim()

  return { cleanName, setupFee, setupNotes }
}

function detectPriceUnit(serviceName: string, rawPrice: string): string {
  const lower = serviceName.toLowerCase()
  const priceStr = rawPrice.trim().toLowerCase()

  if (priceStr === 'poa') return 'POA'
  if (priceStr.includes('p/h') || lower.includes('p/h') || lower.includes('per hour')) return 'per-hour'
  if (lower.includes('per month') || lower.includes('p/m') || lower.includes('monthly') || lower.includes('per staff member')) return 'per-month'
  if (lower.includes('per unit') || lower.includes('per sms') || lower.includes('per mms') || lower.includes('cost per')) return 'per-unit'

  return 'once-off'
}

function isLikelyCategoryHeader(cols: string[]): boolean {
  const text = (cols[1] || '').trim()
  const priceC = (cols[2] || '').trim()
  const priceD = (cols[3] || '').trim()

  // Must have text in column B
  if (!text) return false

  // Must NOT have a price in column C or D
  if (priceC && priceC !== '' && parsePrice(priceC) !== null) return false
  if (priceD && priceD !== '' && parsePrice(priceD) !== null) return false

  // Category headers are typically ALL CAPS or Title Case short phrases
  // and don't contain pricing info
  if (text.length > 100) return false

  // Skip known non-category lines
  const lower = text.toLowerCase()
  if (lower.startsWith('*please note')) return false
  if (lower.startsWith('effective')) return false
  if (lower.startsWith('service menu')) return false
  if (lower.includes('include live inventory')) return false

  return true
}

export function parseRateCardCsv(csvText: string): ParsedCsvResult {
  const lines = csvText.split('\n')
  const categories: string[] = []
  const items: ParsedRateCardItem[] = []
  const errors: string[] = []

  let currentCategory = 'Uncategorized'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV parsing (handles quoted fields with commas)
    const cols = parseCsvLine(line)

    const textB = (cols[1] || '').trim()
    const priceC = (cols[2] || '').trim()
    const priceD = (cols[3] || '').trim()

    // Skip empty rows and header rows
    if (!textB) continue
    if (textB.toUpperCase() === 'SERVICE MENU') continue
    if (textB.toLowerCase().startsWith('effective')) continue
    if (textB.toLowerCase().startsWith('*please note')) continue

    // Check if this is a category header
    if (isLikelyCategoryHeader(cols)) {
      const catName = textB
        .replace(/\s+/g, ' ')
        .trim()
      if (catName && catName.length > 1) {
        currentCategory = catName
        if (!categories.includes(catName)) {
          categories.push(catName)
        }
      }
      continue
    }

    // This is a service line item — determine price
    // Voice Over section uses column C (MEDIA price), everything else uses column D (ADME price)
    let rawPrice = priceD || priceC
    let price = parsePrice(rawPrice)

    // Handle "POA" text in the price column
    const isPOA = (priceD || priceC || '').trim().toUpperCase() === 'POA'

    // Handle "$150 p/h" style prices
    if (rawPrice.includes('p/h')) {
      rawPrice = rawPrice.replace(/\s*p\/h\s*/i, '')
      price = parsePrice(rawPrice)
    }

    // Skip rows that are continuation text (multi-line descriptions with no price)
    if (price === null && !isPOA) {
      // Could be a continuation of the previous item's notes
      if (items.length > 0 && textB.length > 0) {
        const last = items[items.length - 1]
        last.notes = last.notes ? `${last.notes} ${textB}` : textB
      }
      continue
    }

    // Extract setup fee from service name
    const { cleanName, setupFee, setupNotes } = extractSetupFee(textB)
    const priceUnit = detectPriceUnit(textB, rawPrice)

    items.push({
      category: currentCategory,
      serviceName: cleanName,
      price: isPOA ? null : price,
      priceUnit: isPOA ? 'POA' : priceUnit,
      setupFee,
      setupNotes,
      notes: isPOA ? 'Price on application' : '',
    })
  }

  return { categories, items, errors }
}

/** Parse a single CSV line, handling quoted fields with commas */
function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cols.push(current)

  return cols
}
