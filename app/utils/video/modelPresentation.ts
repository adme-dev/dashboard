import type { VideoGenerationModel } from '~~/server/utils/video-generation/types'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

export interface VideoModelOption extends VideoGenerationModel {
  label: string
}

export function modelLabelFor(modelId: string | null | undefined): string {
  if (!modelId) return 'Unknown model'
  return getVideoGenerationModel(modelId)?.displayName ?? modelId
}

export function selectableVideoModelOptions(models: VideoGenerationModel[]): VideoModelOption[] {
  return models
    .filter(model => model.defaultEnabled && model.safetyClass !== 'disabled' && model.surface !== 'internal')
    .map(model => ({
      ...model,
      modes: [...model.modes],
      allowedSubjectTypes: [...model.allowedSubjectTypes],
      label: model.displayName
    }))
}

// ── Rich picker presentation ──────────────────────────────────────────────────
// Magnific-style model rows: provider icon + capability sublabel + cost chip.

export interface VideoModelRowPresentation {
  icon: string
  sublabel: string
  costLabel: string
}

const PROVIDER_ICONS: Record<string, string> = {
  aigateway: 'i-lucide-cloud',
  muapi: 'i-lucide-zap'
}

const MODE_LABELS: Record<string, string> = {
  'image-to-video': 'Image → video',
  'text-to-video': 'Text → video',
  'video-extension': 'Extend video',
  'lip-sync': 'Lip sync'
}

const COST_UNIT_SUFFIX: Record<string, string> = {
  second: '/s',
  clip: '/clip',
  generation: '/gen'
}

function durationsLabel(durations: number[]): string {
  if (!durations.length) return ''
  const min = Math.min(...durations)
  const max = Math.max(...durations)
  return min === max ? `${min}s` : `${min}–${max}s`
}

export function videoModelPresentation(model: VideoGenerationModel): VideoModelRowPresentation {
  const parts = model.modes.map(mode => MODE_LABELS[mode] ?? mode)
  const durations = durationsLabel(model.durationsSeconds)
  if (durations) parts.push(durations)
  if (model.supportsNativeAudio) parts.push('Audio')
  return {
    icon: PROVIDER_ICONS[model.provider] ?? 'i-lucide-box',
    sublabel: parts.join(' · '),
    costLabel: `~$${(model.estimatedCostCents / 100).toFixed(2)}${COST_UNIT_SUFFIX[model.costUnit] ?? ''}`
  }
}
