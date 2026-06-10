import type { AssetDerivativeKind, AssetIntelligenceActionId } from './registry'

export type VideoBucketKind =
  | 'footage'
  | 'stills'
  | 'products'
  | 'logos'
  | 'people'
  | 'backgrounds'
  | 'audio'
  | 'graphics'
  | 'generated'
  | 'exports'

export interface VideoBucketDefinition {
  kind: VideoBucketKind
  name: string
  sortOrder: number
}

export interface VideoProjectBucket extends VideoBucketDefinition {
  id: string
  projectId: string
  createdAt: string
  updatedAt: string
}

export interface VideoBucketItem {
  id: string
  bucketId: string
  assetId: string | null
  r2Key: string | null
  title: string | null
  role: string | null
  directive: Record<string, unknown>
  status: 'ready' | 'draft' | 'processing' | 'blocked'
  createdAt: string
  updatedAt: string
}

export interface VideoAssetDerivative {
  id: string
  sourceAssetId: string
  projectId: string | null
  kind: AssetDerivativeKind
  r2Key: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface VideoAssetIntelligenceJob {
  id: string
  projectId: string
  sourceAssetId: string | null
  bucketItemId: string | null
  action: AssetIntelligenceActionId
  modelId: string
  provider: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
  prompt: string | null
  brushMaskKey: string | null
  outputDerivativeIds: string[]
  errorMessage: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface ReviewableAssemblyPlan {
  projectId: string
  status: 'draft'
  targetFormat: string
  brief: string
  steps: Array<{
    type: 'place-asset' | 'generate-asset' | 'create-caption' | 'create-thumbnail'
    assetId: string | null
    bucketItemId: string
    r2Key: string | null
    title: string | null
    role: string | null
    directive: Record<string, unknown>
    startSec: number
    durationSec: number
  }>
}

export const DEFAULT_VIDEO_BUCKETS: VideoBucketDefinition[] = [
  { kind: 'footage', name: 'Footage', sortOrder: 10 },
  { kind: 'stills', name: 'Stills', sortOrder: 20 },
  { kind: 'products', name: 'Products', sortOrder: 30 },
  { kind: 'logos', name: 'Logos', sortOrder: 40 },
  { kind: 'people', name: 'People', sortOrder: 50 },
  { kind: 'backgrounds', name: 'Backgrounds', sortOrder: 60 },
  { kind: 'audio', name: 'Audio', sortOrder: 70 },
  { kind: 'graphics', name: 'Graphics', sortOrder: 80 },
  { kind: 'generated', name: 'Generated', sortOrder: 90 },
  { kind: 'exports', name: 'Exports', sortOrder: 100 },
]

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value)) return {}
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

export function buildDefaultBucketRows(projectId: string): Array<VideoBucketDefinition & { projectId: string }> {
  return DEFAULT_VIDEO_BUCKETS.map(bucket => ({ ...bucket, projectId }))
}

export function mapBucketRow(row: any): VideoProjectBucket {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    name: row.name,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapBucketItemRow(row: any): VideoBucketItem {
  return {
    id: row.id,
    bucketId: row.bucket_id,
    assetId: row.asset_id ?? null,
    r2Key: row.r2_key ?? null,
    title: row.title ?? null,
    role: row.role ?? null,
    directive: jsonObject(row.directive),
    status: row.status ?? 'ready',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDerivativeRow(row: any): VideoAssetDerivative {
  return {
    id: row.id,
    sourceAssetId: row.source_asset_id,
    projectId: row.project_id ?? null,
    kind: row.kind,
    r2Key: row.r2_key,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    metadata: jsonObject(row.metadata),
    createdAt: row.created_at,
  }
}

export function mapIntelligenceJobRow(row: any): VideoAssetIntelligenceJob {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceAssetId: row.source_asset_id ?? null,
    bucketItemId: row.bucket_item_id ?? null,
    action: row.action,
    modelId: row.model_id,
    provider: row.provider,
    status: row.status,
    prompt: row.prompt ?? null,
    brushMaskKey: row.brush_mask_key ?? null,
    outputDerivativeIds: stringArray(row.output_derivative_ids),
    errorMessage: row.error_message ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
  }
}

export function buildReviewableAssemblyPlan(input: {
  projectId: string
  brief: string
  targetFormat?: string
  bucketItems: VideoBucketItem[]
}): ReviewableAssemblyPlan {
  const usable = input.bucketItems.filter(item => item.status !== 'blocked' && (item.assetId || item.r2Key))
  return {
    projectId: input.projectId,
    status: 'draft',
    targetFormat: input.targetFormat || 'reels_9x16',
    brief: input.brief,
    steps: usable.slice(0, 12).map((item, index) => ({
      type: 'place-asset',
      assetId: item.assetId,
      bucketItemId: item.id,
      r2Key: item.r2Key,
      title: item.title,
      role: item.role,
      directive: item.directive,
      startSec: index * 3,
      durationSec: 3,
    })),
  }
}
