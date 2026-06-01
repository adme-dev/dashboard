// server/utils/audio/assets.ts — SOLE gateway to the audio_assets table and R2
// keys. Voice (Phase 1), music (Phase 2), and render (Phase 3) all route through
// here so the future client-portal surface reuses it untouched.
import { randomUUID } from 'crypto'
import type { AudioAsset } from '~~/app/types'
import { queryRows, queryOne } from '~~/server/utils/db'
import { uploadFile, getPresignedDownloadUrl, isStorageConfigured } from '~~/server/utils/storage'

const PRESIGN_TTL = 60 * 60 // 1 hour playback URLs

/** Pure: construct the R2 key for an asset's master file. */
export function buildMasterKey(clientId: string | null, assetId: string, ext: string): string {
  return `audio/${clientId ?? 'org'}/${assetId}/master.${ext}`
}

/** Pure: DB row (snake_case) → AudioAsset (camelCase). */
export function mapRow(row: any): AudioAsset {
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    createdBy: row.created_by,
    kind: row.kind,
    status: row.status,
    title: row.title ?? null,
    prompt: row.prompt ?? null,
    lang: row.lang ?? null,
    voice: row.voice ?? null,
    channels: row.channels ?? [],
    r2KeyMaster: row.r2_key_master ?? null,
    variants: row.variants ?? {},
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
    costCents: row.cost_cents != null ? Number(row.cost_cents) : null,
    error: row.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isInstrumental: row.is_instrumental ?? null,
    lyrics: row.lyrics ?? null,
    format: row.format ?? null
  }
}

/** Mint a short-lived playback URL for an asset's master (undefined if no master
 * key or if presigning fails — a presign error must NOT fail an already-committed
 * create, nor sink an entire list because one key is bad). */
export async function streamUrlFor(asset: AudioAsset): Promise<string | undefined> {
  if (!asset.r2KeyMaster) return undefined
  if (!isStorageConfigured()) return `/api/_uploads/${asset.r2KeyMaster}`
  try {
    return await getPresignedDownloadUrl(asset.r2KeyMaster, PRESIGN_TTL)
  } catch {
    return undefined
  }
}

export interface CreateVoiceAssetInput {
  createdBy: string
  clientId: string | null
  title: string | null
  text: string
  lang: string | null
  voice: string | null
  channels: string[]
  audio: ArrayBuffer | Uint8Array
  format: string // e.g. 'mp3'
  durationSec?: number | null
}

/** Insert a ready voiceover asset and upload its master to R2. */
export async function createVoiceAsset(input: CreateVoiceAssetInput): Promise<AudioAsset> {
  const id = randomUUID()
  const key = buildMasterKey(input.clientId, id, input.format)
  const buffer = Buffer.from(input.audio instanceof ArrayBuffer ? new Uint8Array(input.audio) : input.audio)

  await uploadFile(buffer, key, input.format === 'mp3' ? 'audio/mpeg' : `audio/${input.format}`)

  const row = await queryOne(
    `INSERT INTO audio_assets
       (id, client_id, created_by, kind, status, title, prompt, lang, voice, channels, r2_key_master, duration_sec)
     VALUES ($1, $2, $3, 'voiceover', 'ready', $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, input.clientId, input.createdBy, input.title, input.text, input.lang,
      input.voice, input.channels, key, input.durationSec ?? null]
  )
  const asset = mapRow(row)
  asset.streamUrl = await streamUrlFor(asset)
  return asset
}

export interface CreateMusicAssetInput {
  createdBy: string
  clientId: string | null
  title: string | null
  prompt: string // the music brief
  isInstrumental: boolean
  lyrics: string | null
  channels: string[]
  format: string // 'mp3' | 'wav'
  idempotencyKey?: string | null
}

/** Insert a QUEUED music asset (no master yet — the audio-jobs worker generates,
 * fetches the MiniMax URL, uploads to R2, and flips status to done/failed). */
export async function createMusicAsset(input: CreateMusicAssetInput): Promise<AudioAsset> {
  const id = randomUUID()
  const row = await queryOne(
    `INSERT INTO audio_assets
       (id, client_id, created_by, kind, status, title, prompt, channels, format, is_instrumental, lyrics, idempotency_key)
     VALUES ($1, $2, $3, 'music', 'queued', $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, input.clientId, input.createdBy, input.title, input.prompt, input.channels,
      input.format, input.isInstrumental, input.lyrics, input.idempotencyKey ?? null]
  )
  return mapRow(row)
}

/** Scoped single-asset read for the status endpoint. Mints a streamUrl when a
 * master exists (i.e. once the worker has uploaded a completed track). */
export async function getAsset(id: string): Promise<AudioAsset | null> {
  const row = await queryOne(`SELECT * FROM audio_assets WHERE id = $1`, [id])
  if (!row) return null
  const asset = mapRow(row)
  asset.streamUrl = await streamUrlFor(asset)
  return asset
}

export interface ListAssetsFilter {
  kind?: 'voiceover' | 'music'
  clientId?: string | null
  limit?: number
}

/** Scoped library read. Mints a streamUrl per asset. */
export async function listAssets(filter: ListAssetsFilter = {}): Promise<AudioAsset[]> {
  const where: string[] = []
  const params: any[] = []
  if (filter.kind) {
    params.push(filter.kind)
    where.push(`kind = $${params.length}`)
  }
  if (filter.clientId !== undefined) {
    if (filter.clientId === null) {
      where.push('client_id IS NULL')
    } else {
      params.push(filter.clientId)
      where.push(`client_id = $${params.length}`)
    }
  }
  params.push(Math.min(filter.limit ?? 100, 200))
  const sql = `SELECT * FROM audio_assets
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT $${params.length}`
  const rows = await queryRows(sql, params)
  const assets = rows.map(mapRow)
  await Promise.all(assets.map(async (a) => {
    a.streamUrl = await streamUrlFor(a)
  }))
  return assets
}
