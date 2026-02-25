import { queryRows, queryOne, execute } from '~~/server/utils/db'
import type { LoraMetricsComparison } from '~/types'

/**
 * Get the active LoRA adapter for a given type using weighted traffic routing.
 * Rolls a random number against traffic_pct to select between active/testing adapters.
 */
export async function getActiveAdapter(type: 'chat' | 'intent' | 'rag'): Promise<{
  id: string
  name: string
  cfFinetuneId: string
} | null> {
  const rows = await queryRows<{
    id: string
    name: string
    cf_finetune_id: string
    traffic_pct: number
  }>(
    `SELECT id, name, cf_finetune_id, traffic_pct
     FROM ai_lora_adapters
     WHERE adapter_type = $1
       AND status IN ('active', 'testing')
       AND traffic_pct > 0
     ORDER BY traffic_pct DESC
     LIMIT 2`,
    [type]
  )

  if (rows.length === 0) return null

  const roll = Math.floor(Math.random() * 100) + 1
  const firstPct = rows[0].traffic_pct
  const totalPct = rows.reduce((sum, r) => sum + r.traffic_pct, 0)

  let selected: typeof rows[0] | null = null
  if (roll <= firstPct) {
    selected = rows[0]
  } else if (rows.length > 1 && roll <= totalPct) {
    selected = rows[1]
  }

  if (!selected) return null

  return {
    id: selected.id,
    name: selected.name,
    cfFinetuneId: selected.cf_finetune_id,
  }
}

/**
 * Upload an adapter file to R2 and register it with the Cloudflare Finetunes API.
 * Updates the adapter row with r2_path, cf_finetune_id, and status.
 */
export async function uploadAdapter(adapterId: string, fileBuffer: Buffer): Promise<void> {
  const adapter = await queryOne<{
    id: string
    name: string
    adapter_type: string
    version: number
    model_base: string
  }>(
    `SELECT id, name, adapter_type, version, model_base
     FROM ai_lora_adapters WHERE id = $1`,
    [adapterId]
  )

  if (!adapter) {
    throw new Error(`Adapter ${adapterId} not found`)
  }

  const config = useRuntimeConfig()
  const r2Path = `lora-adapters/${adapter.adapter_type}/${adapter.name}/v${adapter.version}/adapter.safetensors`

  try {
    // Upload to R2 via S3-compatible API
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    })

    await s3.send(new PutObjectCommand({
      Bucket: config.r2BucketName,
      Key: r2Path,
      Body: fileBuffer,
      ContentType: 'application/octet-stream',
    }))

    // Register finetune with Cloudflare API
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/ai/finetunes`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: adapter.model_base,
          name: adapter.name,
        }),
      }
    )

    const cfData = await cfResponse.json() as { success: boolean; result?: { id: string }; errors?: any[] }
    if (!cfData.success || !cfData.result?.id) {
      throw new Error(`Cloudflare finetune creation failed: ${JSON.stringify(cfData.errors)}`)
    }

    await execute(
      `UPDATE ai_lora_adapters
       SET r2_path = $1, cf_finetune_id = $2, status = 'testing', updated_at = NOW()
       WHERE id = $3`,
      [r2Path, cfData.result.id, adapterId]
    )
  } catch (error: any) {
    await execute(
      `UPDATE ai_lora_adapters
       SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [error.message || 'Upload failed', adapterId]
    )
    throw error
  }
}

/**
 * Collect performance metrics comparing a LoRA adapter vs base model
 * over a given time window.
 */
export async function collectAdapterMetrics(
  adapterId: string,
  windowDays: number = 30
): Promise<LoraMetricsComparison> {
  const rows = await queryRows<{
    is_lora: boolean
    sample_count: string
    avg_latency: string | null
    avg_rating: string | null
    error_rate: string | null
  }>(
    `SELECT
       is_lora,
       COUNT(*) as sample_count,
       AVG(latency_ms) as avg_latency,
       AVG(CASE WHEN f.rating = 1 THEN 1.0 WHEN f.rating = -1 THEN 0.0 ELSE NULL END) as avg_rating,
       COUNT(CASE WHEN is_error THEN 1 END)::float / NULLIF(COUNT(*), 0) as error_rate
     FROM ai_messages m
     LEFT JOIN ai_feedback f ON f.message_id = m.id
     WHERE m.role = 'assistant'
       AND m.created_at > NOW() - INTERVAL '1 day' * $1
       AND (m.lora_adapter_id = $2 OR (m.is_lora = false AND m.lora_adapter_id IS NULL))
     GROUP BY is_lora`,
    [windowDays, adapterId]
  )

  const empty = { avgLatencyMs: 0, avgRating: 0, errorRate: 0, sampleCount: 0 }
  const result: LoraMetricsComparison = { lora: { ...empty }, base: { ...empty } }

  for (const row of rows) {
    const bucket = row.is_lora ? result.lora : result.base
    bucket.sampleCount = parseInt(row.sample_count, 10)
    bucket.avgLatencyMs = parseFloat(row.avg_latency || '0')
    bucket.avgRating = parseFloat(row.avg_rating || '0')
    bucket.errorRate = parseFloat(row.error_rate || '0')
  }

  return result
}

/**
 * Retire an adapter by setting its status to 'retired' and traffic to 0.
 */
export async function retireAdapter(adapterId: string): Promise<void> {
  await execute(
    `UPDATE ai_lora_adapters SET status = 'retired', traffic_pct = 0, updated_at = NOW() WHERE id = $1`,
    [adapterId]
  )
}
