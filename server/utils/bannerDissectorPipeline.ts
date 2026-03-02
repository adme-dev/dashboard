import type { H3Event } from 'h3'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { queryOne, execute } from '~~/server/utils/db'
import { uploadFile } from '~~/server/utils/storage'
import { analyzeImage, segmentLayer, getImageDimensions } from '~~/server/utils/bannerDissector'
import type { DissectorManifest } from '~/types/banner-studio'

/**
 * Run the full dissection pipeline: fetch image → analyze → segment → upload assets.
 * Used by both the queue consumer and the synchronous fallback.
 */
export async function runDissectionPipeline(
  event: H3Event | null,
  jobId: string
): Promise<DissectorManifest> {
  // 1. Load the dissection record
  const record = await queryOne(
    `SELECT job_id, source_r2_key, status, brand FROM banner_dissections WHERE job_id = $1`,
    [jobId]
  )
  if (!record) {
    throw new Error(`Dissection job ${jobId} not found`)
  }

  try {
    // 2. Fetch original image from R2
    const imageBuffer = await downloadFromR2(record.source_r2_key)
    if (!imageBuffer) {
      throw new Error('Could not download source image from R2')
    }

    // 3. Get image dimensions
    const dims = getImageDimensions(imageBuffer)
    const imageWidth = dims?.width || 300
    const imageHeight = dims?.height || 250

    // 4. Analyze with AI vision
    const imageBase64 = imageBuffer.toString('base64')
    // event may be null when called from queue consumer (no HTTP context)
    const manifest = await analyzeImage(event, imageBase64, record.brand || undefined)
    manifest.jobId = jobId
    manifest.banner_size = `${imageWidth}x${imageHeight}`

    // Update DB: status='segmenting'
    await execute(
      `UPDATE banner_dissections SET status = 'segmenting', manifest = $1, updated_at = NOW() WHERE job_id = $2`,
      [JSON.stringify(manifest), jobId]
    )

    // 5. Upload source image as a reusable asset (for background layer + fallback)
    const sourceR2Key = `banner-dissector/${jobId}/layers/source.${record.source_r2_key.endsWith('.png') ? 'png' : 'jpg'}`
    const sourceMime = record.source_r2_key.endsWith('.png') ? 'image/png' : 'image/jpeg'
    const sourceUploaded = await uploadFile(imageBuffer, sourceR2Key, sourceMime)

    // 6. Segment each exportable layer
    console.log(`[Dissector] Starting layer segmentation. Image: ${imageWidth}x${imageHeight}, format: ${imageBuffer[0] === 0xFF ? 'JPEG' : imageBuffer[0] === 0x89 ? 'PNG' : 'unknown'}, ${manifest.layers.filter(l => l.export_as_png).length} exportable layers`)

    for (const layer of manifest.layers) {
      if (!layer.export_as_png) continue

      try {
        // Background layer uses the full source image — no crop needed
        if (layer.type === 'background') {
          layer.asset_path = sourceR2Key
          layer.r2_url = sourceUploaded.url
          console.log(`[Dissector] Layer ${layer.id} (background): using source image`)
          continue
        }

        console.log(`[Dissector] Layer ${layer.id} (${layer.type}): region x=${layer.region.x} y=${layer.region.y} w=${layer.region.width} h=${layer.region.height}${layer.mask ? ' [has Gemini mask]' : ''}`)
        const segmented = await segmentLayer(
          event, imageBuffer, layer.region, layer.id, imageWidth, imageHeight,
          layer.mask
        )

        if (segmented) {
          console.log(`[Dissector] Layer ${layer.id}: segmented OK, ${segmented.length} bytes`)
          const layerR2Key = `banner-dissector/${jobId}/layers/${layer.id}.png`
          const uploaded = await uploadFile(segmented, layerR2Key, 'image/png')
          layer.asset_path = layerR2Key
          layer.r2_url = uploaded.url
        } else {
          console.warn(`[Dissector] Layer ${layer.id} (${layer.type}): segmentation returned null — using source image fallback`)
          layer.asset_path = sourceR2Key
          layer.r2_url = sourceUploaded.url
        }
      } catch (err) {
        console.warn(`[Dissector] Failed to segment layer ${layer.id}:`, err)
        // Fallback to source image so it's not "No image"
        layer.asset_path = sourceR2Key
        layer.r2_url = sourceUploaded.url
      }
    }

    // Strip mask data from layers (large base64 blobs no longer needed after segmentation)
    for (const layer of manifest.layers) {
      delete layer.mask
    }

    // 7. Update DB: status='complete' with final manifest
    manifest.status = 'complete'
    await execute(
      `UPDATE banner_dissections SET status = 'complete', manifest = $1, updated_at = NOW() WHERE job_id = $2`,
      [JSON.stringify(manifest), jobId]
    )

    return manifest
  } catch (err: any) {
    // Mark as failed
    await execute(
      `UPDATE banner_dissections SET status = 'failed', error = $1, updated_at = NOW() WHERE job_id = $2`,
      [err.message || 'Unknown error', jobId]
    )
    throw err
  }
}

/**
 * Download a file from R2 by key.
 * Uses the same S3 client config as storage.ts.
 */
async function downloadFromR2(key: string): Promise<Buffer | null> {
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'agency-files'

  // Local filesystem fallback for dev
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    try {
      const { promises: fs } = await import('fs')
      const { join } = await import('path')
      const localPath = join(process.cwd(), 'server', 'uploads', key)
      return await fs.readFile(localPath)
    } catch {
      return null
    }
  }

  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })

    const response = await client.send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }))

    if (!response.Body) return null

    // Convert ReadableStream to Buffer
    const chunks: Uint8Array[] = []
    const stream = response.Body as AsyncIterable<Uint8Array>
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } catch (err) {
    console.error('[Dissector] R2 download failed:', err)
    return null
  }
}
