export type CreativeAssetType = 'audio' | 'video' | 'banner' | 'render' | 'caption' | 'capture' | 'unknown'
export type CreativeVersionKind
  = | 'original'
    | 'take'
    | 'effect'
    | 'platform_export'
    | 'render'
    | 'derivative'
    | 'transcript'
    | 'capture'
export type CreativeVersionStatus = 'queued' | 'running' | 'ready' | 'failed' | 'blocked' | 'archived'

export interface CreativeVersionSourceRef {
  source: string
  id: string
}

export interface CreativeVersionSource {
  id: string
  assetType: CreativeAssetType
  versionKind: CreativeVersionKind
  status: CreativeVersionStatus
  sourceRef: CreativeVersionSourceRef
  parentIds?: string[]
  label?: string | null
  favorite?: boolean
  createdAt?: string | Date | null
  metadata?: Record<string, unknown>
}

export interface CreativeVersionNode extends Required<Omit<CreativeVersionSource, 'label' | 'createdAt' | 'metadata'>> {
  label: string
  createdAt: string
  metadata: Record<string, unknown>
  rootId: string
  lineageDepth: number
}

export type CreativeVersionFindingCode = 'duplicate_node' | 'missing_parent' | 'cycle'
export type CreativeVersionFindingSeverity = 'warning' | 'error'

export interface CreativeVersionFinding {
  code: CreativeVersionFindingCode
  severity: CreativeVersionFindingSeverity
  nodeId: string
  message: string
  parentId?: string
}

export interface CreativeVersionGraph {
  nodes: CreativeVersionNode[]
  nodesById: Record<string, CreativeVersionNode>
  childrenById: Record<string, CreativeVersionNode[]>
  roots: string[]
  findings: CreativeVersionFinding[]
}

const TERMINAL_BAD_STATUSES = new Set<CreativeVersionStatus>(['failed', 'blocked'])

function normalizeCreatedAt(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return new Date(0).toISOString()
}

function compareNodeCreatedAsc(a: CreativeVersionNode, b: CreativeVersionNode): number {
  const timeDelta = Date.parse(a.createdAt) - Date.parse(b.createdAt)
  if (timeDelta !== 0) return timeDelta
  return a.id.localeCompare(b.id)
}

function compareNodeCreatedDesc(a: CreativeVersionNode, b: CreativeVersionNode): number {
  const timeDelta = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  if (timeDelta !== 0) return timeDelta
  return a.id.localeCompare(b.id)
}

function mapStatus(value: unknown): CreativeVersionStatus {
  switch (value) {
    case 'queued':
      return 'queued'
    case 'running':
    case 'processing':
    case 'rendering':
      return 'running'
    case 'ready':
    case 'done':
    case 'succeeded':
      return 'ready'
    case 'failed':
      return 'failed'
    case 'blocked':
      return 'blocked'
    case 'archived':
      return 'archived'
    default:
      return 'ready'
  }
}

