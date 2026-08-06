import type { GoogleAiMaxReadinessFilters } from '~/types'

export interface GoogleAiMaxPageFilters {
  page: number
  pageSize: number
  status: string
  migrationReason: string
  stale: string
  campaignStatus: string
  connectionId: string
  clientId: string
  search: string
}

const readinessValues = new Set(['ready', 'scheduled_upgrade', 'needs_review', 'not_affected', 'unknown'])
const migrationValues = new Set(['aca', 'campaign_broad_match', 'aca_and_campaign_broad_match', 'none', 'unknown'])
const freshnessValues = new Set(['fresh', 'warning', 'critical'])
const campaignStatusValues = new Set(['ENABLED', 'PAUSED'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function single(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
}

function enumOrAll(value: unknown, allowed: Set<string>): string {
  const candidate = single(value)
  return allowed.has(candidate) ? candidate : 'all'
}

function positiveInteger(value: unknown, fallback: number) {
  const candidate = Number(single(value))
  return Number.isInteger(candidate) && candidate > 0 ? candidate : fallback
}

function uuidOrAll(value: unknown) {
  const candidate = single(value)
  return uuidPattern.test(candidate) ? candidate : 'all'
}

export function normalizeAiMaxRouteFilters(query: Record<string, unknown>): GoogleAiMaxPageFilters {
  return {
    page: positiveInteger(query.page, 1),
    pageSize: 25,
    status: enumOrAll(query.status, readinessValues),
    migrationReason: enumOrAll(query.migrationReason, migrationValues),
    stale: enumOrAll(query.stale, freshnessValues),
    campaignStatus: enumOrAll(query.campaignStatus, campaignStatusValues),
    connectionId: uuidOrAll(query.connectionId),
    clientId: uuidOrAll(query.clientId),
    search: single(query.search).trim().slice(0, 100)
  }
}

export function buildAiMaxApiFilters(filters: GoogleAiMaxPageFilters): GoogleAiMaxReadinessFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => {
      if (['page', 'pageSize'].includes(key)) return true
      return value !== 'all' && value !== ''
    })
  ) as unknown as GoogleAiMaxReadinessFilters
}

export function buildAiMaxRouteQuery(filters: GoogleAiMaxPageFilters): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    if ((key === 'page' && value === 1) || key === 'pageSize' || value === 'all' || value === '') continue
    query[key] = String(value)
  }
  return query
}
