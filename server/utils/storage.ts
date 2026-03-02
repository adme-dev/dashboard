/**
 * Cloudflare R2 Storage Utility
 *
 * R2 is S3-compatible, so we use the AWS S3 SDK.
 * This utility handles file uploads, downloads, and presigned URLs.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'

// Local upload directory for dev without R2
const LOCAL_UPLOAD_DIR = join(process.cwd(), 'server', 'uploads')

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'agency-files'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '' // Optional: Custom domain for public files

// Create S3 client configured for R2
function getR2Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 storage is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

// File type categories for organization
export type FileCategory = 'avatars' | 'attachments' | 'expenses' | 'briefs' | 'invoices' | 'general'

// Allowed MIME types per category
const ALLOWED_TYPES: Record<FileCategory, string[]> = {
  avatars: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  attachments: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/json',
    'application/zip', 'application/x-rar-compressed',
  ],
  expenses: ['image/jpeg', 'image/png', 'application/pdf'],
  briefs: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  invoices: ['application/pdf', 'image/jpeg', 'image/png'],
  general: ['*'], // Allow all types
}

// Max file sizes per category (in bytes)
const MAX_FILE_SIZES: Record<FileCategory, number> = {
  avatars: 2 * 1024 * 1024,      // 2MB
  attachments: 50 * 1024 * 1024, // 50MB
  expenses: 10 * 1024 * 1024,    // 10MB
  briefs: 25 * 1024 * 1024,      // 25MB
  invoices: 10 * 1024 * 1024,    // 10MB
  general: 100 * 1024 * 1024,    // 100MB
}

/**
 * Validate file type for a category
 */
export function validateFileType(mimeType: string, category: FileCategory): boolean {
  const allowed = ALLOWED_TYPES[category]
  if (allowed.includes('*')) return true
  return allowed.includes(mimeType)
}

/**
 * Validate file size for a category
 */
export function validateFileSize(size: number, category: FileCategory): boolean {
  return size <= MAX_FILE_SIZES[category]
}

/**
 * Get max file size for a category
 */
export function getMaxFileSize(category: FileCategory): number {
  return MAX_FILE_SIZES[category]
}

/**
 * Get allowed types for a category
 */
export function getAllowedTypes(category: FileCategory): string[] {
  return ALLOWED_TYPES[category]
}

/**
 * Generate a storage key (path) for a file
 */
export function generateStorageKey(category: FileCategory, originalFileName: string, entityId?: string): string {
  const uuid = randomUUID()
  const extension = originalFileName.split('.').pop()?.toLowerCase() || ''
  const sanitizedName = originalFileName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9-_]/g, '-') // Replace special chars
    .substring(0, 50) // Limit length
    .toLowerCase()

  const timestamp = Date.now()

  if (entityId) {
    return `${category}/${entityId}/${timestamp}-${sanitizedName}-${uuid.substring(0, 8)}.${extension}`
  }

  return `${category}/${timestamp}-${sanitizedName}-${uuid.substring(0, 8)}.${extension}`
}

/**
 * Upload a file to R2, or to local filesystem if R2 is not configured
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ key: string; url: string; size: number }> {
  // Local filesystem fallback for dev without R2
  if (!isStorageConfigured()) {
    const filePath = join(LOCAL_UPLOAD_DIR, key)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, buffer)
    return {
      key,
      url: `/api/_uploads/${key}`,
      size: buffer.length,
    }
  }

  const client = getR2Client()

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    Metadata: metadata,
  }))

  // Return the public URL if configured, otherwise generate a presigned URL
  const url = R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : await getPresignedDownloadUrl(key, 7 * 24 * 60 * 60) // 7 days

  return {
    key,
    url,
    size: buffer.length,
  }
}

/**
 * Delete a file from R2, or from local filesystem if R2 is not configured
 */
export async function deleteFile(key: string): Promise<void> {
  if (!isStorageConfigured()) {
    const filePath = join(LOCAL_UPLOAD_DIR, key)
    try {
      await fs.unlink(filePath)
    } catch {
      // File may not exist — ignore
    }
    return
  }

  const client = getR2Client()

  await client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }))
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  const client = getR2Client()

  try {
    await client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }))
    return true
  } catch {
    return false
  }
}

/**
 * Generate a presigned URL for uploading a file directly from the client
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const client = getR2Client()

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })

  return getSignedUrl(client, command, { expiresIn })
}

/**
 * Generate a presigned URL for downloading a file
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const client = getR2Client()

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn })
}

/**
 * Get file metadata
 */
export async function getFileMetadata(key: string): Promise<{
  size: number
  contentType: string
  lastModified: Date | undefined
  metadata: Record<string, string> | undefined
} | null> {
  const client = getR2Client()

  try {
    const response = await client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }))

    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      lastModified: response.LastModified,
      metadata: response.Metadata,
    }
  } catch {
    return null
  }
}

/**
 * Get public URL for a file (if R2_PUBLIC_URL is configured)
 */
export function getPublicUrl(key: string): string | null {
  if (!R2_PUBLIC_URL) return null
  return `${R2_PUBLIC_URL}/${key}`
}

/**
 * Check if R2 storage is configured
 */
export function isStorageConfigured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
}
