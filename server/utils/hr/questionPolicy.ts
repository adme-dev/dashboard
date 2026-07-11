export type HrQuestionIssueCode =
  | 'LEADING_ASSUMPTION'
  | 'UNBALANCED_OPTIONS'
  | 'DOUBLE_BARRELLED'
  | 'PROHIBITED_TOPIC'

export interface HrQuestionQualityIssue {
  code: HrQuestionIssueCode
  message: string
}

export interface HrQuestionQualityInput {
  prompt: string
  options?: string[]
}

export interface HrQuestionQualityResult {
  isPublishable: boolean
  issues: HrQuestionQualityIssue[]
}

const LEADING_PATTERNS = [
  /does(?:n't| not) it\??$/i,
  /wouldn(?:'t| not) you agree/i,
  /do you agree that/i,
  /\b(obviously|clearly|poor|lazy|always|never)\b/i,
  /why do you (?:fail|struggle)/i,
]

const PROHIBITED_PATTERNS = [
  /\bmental health\b/i,
  /\b(?:introvert|extrovert|personality|culture fit|loyalty|psychological profile)\b/i,
  /\b(?:race|racial|colour|ethnic|national extraction|social origin)\b/i,
  /\b(?:sex|gender|gender identity|sexual orientation|intersex)\b/i,
  /\b(?:age|disability|impairment|medical condition|genetic|biometric)\b/i,
  /\b(?:marital status|relationship status|family status|carer status|parental status|pregnan)\w*\b/i,
  /\b(?:union|industrial activity|political|religion|religious)\b/i,
]

function optionsAreUnbalanced(options: string[]): boolean {
  if (options.length < 2) return true
  const normalized = options.map(option => option.trim().toLowerCase())
  const positive = normalized.filter(option => /^(yes|definitely|always|excellent|strongly agree)/.test(option)).length
  const negative = normalized.filter(option => /^(no|never|poor|strongly disagree)/.test(option)).length
  return positive === options.length || negative === options.length
}

export function evaluateHrQuestionQuality(input: HrQuestionQualityInput): HrQuestionQualityResult {
  const issues: HrQuestionQualityIssue[] = []
  const prompt = input.prompt.trim()

  if (LEADING_PATTERNS.some(pattern => pattern.test(prompt))) {
    issues.push({ code: 'LEADING_ASSUMPTION', message: 'Question assumes a problem, fault, or desired answer.' })
  }
  if (PROHIBITED_PATTERNS.some(pattern => pattern.test(prompt))) {
    issues.push({ code: 'PROHIBITED_TOPIC', message: 'Question asks about a prohibited sensitive or personality topic.' })
  }
  if (/\b(?:and|or)\b.+\b(?:and|or)\b/i.test(prompt) && !/not sure or not applicable/i.test(prompt)) {
    issues.push({ code: 'DOUBLE_BARRELLED', message: 'Question may ask about multiple concepts at once.' })
  }
  if (input.options && optionsAreUnbalanced(input.options)) {
    issues.push({ code: 'UNBALANCED_OPTIONS', message: 'Answer options do not provide balanced response paths.' })
  }

  return { isPublishable: issues.length === 0, issues }
}
