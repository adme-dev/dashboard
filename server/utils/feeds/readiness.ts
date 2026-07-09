import type {
  FeedPreviewValidation,
  FeedReadinessFixMode,
  FeedReadinessIssueGroup,
  FeedReadinessStatus,
  FeedReadinessSummary
} from './types'

type IssueClassification = {
  key: string
  label: string
  field: string
  fixMode: FeedReadinessFixMode
}

type IssueText = {
  field: string
  message: string
  text: string
}

const ISSUE_CLASSIFICATIONS: Array<{ match: RegExp, classification: IssueClassification }> = [
  {
    match: /\b(url|link|landing[_\s-]?page|vehicle[_\s-]?url|web[_\s-]?url|vdp)\b/i,
    classification: { key: 'url', label: 'Vehicle URL', field: 'url', fixMode: 'source_required' }
  },
  {
    match: /\b(price|amount|sale[_\s-]?price|dap[_\s-]?price)\b/i,
    classification: { key: 'price', label: 'Price', field: 'price', fixMode: 'source_required' }
  },
  {
    match: /\b(image|image[_\s-]?link|photo|thumbnail|picture)\b/i,
    classification: { key: 'image', label: 'Image', field: 'image', fixMode: 'source_required' }
  },
  {
    match: /\b(condition|listing[_\s-]?type|stock[_\s-]?type|new|used|demo)\b/i,
    classification: { key: 'condition', label: 'Condition', field: 'condition', fixMode: 'ai_assisted' }
  },
  {
    match: /\b(title|name|headline)\b/i,
    classification: { key: 'title', label: 'Title', field: 'title', fixMode: 'ai_assisted' }
  },
  {
    match: /\b(description|body|copy)\b/i,
    classification: { key: 'description', label: 'Description', field: 'description', fixMode: 'ai_assisted' }
  },
  {
    match: /\b(store[_\s-]?code|location[_\s-]?code)\b/i,
    classification: { key: 'store_code', label: 'Store code', field: 'store_code', fixMode: 'mapping_required' }
  }
]

function issueText(issue: unknown): IssueText {
  if (typeof issue === 'string') return { field: '', message: issue, text: issue }
  if (typeof issue === 'number' || typeof issue === 'boolean') {
    const text = String(issue)
    return { field: '', message: text, text }
  }
  if (issue && typeof issue === 'object' && !Array.isArray(issue)) {
    const value = issue as Record<string, unknown>
    const field = typeof value.field === 'string'
      ? value.field
      : typeof value.path === 'string'
        ? value.path
        : ''
    const message = typeof value.message === 'string'
      ? value.message
      : typeof value.reason === 'string'
        ? value.reason
        : typeof value.code === 'string'
          ? value.code
          : ''
    const fallback = field || message || 'Validation issue'
    return { field, message: message || fallback, text: `${field} ${message}`.trim() || fallback }
  }
  return { field: '', message: 'Validation issue', text: 'Validation issue' }
}

function classifyIssue(issue: unknown): IssueClassification {
  const text = issueText(issue)
  const haystack = `${text.field} ${text.message} ${text.text}`.toLowerCase()
  const matched = ISSUE_CLASSIFICATIONS.find(item => item.match.test(haystack))
  if (matched) return matched.classification
  return { key: 'other', label: 'Other validation issue', field: 'other', fixMode: 'manual_review' }
}

function readinessStatus(validation: FeedPreviewValidation): FeedReadinessStatus {
  const matchedTotal = Number(validation.matchedTotal) || 0
  const validatedTotal = Number(validation.validatedTotal) || 0
  const invalidTotal = Number(validation.invalidTotal) || Math.max(matchedTotal - validatedTotal, 0)

  if (matchedTotal === 0) return 'empty'
  if (validatedTotal >= matchedTotal && invalidTotal === 0) return 'ready'
  if (validatedTotal > 0) return 'partial'
  if (invalidTotal > 0) return 'blocked'
  return 'unknown'
}

function incrementFixMode(summary: Omit<FeedReadinessSummary, 'issueGroups'>, fixMode: FeedReadinessFixMode) {
  if (fixMode === 'source_required') summary.sourceRequiredCount += 1
  else if (fixMode === 'ai_assisted') summary.aiAssistedCount += 1
  else if (fixMode === 'mapping_required') summary.mappingRequiredCount += 1
  else summary.manualReviewCount += 1
}

export function summarizeFeedReadiness(validation?: FeedPreviewValidation): FeedReadinessSummary {
  if (!validation) {
    return {
      status: 'unknown',
      matchedTotal: 0,
      validatedTotal: 0,
      invalidTotal: 0,
      issueGroups: [],
      sourceRequiredCount: 0,
      aiAssistedCount: 0,
      mappingRequiredCount: 0,
      manualReviewCount: 0
    }
  }

  const matchedTotal = Number(validation.matchedTotal) || 0
  const validatedTotal = Number(validation.validatedTotal) || 0
  const invalidTotal = Number(validation.invalidTotal) || Math.max(matchedTotal - validatedTotal, 0)
  const base = {
    status: readinessStatus(validation),
    matchedTotal,
    validatedTotal,
    invalidTotal,
    sourceRequiredCount: 0,
    aiAssistedCount: 0,
    mappingRequiredCount: 0,
    manualReviewCount: 0
  }
  const grouped = new Map<string, FeedReadinessIssueGroup>()

  for (const summary of validation.invalidSummaries || []) {
    for (const issue of summary.issues || []) {
      const text = issueText(issue)
      const classification = classifyIssue(issue)
      const existing = grouped.get(classification.key)
      if (existing) {
        existing.count += 1
        if (summary.id && existing.sampleIds.length < 5 && !existing.sampleIds.includes(summary.id)) {
          existing.sampleIds.push(summary.id)
        }
        if (text.message && existing.messages.length < 3 && !existing.messages.includes(text.message)) {
          existing.messages.push(text.message)
        }
      } else {
        grouped.set(classification.key, {
          key: classification.key,
          label: classification.label,
          field: classification.field,
          count: 1,
          fixMode: classification.fixMode,
          sampleIds: summary.id ? [summary.id] : [],
          messages: text.message ? [text.message] : []
        })
      }
      incrementFixMode(base, classification.fixMode)
    }
  }

  return {
    ...base,
    issueGroups: Array.from(grouped.values()).sort((a, b) => b.count - a.count)
  }
}
