export interface VideoSourceInput {
  r2Key: string
  url: string
  durationSec?: number | null
  assetId?: string | null
  title?: string | null
  format?: string | null
  posterUrl?: string | null
}

export interface RegisteredVideoSource {
  r2Key: string
  url: string
  durationSec: number
  assetId: string | null
  title: string | null
  format: string | null
  posterUrl: string | null
}

export type VideoSourceRegistry = Map<string, RegisteredVideoSource>

export function createVideoSourceRegistry(): VideoSourceRegistry {
  return new Map()
}

function normalizedDuration(input: number | null | undefined, fallback: number): number {
  return Number.isFinite(input) && Number(input) > 0 ? Number(input) : fallback
}

export function mergeVideoSource(registry: VideoSourceRegistry, input: VideoSourceInput): RegisteredVideoSource {
  const existing = registry.get(input.r2Key)
  const source: RegisteredVideoSource = {
    r2Key: input.r2Key,
    url: input.url,
    durationSec: normalizedDuration(input.durationSec, existing?.durationSec ?? 5),
    assetId: input.assetId ?? existing?.assetId ?? null,
    title: input.title ?? existing?.title ?? null,
    format: input.format ?? existing?.format ?? null,
    posterUrl: input.posterUrl ?? existing?.posterUrl ?? null,
  }
  registry.set(input.r2Key, source)
  return source
}

export function videoSourceRecord(registry: VideoSourceRegistry): Record<string, string> {
  return Object.fromEntries([...registry.values()].map((source) => [source.r2Key, source.url]))
}
