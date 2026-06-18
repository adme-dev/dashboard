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
const VOICEOVER_INTENT_RE = /\b(voiceover|voice over|voice|narrat|script|read|spoken|announcer)\b/i
const OVERLAY_INTENT_RE = /\b(overlay|logo|graphic|lower third|lower-third|cta|call to action|offer badge|badge)\b/i
const CAPTION_INTENT_RE = /\b(caption|captions|subtitle|subtitles|burn[- ]?in text|on[- ]?screen text)\b/i

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

function timelineDurationSec(plan: ReviewableAssemblyPlan): number {
  return plan.steps.reduce((max, step) => Math.max(max, (step.startSec ?? 0) + (step.durationSec ?? 0)), 0)
}

function overlayCandidate(items: VideoBucketItem[]): VideoBucketItem | null {
  return usableBucketItems(items).find((item) => {
    const text = `${item.role ?? ''} ${item.title ?? ''} ${item.r2Key ?? ''}`
    return /\b(overlay|logo|brand|graphic|lower|cta|badge)\b/i.test(text)
  }) ?? null
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

export function withProducerLaneSteps(plan: ReviewableAssemblyPlan & { rationale?: string }, input: {
  brief: string
  items: VideoBucketItem[]
  selectedAsset?: AssemblySelectedAssetContext | null
}): ReviewableAssemblyPlan & { rationale?: string } {
  const existingTypes = new Set(plan.steps.map(step => step.type))
  const durationSec = Math.max(3, timelineDurationSec(plan))
  const steps = [...plan.steps]

  if (!existingTypes.has('place-voiceover') && VOICEOVER_INTENT_RE.test(input.brief)) {
    steps.push({
      type: 'place-voiceover',
      assetId: null,
      bucketItemId: null,
      r2Key: null,
      title: 'Voiceover placement',
      role: 'voiceover',
      directive: {
        instruction: 'Place or generate a voiceover against the visual draft.',
        source: input.selectedAsset?.transcript ? 'selected-asset-transcript' : 'producer-brief',
      },
      startSec: 0,
      durationSec,
    })
  }

  const overlayItem = overlayCandidate(input.items)
  if (!existingTypes.has('place-overlay') && OVERLAY_INTENT_RE.test(input.brief)) {
    steps.push({
      type: 'place-overlay',
      assetId: overlayItem?.assetId ?? null,
      bucketItemId: overlayItem?.id ?? null,
      r2Key: overlayItem?.r2Key ?? null,
      title: overlayItem?.title ?? 'Overlay placement',
      role: overlayItem?.role ?? 'overlay',
      directive: {
        instruction: 'Place a brand, offer, or CTA overlay above the visual draft.',
        source: overlayItem ? 'project-bucket' : 'producer-brief',
      },
      startSec: Math.max(0, durationSec - Math.min(3, durationSec)),
      durationSec: Math.min(3, durationSec),
    })
  }

  const captionRequested = CAPTION_INTENT_RE.test(input.brief) || Boolean(input.selectedAsset?.transcript && VOICEOVER_INTENT_RE.test(input.brief))
  if (!existingTypes.has('create-caption') && captionRequested) {
    steps.push({
      type: 'create-caption',
      assetId: input.selectedAsset?.id ?? null,
      bucketItemId: null,
      r2Key: null,
      title: 'Caption requirement',
      role: 'captions',
      directive: {
        instruction: 'Create burn-in captions or subtitles for the final render.',
        source: input.selectedAsset?.transcript ? 'selected-asset-transcript' : 'producer-brief',
      },
      startSec: 0,
      durationSec,
    })
  }

  return { ...plan, steps }
}
