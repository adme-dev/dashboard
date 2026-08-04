import { createHash } from 'node:crypto'
import { requireWriteAccess } from '~~/server/utils/auth'
import { resolveAccessibleBoard, type BoardFileCategory } from '~~/server/utils/boardFiles'
import { queryOne } from '~~/server/utils/db'
import {
  deleteFile,
  generateStorageKey,
  getAllowedTypes,
  getMaxFileSize,
  uploadFile,
  validateFileSize,
  validateFileType
} from '~~/server/utils/storage'

const BOARD_FILE_CATEGORIES = new Set<BoardFileCategory>(['reference', 'policy', 'template', 'other'])

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const board = await resolveAccessibleBoard(event, boardId)
  const contentType = getHeader(event, 'content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw createError({ statusCode: 415, statusMessage: 'Board files require a multipart upload' })
  }

  const form = await readMultipartFormData(event)
  const file = form?.find(part => part.name === 'file')
  if (!file?.data || !file.filename) {
    throw createError({ statusCode: 400, statusMessage: 'File is required' })
  }

  const categoryValue = form?.find(part => part.name === 'category')?.data?.toString().trim() || 'reference'
  if (!BOARD_FILE_CATEGORIES.has(categoryValue as BoardFileCategory)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid board file category' })
  }
  const category = categoryValue as Exclude<BoardFileCategory, 'evidence'>
  const descriptionValue = form?.find(part => part.name === 'description')?.data?.toString().trim() || ''
  if (descriptionValue.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'Description must be 2,000 characters or fewer' })
  }

  const fileName = file.filename.slice(0, 255)
  const fileType = file.type || 'application/octet-stream'
  const fileSize = file.data.length
  if (!validateFileType(fileType, 'attachments')) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type. Allowed types: ${getAllowedTypes('attachments').join(', ')}`
    })
  }
  if (!validateFileSize(fileSize, 'attachments')) {
    const maxSizeMb = Math.round(getMaxFileSize('attachments') / (1024 * 1024))
    throw createError({ statusCode: 413, statusMessage: `File must be ${maxSizeMb}MB or smaller` })
  }

  const checksum = createHash('sha256').update(file.data).digest('hex')
  const duplicate = await queryOne<{ id: string }>(
    'SELECT id FROM board_files WHERE department_id = $1 AND checksum_sha256 = $2',
    [board.id, checksum]
  )
  if (duplicate) {
    throw createError({ statusCode: 409, statusMessage: 'This file is already in the board library' })
  }

  const storageKey = generateStorageKey('attachments', fileName, board.id)
  const uploaded = await uploadFile(file.data, storageKey, fileType, {
    boardId: board.id,
    uploadedBy: user.id,
    originalName: fileName
  })

  try {
    const inserted = await queryOne<Record<string, any>>(`
      INSERT INTO board_files (
        department_id, uploaded_by, file_name, file_url, file_type, file_size,
        storage_key, category, description, source, checksum_sha256
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'xeroflow', $10)
      RETURNING id, file_name, file_type, file_size, category, description, source, created_at
    `, [
      board.id,
      user.id,
      fileName,
      uploaded.url,
      fileType,
      fileSize,
      storageKey,
      category,
      descriptionValue || null,
      checksum
    ])

    if (!inserted) throw new Error('Board file insert returned no record')
    return {
      id: inserted.id,
      boardId: board.id,
      fileName: inserted.file_name,
      fileType: inserted.file_type,
      fileSize: Number(inserted.file_size || 0),
      category: inserted.category,
      description: inserted.description || null,
      source: inserted.source,
      createdAt: inserted.created_at
    }
  } catch (error: any) {
    await deleteFile(storageKey).catch(storageError => {
      console.warn('Failed to clean up board file after database error:', storageError)
    })
    if (error?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'This file is already in the board library' })
    }
    if (error?.statusCode) throw error
    console.error('Failed to record board file:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save board file' })
  }
})
