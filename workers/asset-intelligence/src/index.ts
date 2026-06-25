import {
  createDerivative,
  getAssetIntelligenceJob,
  getVideoAssetR2Key,
  markAssetIntelligenceJobFailed,
  markAssetIntelligenceJobRunning,
  markAssetIntelligenceJobSucceeded,
  dbRecordAiInvocation,
} from './db'
import { runAssetIntelligenceProvider } from './providers'
import { copyR2Object, fetchAssetBytes, uploadBinary, uploadJson } from './storage'
import { processAssetIntelligenceJob, type AssetIntelligenceMessage } from './worker'

declare const process: { env: Record<string, string | undefined> }

interface Env {
  DATABASE_URL?: string
  HYPERDRIVE?: { connectionString: string }
  AI?: { run(model: string, inputs: Record<string, unknown>, options?: any): Promise<any> }
  MEDIA_BUCKET: R2Bucket
}

export default {
  async queue(batch: MessageBatch<AssetIntelligenceMessage>, env: Env): Promise<void> {
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL

    for (const msg of batch.messages) {
      try {
        await processAssetIntelligenceJob(msg.body, {
          getJob: getAssetIntelligenceJob,
          markRunning: markAssetIntelligenceJobRunning,
          markFailed: markAssetIntelligenceJobFailed,
          markSucceeded: markAssetIntelligenceJobSucceeded,
          createDerivative,
          recordInvocation: dbRecordAiInvocation,
          runProvider: job => runAssetIntelligenceProvider({
            job,
            env,
            fetchAssetBytes: sourceAssetId => fetchAssetBytes(env.MEDIA_BUCKET, sourceAssetId, getVideoAssetR2Key),
            copyR2Object: (sourceKey, destinationKey) => copyR2Object(env.MEDIA_BUCKET, sourceKey, destinationKey),
            uploadJson: (key, value) => uploadJson(env.MEDIA_BUCKET, key, value),
            uploadBinary: (key, bytes, contentType) => uploadBinary(env.MEDIA_BUCKET, key, bytes, contentType),
          }),
        })
        msg.ack()
      } catch (error) {
        console.error('asset-intelligence.queue.error', msg.body?.jobId, error)
        msg.retry({ delaySeconds: 30 })
      }
    }
  },
}
