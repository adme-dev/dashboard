/**
 * Rate Card Fuzzy Matcher — matches Xero invoice line item descriptions
 * to rate card service names using string similarity techniques.
 */

export interface RateCardMatch {
  itemId: string
  serviceName: string
  price: number
  priceUnit: string
  categoryName: string
  confidence: number
}

interface RateCardEntry {
  id: string
  serviceName: string
  price: number
  priceUnit: string
  categoryName: string
}

// Words to strip for better matching (common filler in both Xero descriptions and rate card names)
const STOP_WORDS = new Set([
  'management', 'monthly', 'per', 'month', 'fee', 'service', 'services',
  'inc', 'including', 'includes', 'and', 'the', 'for', 'with', 'of',
  'set', 'up', 'setup', 'once', 'off', 'ongoing', 'subscription',
])

/** Normalize a string for comparison: lowercase, strip punctuation, remove stop words */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .join(' ')
    .trim()
}

/** Get unique words from a normalized string */
function getWords(text: string): Set<string> {
  return new Set(text.split(/\s+/).filter(Boolean))
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B| */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const word of a) {
    if (b.has(word)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Substring containment check — does one string contain the other? */
function containsScore(normalized: string, target: string): number {
  if (normalized.includes(target) || target.includes(normalized)) return 0.3
  return 0
}

/** Word-level overlap — what fraction of target words appear in source? */
function wordOverlap(sourceWords: Set<string>, targetWords: Set<string>): number {
  if (targetWords.size === 0) return 0
  let matches = 0
  for (const word of targetWords) {
    if (sourceWords.has(word)) matches++
  }
  return matches / targetWords.size
}

/**
 * Find the best matching rate card item for a given Xero line item description.
 * Returns null if no match exceeds the confidence threshold.
 */
export function findBestMatch(
  description: string,
  rateCardItems: RateCardEntry[],
  threshold = 0.6
): RateCardMatch | null {
  const normDesc = normalize(description)
  const descWords = getWords(normDesc)

  if (descWords.size === 0) return null

  let bestMatch: RateCardMatch | null = null
  let bestScore = 0

  for (const item of rateCardItems) {
    const normItem = normalize(item.serviceName)
    const itemWords = getWords(normItem)

    if (itemWords.size === 0) continue

    // Multi-signal scoring
    const jaccard = jaccardSimilarity(descWords, itemWords)
    const contains = containsScore(normDesc, normItem)
    const overlap = wordOverlap(descWords, itemWords)

    // Weighted composite: Jaccard (40%) + word overlap (40%) + contains bonus (20%)
    const score = (jaccard * 0.4) + (overlap * 0.4) + (contains * 0.2)

    if (score > bestScore) {
      bestScore = score
      bestMatch = {
        itemId: item.id,
        serviceName: item.serviceName,
        price: item.price,
        priceUnit: item.priceUnit,
        categoryName: item.categoryName,
        confidence: Math.min(score, 1.0),
      }
    }
  }

  return bestMatch && bestMatch.confidence >= threshold ? bestMatch : null
}

/**
 * Match all line items against rate card, returning only flagged undercharges.
 */
export function matchLineItems(
  lineItems: { description: string; unitAmount: number; quantity: number }[],
  rateCardItems: RateCardEntry[],
  varianceThreshold = -10
): {
  match: RateCardMatch
  description: string
  charged: number
  quantity: number
  variance: number
  potentialLoss: number
}[] {
  const flagged: any[] = []

  for (const li of lineItems) {
    if (!li.description) continue

    const match = findBestMatch(li.description, rateCardItems)
    if (!match) continue
    if (match.priceUnit === 'POA') continue

    const charged = li.unitAmount
    const expected = match.price
    if (expected <= 0) continue

    const variance = ((charged - expected) / expected) * 100

    if (variance < varianceThreshold) {
      flagged.push({
        match,
        description: li.description,
        charged,
        quantity: li.quantity,
        variance: Math.round(variance * 10) / 10,
        potentialLoss: Math.round((expected - charged) * (li.quantity || 1) * 100) / 100,
      })
    }
  }

  return flagged
}
