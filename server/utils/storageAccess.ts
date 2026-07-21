import { createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import type { FileCategory } from '~~/server/utils/storage'

export type StorageEntityType = 'task' | 'expense' | 'avatar'
export type OwnedStorageCategory = 'attachments' | 'expenses' | 'avatars'

export interface StorageUploadCapabilityInput {
  actorId: string
  key: string
  category: OwnedStorageCategory
  entityType: StorageEntityType
  entityId: string
  fileType: string
  fileSize: number
}

export interface StorageUploadCapability extends StorageUploadCapabilityInput {
  version: 1
  exp: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const encoder = new TextEncoder()
const HMAC_DOMAIN = 'storage-upload-capability:v1:'

export const STORAGE_UPLOAD_CAPABILITY_TTL_SECONDS = 60 * 60

export function resolveStorageUploadTarget(category: FileCategory): { entityType: StorageEntityType } | null {
  switch (category) {
    case 'attachments': return { entityType: 'task' }
    case 'expenses': return { entityType: 'expense' }
    case 'avatars': return { entityType: 'avatar' }
    default: return null
  }
}

export async function requireStorageEntityAccess(input: {
  category: FileCategory
  entityType: StorageEntityType
  entityId: string
  actorId: string
}): Promise<void> {
  const target = resolveStorageUploadTarget(input.category)
  if (!target || target.entityType !== input.entityType) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid storage category and entity type' })
  }
  if (!UUID_RE.test(input.entityId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid storage entity ID' })
  }

  if (input.entityType === 'avatar') {
    if (input.entityId !== input.actorId) {
      throw createError({ statusCode: 403, statusMessage: 'You do not have permission to upload this file' })
    }
    return
  }

  const row = input.entityType === 'task'
    ? await queryOne(
        `SELECT id
           FROM tasks
          WHERE id = $1
            AND (assignee_id = $2 OR reporter_id = $2)
          LIMIT 1`,
        [input.entityId, input.actorId]
      )
    : await queryOne(
        `SELECT id
           FROM expenses
          WHERE id = $1
            AND user_id = $2
          LIMIT 1`,
        [input.entityId, input.actorId]
      )

  if (!row) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to upload this file' })
  }
}

export async function canDeleteStorageObject(key: string, actorId: string): Promise<boolean> {
  if (key.startsWith('avatars/')) {
    return !!await queryOne(
      `SELECT id FROM team_members WHERE avatar_storage_key = $1 AND id = $2`,
      [key, actorId]
    )
  }

  if (key.startsWith('attachments/')) {
    return !!await queryOne(
      `SELECT ta.id
         FROM task_attachments ta
         JOIN tasks t ON ta.task_id = t.id
        WHERE ta.storage_key = $1
          AND (ta.uploaded_by = $2 OR t.assignee_id = $2 OR t.reporter_id = $2)`,
      [key, actorId]
    )
  }

  if (key.startsWith('expenses/')) {
    return !!await queryOne(
      `SELECT id FROM expenses WHERE receipt_storage_key = $1 AND user_id = $2`,
      [key, actorId]
    )
  }

  return false
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const padding = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${HMAC_DOMAIN}${value}`)))
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index]! ^ right[index]!
  return difference === 0
}

export async function signStorageUploadCapability(
  input: StorageUploadCapabilityInput,
  secret: string,
  options: { now?: number, ttlSeconds?: number } = {}
): Promise<string> {
  if (secret.length < 32) throw new Error('Storage capability secret must be at least 32 characters')
  const payload: StorageUploadCapability = {
    ...input,
    version: 1,
    exp: Math.floor((options.now ?? Date.now()) / 1000) + (options.ttlSeconds ?? STORAGE_UPLOAD_CAPABILITY_TTL_SECONDS)
  }
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  return `${body}.${base64UrlEncode(await hmac(body, secret))}`
}

export async function verifyStorageUploadCapability(
  token: string,
  secret: string,
  options: { actorId: string, now?: number }
): Promise<StorageUploadCapability | null> {
  try {
    if (!token || secret.length < 32) return null
    const [body, signature, extra] = token.split('.')
    if (!body || !signature || extra) return null
    const expected = await hmac(body, secret)
    const provided = base64UrlDecode(signature)
    if (!timingSafeEqual(expected, provided)) return null

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as Partial<StorageUploadCapability>
    const target = typeof payload.category === 'string'
      ? resolveStorageUploadTarget(payload.category as FileCategory)
      : null
    const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
    if (
      payload.version !== 1
      || payload.actorId !== options.actorId
      || typeof payload.key !== 'string' || !payload.key
      || !target || target.entityType !== payload.entityType
      || typeof payload.entityId !== 'string' || !UUID_RE.test(payload.entityId)
      || typeof payload.fileType !== 'string' || !payload.fileType
      || typeof payload.fileSize !== 'number' || !Number.isSafeInteger(payload.fileSize) || payload.fileSize <= 0
      || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= nowSeconds
    ) return null

    return payload as StorageUploadCapability
  } catch {
    return null
  }
}

export function storageUploadCapabilityMatches(
  capability: StorageUploadCapability | null,
  input: Omit<StorageUploadCapabilityInput, 'fileType' | 'fileSize'> & {
    fileType?: string
    fileSize?: number
  }
): boolean {
  if (!capability) return false
  return capability.actorId === input.actorId
    && capability.key === input.key
    && capability.category === input.category
    && capability.entityType === input.entityType
    && capability.entityId === input.entityId
    && (input.fileType === undefined || capability.fileType === input.fileType)
    && (input.fileSize === undefined || capability.fileSize === input.fileSize)
}