function normalizeStringArray(value: unknown): string[] {
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

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function buildCreativeVersionGraph(sources: CreativeVersionSource[]): CreativeVersionGraph {
  const findings: CreativeVersionFinding[] = []
  const nodesById: Record<string, CreativeVersionNode> = {}

  for (const source of sources) {
    if (nodesById[source.id]) {
      findings.push({
        code: 'duplicate_node',
        severity: 'error',
        nodeId: source.id,
        message: `Duplicate version node ${source.id}.`
      })
      continue
    }

    nodesById[source.id] = {
      id: source.id,
      assetType: source.assetType,
      versionKind: source.versionKind,
      status: source.status,
      sourceRef: source.sourceRef,
      parentIds: [...(source.parentIds ?? [])].sort(),
      label: source.label?.trim() || source.id,
      favorite: source.favorite ?? false,
      createdAt: normalizeCreatedAt(source.createdAt),
      metadata: source.metadata ?? {},
      rootId: source.id,
      lineageDepth: 0
    }
  }

  const resolveRoot = (
    node: CreativeVersionNode,
    path: string[] = []
  ): { rootId: string, depth: number, cycle: boolean } => {
    if (path.includes(node.id)) {
      return { rootId: node.id, depth: 0, cycle: true }
    }

    const validParents = node.parentIds.filter((parentId) => {
      const exists = Boolean(nodesById[parentId])
      if (!exists) {
        findings.push({
          code: 'missing_parent',
          severity: 'warning',
          nodeId: node.id,
          parentId,
          message: `Version ${node.id} references missing parent ${parentId}.`
        })
      }
      return exists
    })

    if (validParents.length === 0) return { rootId: node.id, depth: 0, cycle: false }

    const parent = nodesById[validParents[0]]
    const result = resolveRoot(parent, [...path, node.id])
    if (result.cycle) return { rootId: node.id, depth: 0, cycle: true }
    return { rootId: result.rootId, depth: result.depth + 1, cycle: false }
  }

  for (const node of Object.values(nodesById).sort(compareNodeCreatedAsc)) {
    const result = resolveRoot(node)
    node.rootId = result.rootId
    node.lineageDepth = result.depth
    if (result.cycle) {
      findings.push({
        code: 'cycle',
        severity: 'error',
        nodeId: node.id,
        message: `Version graph cycle detected at ${node.id}.`
      })
    }
  }

  const childrenById: Record<string, CreativeVersionNode[]> = {}
  for (const node of Object.values(nodesById)) childrenById[node.id] = []
  for (const node of Object.values(nodesById)) {
    for (const parentId of node.parentIds) {
      if (nodesById[parentId] && node.rootId !== node.id) {
        childrenById[parentId].push(node)
      }
    }
  }
  for (const children of Object.values(childrenById)) children.sort(compareNodeCreatedAsc)

  const nodes = Object.values(nodesById).sort(compareNodeCreatedAsc)
  return {
    nodes,
    nodesById,
    childrenById,
    roots: nodes.filter(node => node.rootId === node.id).map(node => node.id),
    findings
  }
}

export function latestVersionForRoot(graph: CreativeVersionGraph, rootId: string): CreativeVersionNode | null {
  const candidates = graph.nodes
    .filter(node => node.rootId === rootId)
    .sort(compareNodeCreatedDesc)
  if (candidates.length === 0) return null

  return candidates.find(node => !TERMINAL_BAD_STATUSES.has(node.status)) ?? candidates[0]
}

export function favoriteVersions(graph: CreativeVersionGraph): CreativeVersionNode[] {
  return graph.nodes
    .filter(node => node.favorite)
    .sort(compareNodeCreatedDesc)
}

export function mapAudioAssetToVersionSource(row: Record<string, unknown>): CreativeVersionSource {
  const id = String(row.id)
  const kind = row.kind ?? null
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const fallbackLabel = kind === 'music'
    ? 'Music asset'
    : kind === 'voiceover'
      ? 'Voiceover asset'
      : 'Audio asset'

  return {
    id: `audio:${id}`,
    assetType: 'audio',
    versionKind: 'original',
    status: mapStatus(row.status),
    sourceRef: { source: 'audio_assets', id },
    parentIds: [],
    label: title || fallbackLabel,
    createdAt: row.createdAt instanceof Date || typeof row.createdAt === 'string'
      ? row.createdAt
      : row.created_at instanceof Date || typeof row.created_at === 'string'
        ? row.created_at
        : null,
    metadata: {
      channels: normalizeStringArray(row.channels),
      clientId: row.clientId ?? row.client_id ?? null,
      costCents: normalizeNumber(row.costCents ?? row.cost_cents),
      createdBy: row.createdBy ?? row.created_by ?? null,
      durationSec: normalizeNumber(row.durationSec ?? row.duration_sec),
      error: row.error ?? null,
      format: row.format ?? null,
      isInstrumental: row.isInstrumental ?? row.is_instrumental ?? null,
      kind,
      lang: row.lang ?? null,
      lyrics: row.lyrics ?? null,
      prompt: row.prompt ?? null,
      r2Key: row.r2KeyMaster ?? row.r2_key_master ?? null,
      variants: normalizeRecord(row.variants),
      voice: row.voice ?? null
    }
  }
}

export function mapVideoGenerationJobToVersionSource(row: Record<string, unknown>): CreativeVersionSource {
  const id = String(row.id)
  const prompt = typeof row.prompt === 'string' ? row.prompt : ''
  return {
    id: `video-generation:${id}`,
    assetType: 'video',
    versionKind: 'original',
    status: mapStatus(row.status),
    sourceRef: { source: 'video_generation_jobs', id },
    parentIds: [],
    label: prompt.trim() || String(row.mode ?? 'Video generation'),
    createdAt: row.created_at instanceof Date || typeof row.created_at === 'string' ? row.created_at : null,
    metadata: {
      mode: row.mode ?? null,
      modelId: row.model_id ?? null,
      outputAssetId: row.output_asset_id ?? null,
      outputR2Key: row.output_r2_key ?? null,
      provider: row.provider ?? null,
      sourceAssetIds: normalizeStringArray(row.source_asset_ids)
    }
  }
}

export function mapMediaRenderJobToVersionSource(row: Record<string, unknown>): CreativeVersionSource {
  const id = String(row.id)
  const variants = row.variants && typeof row.variants === 'object' && !Array.isArray(row.variants)
    ? row.variants as Record<string, unknown>
    : {}
  const variantFormats = Object.keys(variants)
  const timelineId = String(row.timelineId ?? row.timeline_id ?? '')
  const projectId = String(row.projectId ?? row.project_id ?? '')

  return {
    id: `media-render:${id}`,
    assetType: 'render',
    versionKind: 'render',
    status: mapStatus(row.status),
    sourceRef: { source: 'media_render_jobs', id },
    parentIds: timelineId ? [`timeline:${timelineId}`] : [],
    label: variantFormats.length ? `Render ${variantFormats.join(', ')}` : `Render ${id}`,
    createdAt: row.createdAt instanceof Date || typeof row.createdAt === 'string'
      ? row.createdAt
      : row.created_at instanceof Date || typeof row.created_at === 'string'
        ? row.created_at
        : null,
    metadata: {
      channels: Array.isArray(row.channels) ? row.channels.map(String) : [],
      costCents: row.costCents ?? row.cost_cents ?? null,
      projectId,
      requestedBy: row.requestedBy ?? row.requested_by ?? null,
      timelineId,
      variants
    }
  }
}
