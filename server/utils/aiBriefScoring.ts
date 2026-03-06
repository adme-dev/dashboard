/**
 * Brief completeness scoring — rule-based heuristics.
 */

import { queryOne, queryRows } from '~~/server/utils/db'

export interface BriefCompletenessScore {
  overall: number // 0-100
  breakdown: {
    requiredFieldsScore: number // 0-100
    optionalFieldsScore: number // 0-100
    contentQualityScore: number // 0-100
  }
  fieldScores: Array<{
    fieldKey: string
    fieldLabel: string
    score: number
    recommendation?: string
  }>
  recommendations: string[]
}

// Heuristic content quality score for a single value
function scoreFieldContent(fieldType: string, value: any): number {
  if (value === null || value === undefined) return 0

  switch (fieldType) {
    case 'text':
    case 'textarea':
    case 'richtext': {
      const text = String(value)
      if (text.length === 0) return 0
      if (text.length < 20) return 0.2
      if (text.length < 50) return 0.5
      return 1.0
    }
    case 'dropdown':
    case 'radio':
    case 'client':
    case 'project':
    case 'department':
    case 'user':
      return value ? 1.0 : 0
    case 'multiselect':
    case 'checkboxgroup':
    case 'users':
      return Array.isArray(value) && value.length > 0 ? 1.0 : 0
    case 'checkbox':
      return typeof value === 'boolean' ? 1.0 : 0
    case 'number':
    case 'currency':
    case 'rating':
    case 'slider':
      return typeof value === 'number' || (typeof value === 'string' && value.length > 0) ? 1.0 : 0
    case 'date':
    case 'datetime':
    case 'time':
      return value ? 1.0 : 0
    case 'daterange': {
      if (typeof value === 'object' && value.start && value.end) return 1.0
      return value ? 0.5 : 0
    }
    case 'file':
    case 'image':
      return value ? 1.0 : 0
    case 'files':
    case 'images':
      return Array.isArray(value) && value.length > 0 ? 1.0 : 0
    case 'url':
    case 'email':
    case 'phone':
    case 'link':
      return String(value).length > 3 ? 1.0 : 0
    case 'color':
      return value ? 1.0 : 0
    default:
      return value ? 1.0 : 0
  }
}

function generateFieldRecommendation(fieldType: string, fieldLabel: string, score: number): string | undefined {
  if (score >= 0.8) return undefined

  if (score === 0) {
    return `Fill in "${fieldLabel}" to improve brief completeness`
  }

  if (fieldType === 'text' || fieldType === 'textarea' || fieldType === 'richtext') {
    if (score <= 0.2) return `"${fieldLabel}" is very short — add more detail (50+ characters recommended)`
    if (score <= 0.5) return `"${fieldLabel}" could use more detail for clarity`
  }

  return `Consider providing more information for "${fieldLabel}"`
}

export async function scoreBriefCompleteness(briefId: string): Promise<BriefCompletenessScore> {
  // Get field definitions
  const fields = await queryRows(`
    SELECT btf.id, btf.field_key, btf.field_label, btf.field_type, btf.is_required
    FROM brief_template_fields btf
    JOIN briefs b ON b.template_id = btf.template_id
    WHERE b.id = $1
      AND btf.field_type NOT IN ('heading', 'paragraph', 'divider')
    ORDER BY btf.step_number, btf.sort_order
  `, [briefId])

  // Get field values
  const values = await queryRows(`
    SELECT bfv.field_id, bfv.value
    FROM brief_field_values bfv
    WHERE bfv.brief_id = $1
  `, [briefId])

  const valueMap = new Map(values.map(v => [v.field_id, v.value]))

  const requiredFields = fields.filter(f => f.is_required)
  const optionalFields = fields.filter(f => !f.is_required)

  let requiredFilled = 0
  let optionalFilled = 0
  let qualitySum = 0
  let qualityCount = 0

  const fieldScores: BriefCompletenessScore['fieldScores'] = []
  const recommendations: string[] = []

  for (const field of fields) {
    const rawValue = valueMap.get(field.id)
    // Parse JSON value — brief_field_values stores value as JSON
    let value = rawValue
    if (typeof rawValue === 'string') {
      try { value = JSON.parse(rawValue) } catch { value = rawValue }
    }

    const score = scoreFieldContent(field.field_type, value)

    if (field.is_required) {
      if (score > 0) requiredFilled++
    } else {
      if (score > 0) optionalFilled++
    }

    qualitySum += score
    qualityCount++

    const rec = generateFieldRecommendation(field.field_type, field.field_label, score)
    fieldScores.push({
      fieldKey: field.field_key,
      fieldLabel: field.field_label,
      score: Math.round(score * 100),
      recommendation: rec
    })

    if (rec && field.is_required) {
      recommendations.push(rec)
    }
  }

  // Add optional field recommendations (up to 3)
  const optRecs = fieldScores
    .filter(fs => fs.recommendation && !fields.find(f => f.field_key === fs.fieldKey && f.is_required))
    .slice(0, 3)
  for (const r of optRecs) {
    if (r.recommendation) recommendations.push(r.recommendation)
  }

  const requiredFieldsScore = requiredFields.length > 0
    ? Math.round((requiredFilled / requiredFields.length) * 100)
    : 100

  const optionalFieldsScore = optionalFields.length > 0
    ? Math.round((optionalFilled / optionalFields.length) * 100)
    : 100

  const contentQualityScore = qualityCount > 0
    ? Math.round((qualitySum / qualityCount) * 100)
    : 100

  // Weighted overall: required (40%) + optional (20%) + quality (40%)
  const overall = Math.round(
    requiredFieldsScore * 0.4 +
    optionalFieldsScore * 0.2 +
    contentQualityScore * 0.4
  )

  return {
    overall,
    breakdown: { requiredFieldsScore, optionalFieldsScore, contentQualityScore },
    fieldScores,
    recommendations
  }
}
