import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { buildMasterKey } from '~~/server/utils/audio/assets'
import { MAX_PROBE_BYTES } from '~~/shared/video-storyboard/mediaProbe'
import type { MeasuredMedia, MediaProbeInput } from '~~/shared/video-storyboard/mediaProbe'

/**
 * Provider-free import of a user-supplied audio file into the canonical audio_assets
 * pipeline (migration 510). The declared MIME is never trusted: bytes are sniffed,
 * hashed, stored at the canonical master key, then measured by the storyboard media
 * probe. Only a measured audio stream with a positive bounded duration becomes a
 * ready asset. The uploader must confirm they hold the rights to use the audio.
 */
export type ImportAudioRole = 'voiceover' | 'music'
export type ImportAudioFormat = 'wav' | 'mp3' | 'm4a'

const MIME_BY_FORMAT: Record<ImportAudioFormat, 'audio/wav' | 'audio/mpeg' | 'audio/mp4'> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4'
}
const ACCEPTED_DECLARED: Record<string, ImportAudioFormat> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a'
}

export const MAX_IMPORT_AUDIO_BYTES = MAX_PROBE_BYTES

/** Content sniffing: the bytes decide the format, not the filename or declared type. */
export function sniffAudioFormat(bytes: Uint8Array): ImportAudioFormat | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav'
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'mp3'
  if (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1]! & 0xE0) === 0xE0) return 'mp3'
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp' && ['M4A ', 'M4B ', 'mp42', 'isom', 'iso2', 'dash'].includes(ascii(8, 12))) return 'm4a'
  return null
}

export interface ImportAudioInput {
  projectId: string
  projectClientId: string | null
  actorId: string
  role: ImportAudioRole
  title: string | null
  filename: string
  declaredType: string
  bytes: Uint8Array
  rightsConfirmed: boolean
  idempotencyKey: string
  /** Pre-reserved asset id (God mode ledger); minted by the caller otherwise. */
  assetId: string
}

export interface ImportAudioDeps {
  upload(bytes: Uint8Array, key: string, contentType: string): Promise<void>
  metadata(key: string): Promise<{ size: number, etag: string | null } | null>
  probe(input: MediaProbeInput): Promise<MeasuredMedia>
  findByIdempotencyKey(key: string): Promise<Record<string, unknown> | null>
  insert(params: unknown[]): Promise<Record<string, unknown>>
}

export function importIdempotencyKey(projectId: string, clientKey: string): string {
  return `audio-import:${projectId}:${clientKey}`
}

export function validateImportAudio(input: Omit<ImportAudioInput, 'assetId'>): { format: ImportAudioFormat, sha256: string } {
  const bad = (statusMessage: string) => createError({ statusCode: 400, statusMessage })
  if (!input.rightsConfirmed) throw bad('Confirm you have the rights to use this audio before importing it')
  if (input.role !== 'voiceover' && input.role !== 'music') throw bad('role must be \'voiceover\' or \'music\'')
  if (!input.filename || input.filename.length > 255) throw bad('A file name of at most 255 characters is required')
  if (input.title !== null && input.title.length > 200) throw bad('Title must be at most 200 characters')
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(input.idempotencyKey)) throw bad('An Idempotency-Key header (8-200 characters) is required')
  if (input.bytes.length === 0) throw bad('The audio file is empty')
  if (input.bytes.length > MAX_IMPORT_AUDIO_BYTES) throw bad(`Audio exceeds the ${Math.round(MAX_IMPORT_AUDIO_BYTES / (1024 * 1024))}MB import limit`)
  const declared = ACCEPTED_DECLARED[input.declaredType.toLowerCase()]
  if (!declared) throw bad(`Unsupported audio type: ${input.declaredType || 'unknown'}`)
  const sniffed = sniffAudioFormat(input.bytes)
  if (!sniffed || sniffed !== declared) throw bad('The file contents do not match a supported audio format')
  return { format: sniffed, sha256: createHash('sha256').update(input.bytes).digest('hex') }
}

export async function importAudioAsset(input: ImportAudioInput, deps: ImportAudioDeps): Promise<{ row: Record<string, unknown>, replayed: boolean }> {
  const { format, sha256 } = validateImportAudio(input)
  const idempotencyKey = importIdempotencyKey(input.projectId, input.idempotencyKey)
  const existing = await deps.findByIdempotencyKey(idempotencyKey)
  if (existing) {
    if (existing.source !== 'imported' || existing.source_sha256 !== sha256 || String(existing.source_project_id) !== input.projectId) {
      throw createError({ statusCode: 409, statusMessage: 'Idempotency key is already used for a different import' })
    }
    return { row: existing, replayed: true }
  }

  const key = buildMasterKey(input.projectClientId, input.assetId, format)
  const contentType = MIME_BY_FORMAT[format]
  await deps.upload(input.bytes, key, contentType)
  const stored = await deps.metadata(key)
  if (!stored?.etag || stored.size !== input.bytes.length) {
    throw createError({ statusCode: 502, statusMessage: 'Imported audio could not be verified in storage' })
  }
  let measured: MeasuredMedia
  try {
    measured = await deps.probe({ r2Key: key, expectedEtag: stored.etag.replace(/^"|"$/g, ''), expectedSize: stored.size })
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'The audio could not be measured; upload a standard WAV, MP3 or M4A file' })
  }
  if (measured.kind !== 'audio' || !(typeof measured.durationSeconds === 'number' && measured.durationSeconds > 0)) {
    throw createError({ statusCode: 422, statusMessage: 'The file does not contain a measurable audio track' })
  }

  try {
    const row = await deps.insert([
      input.assetId, input.projectClientId, input.actorId, input.role, input.title ?? input.filename,
      key, measured.durationSeconds, format, idempotencyKey,
      input.filename, contentType, sha256, input.bytes.length, input.projectId, input.actorId
    ])
    return { row, replayed: false }
  } catch (error) {
    // A concurrent request with the same key won the unique idempotency slot.
    if ((error as { code?: string })?.code !== '23505') throw error
    const winner = await deps.findByIdempotencyKey(idempotencyKey)
    if (winner && winner.source === 'imported' && winner.source_sha256 === sha256 && String(winner.source_project_id) === input.projectId) {
      return { row: winner, replayed: true }
    }
    throw createError({ statusCode: 409, statusMessage: 'Idempotency key is already used for a different import' })
  }
}

export const INSERT_IMPORTED_AUDIO_ASSET_SQL = `
INSERT INTO audio_assets
  (id, client_id, created_by, kind, status, title, prompt, channels, variants, r2_key_master, duration_sec, format,
   idempotency_key, source, source_filename, source_mime, source_sha256, source_bytes, source_project_id,
   rights_confirmed_by, rights_confirmed_at)
VALUES ($1, $2, $3, $4, 'ready', $5, NULL, '{}', '{}'::jsonb, $6, $7, $8,
        $9, 'imported', $10, $11, $12, $13, $14, $15, now())
RETURNING *`
