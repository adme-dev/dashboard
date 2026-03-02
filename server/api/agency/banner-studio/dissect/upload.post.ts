import { randomUUID } from 'crypto'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
import { uploadFile } from '~~/server/utils/storage'
import { enqueue } from '~~/server/utils/queue'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const fileField = formData.find(f => f.name === 'file')
  const brandField = formData.find(f => f.name === 'brand')

  if (!fileField || !fileField.data || !fileField.type) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field' })
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(fileField.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG, PNG, and WebP images are accepted' })
  }

  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024
  if (fileField.data.length > maxSize) {
    throw createError({ statusCode: 400, statusMessage: 'File size exceeds 10MB limit' })
  }

  const jobId = randomUUID()
  const ext = fileField.type === 'image/png' ? 'png' : fileField.type === 'image/webp' ? 'webp' : 'jpg'
  const r2Key = `banner-dissector/${jobId}/original.${ext}`
  const brand = brandField?.data?.toString('utf-8') || ''

  // Upload to R2
  await uploadFile(Buffer.from(fileField.data), r2Key, fileField.type)

  // Insert DB record
  await execute(
    `INSERT INTO banner_dissections (job_id, user_id, source_r2_key, brand, status)
     VALUES ($1, $2, $3, $4, 'analyzing')`,
    [jobId, user.id, r2Key, brand || null]
  )

  // Queue the analysis job — with synchronous fallback for dev
  const capturedEvent = event
  await enqueue(event, 'dissect.analyze', { jobId, r2Key, brand }, async () => {
    // Synchronous fallback: run the pipeline inline
    const { runDissectionPipeline } = await import('../../../../utils/bannerDissectorPipeline')
    await runDissectionPipeline(capturedEvent, jobId).catch(err =>
      console.error('[Dissector] Sync fallback failed:', err)
    )
  })

  return { jobId, status: 'analyzing' }
})
