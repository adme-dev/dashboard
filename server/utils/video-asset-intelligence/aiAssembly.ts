// aiAssembly.ts — PURE prompt-building and response-parsing for the Groq-backed
// assembly planner. The endpoint asks Groq to select/order project bucket assets
// against the brief and explain the cut; everything here is deterministic and
// unit-testable. The mechanical buildReviewableAssemblyPlan remains the fallback
// whenever the model is unavailable or returns something unusable.
import type { VideoBucketItem, ReviewableAssemblyPlan } from './buckets'

export interface AiAssemblyStep {
  bucketItemId: string
  durationSec: number
}

export interface AiAssemblyResult {
  rationale: string
  steps: AiAssemblyStep[]
}

const MAX_STEPS = 12
const MIN_DURATION = 1
const MAX_DURATION = 10

export function usableBucketItems(items: VideoBucketItem[]): VideoBucketItem[] {
  return items.filter(item => item.status !== 'blocked' && (item.assetId || item.r2Key))
}

export interface AssemblySelectedAssetContext {
  id?: string | null
  title?: string | null
  type?: string | null
  source?: string | null
  prompt?: string | null
  transcript?: string | null
}

export function buildAssemblyPrompt(input: { brief: string, targetFormat: string, items: VideoBucketItem[], selectedAsset?: AssemblySelectedAssetContext | null }): string {
  const lines = input.items.map(item =>
    `- id=${item.id} title=${JSON.stringify(item.title ?? item.r2Key ?? 'untitled')} role=${item.role ?? 'none'}`
  )
  const selectedAssetLines = input.selectedAsset
    ? [
        '',
        'Selected editor asset to consider as the anchor:',
        `- id=${input.selectedAsset.id ?? 'unknown'} title=${JSON.stringify(input.selectedAsset.title ?? 'untitled')} type=${input.selectedAsset.type ?? 'unknown'} source=${input.selectedAsset.source ?? 'unknown'}`,
        ...(input.selectedAsset.prompt ? [`- prompt=${JSON.stringify(input.selectedAsset.prompt.slice(0, 500))}`] : []),
        ...(input.selectedAsset.transcript ? [`- transcript=${JSON.stringify(input.selectedAsset.transcript.slice(0, 500))}`] : []),
      ]
    : []
  return [
    `Brief: ${input.brief}`,
    `Output format: ${input.targetFormat}`,
    '',
    'Available project assets:',
    ...lines,
    ...selectedAssetLines,
    '',
    'Select and order the assets that best serve the brief (you may omit weak ones,',
    `use at most ${MAX_STEPS}), give each a duration in seconds (${MIN_DURATION}-${MAX_DURATION}),`,
    'and explain the cut in 1-3 sentences for a producer reviewing the draft.',
    'Respond with ONLY this JSON shape:',
    '{ "rationale": "string", "steps": [{ "bucketItemId": "id", "durationSec": number }] }'
  ].join('\n')
}

/** Tolerant parse of the model response. Returns null when nothing usable came
 * back (caller falls back to the mechanical plan). Unknown ids are dropped,
 * durations are clamped, and duplicate ids keep their first occurrence. */
export function parseAssemblyAiResponse(text: string, items: VideoBucketItem[]): AiAssemblyResult | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const raw = parsed as { rationale?: unknown, steps?: unknown }
  if (!Array.isArray(raw.steps)) return null

  const validIds = new Set(usableBucketItems(items).map(item => item.id))
  const seen = new Set<string>()
  const steps: AiAssemblyStep[] = []
  for (const step of raw.steps) {
    if (!step || typeof step !== 'object') continue
    const id = (step as { bucketItemId?: unknown }).bucketItemId
    if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    const duration = Number((step as { durationSec?: unknown }).durationSec)
    steps.push({
      bucketItemId: id,
      durationSec: Number.isFinite(duration) ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, duration)) : 3
    })
    if (steps.length >= MAX_STEPS) break
  }
  if (!steps.length) return null

  return {
    rationale: typeof raw.rationale === 'string' ? raw.rationale.trim().slice(0, 1000) : '',
    steps
  }
}

/** Materialise an AI step list into the reviewable plan shape (sequential starts). */
export function planFromAiAssembly(input: {
  projectId: string
  brief: string
  targetFormat: string
  items: VideoBucketItem[]
  ai: AiAssemblyResult
}): ReviewableAssemblyPlan & { rationale: string } {
  const byId = new Map(input.items.map(item => [item.id, item]))
  let cursor = 0
  const steps = input.ai.steps.flatMap((step) => {
    const item = byId.get(step.bucketItemId)
    if (!item) return []
    const startSec = cursor
    cursor += step.durationSec
    return [{
      type: 'place-asset' as const,
      assetId: item.assetId,
      bucketItemId: item.id,
      r2Key: item.r2Key,
      title: item.title,
      role: item.role,
      directive: item.directive,
      startSec,
      durationSec: step.durationSec
    }]
  })
  return {
    projectId: input.projectId,
    status: 'draft',
    targetFormat: input.targetFormat,
    brief: input.brief,
    rationale: input.ai.rationale,
    steps
  }
}
