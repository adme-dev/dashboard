import { mockVideoGenerationProvider } from '../../../server/utils/video-generation/providers/mockProvider'
import { makeAiGatewayProvider } from '../../../server/utils/video-generation/providers/aiGatewayProvider'
import { downloadToR2 } from './downloadToR2'
import {
  withVideoGenerationDatabase,
  dbClaimVideoGenerationSubmission,
  dbCreateVideoAsset,
  dbGetVideoGenerationJob,
  dbMarkVideoGenerationJobFailed,
  dbMarkVideoGenerationJobRunning,
  dbMarkVideoGenerationJobSucceeded,
  dbMarkVideoGenerationJobUnknown,
  dbRecordAiInvocation
} from './db'
import type { VideoGenerationMessage } from '../../../server/utils/video-generation/enqueue'
import type { VideoGenerationJob } from '../../../server/utils/video-generation/types'
import type { VideoGenerationProviderResult } from '../../../server/utils/video-generation/providers/types'
import { processVideoGenerationJob } from './worker'

interface Env {
  DATABASE_URL?: string
  HYPERDRIVE?: { connectionString: string }
  HYPERDRIVE_FRESH?: { connectionString: string }
  AI: { run(model: string, inputs: Record<string, unknown>, options?: any): Promise<any> }
  AUDIO_BUCKET: { put(key: string, value: ArrayBuffer | Uint8Array, options?: any): Promise<unknown> }
}

async function createOutputAsset(job: VideoGenerationJob, result: VideoGenerationProviderResult, env: Env) {
  if (!result.outputUrl) throw new Error('Completed provider result has no output URL')
  const { r2Key, sha256, dimensions } = await downloadToR2(env.AUDIO_BUCKET, fetch, result.outputUrl,
    `video-generation/${job.tenantId}/${job.id}/output.mp4`, { contentAddressed: true })
  const asset = await dbCreateVideoAsset({
    clientId: job.tenantId === 'agency' ? null : job.tenantId,
    createdBy: job.createdBy,
    title: `Generated video ${job.id}`,
    sourceProjectId: job.projectId,
    sourceJobId: job.id,
    r2Key,
    outputSha256: sha256,
    format: dimensions?.aspectRatio ?? job.aspectRatio,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    durationSec: job.durationSeconds
  })
  return { id: asset.id, r2Key, sha256 }
}

export default {
  async fetch(): Promise<Response> {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  },

  async queue(batch: MessageBatch<VideoGenerationMessage>, env: Env): Promise<void> {
    const connectionString = env.HYPERDRIVE_FRESH?.connectionString ?? env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL
    if (!connectionString) throw new Error('Video generation database binding unavailable')
    return withVideoGenerationDatabase(connectionString, async () => {
      for (const msg of batch.messages) {
        try {
          await processVideoGenerationJob(msg.body, {
            getJob: dbGetVideoGenerationJob,
            claimSubmission: dbClaimVideoGenerationSubmission,
            markRunning: dbMarkVideoGenerationJobRunning,
            markUnknown: dbMarkVideoGenerationJobUnknown,
            markFailed: dbMarkVideoGenerationJobFailed,
            markSucceeded: dbMarkVideoGenerationJobSucceeded,
            createOutputAsset: (job, result) => createOutputAsset(job, result, env),
            recordInvocation: dbRecordAiInvocation,
            providers: {
              mock: mockVideoGenerationProvider,
              aigateway: makeAiGatewayProvider({
              // Faithful passthrough — the provider builds flat model inputs plus gateway metadata.
                run: (model, inputs, options) => env.AI.run(model, inputs as any, options as any)
              })
            }
          })
          // Claim loss and unknown outcomes resolve. Only a throw before a durable claim retries.
          msg.ack()
        } catch (error) {
          console.error('video-generation.queue.error', msg.body?.jobId, error instanceof Error ? error.name : 'error')
          msg.retry({ delaySeconds: 30 })
        }
      }
    })
  }
}
