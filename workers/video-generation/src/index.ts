import { mockVideoGenerationProvider } from '../../../server/utils/video-generation/providers/mockProvider'
import {
  dbCreateVideoAsset,
  dbGetVideoGenerationJob,
  dbMarkVideoGenerationJobFailed,
  dbMarkVideoGenerationJobRunning,
  dbMarkVideoGenerationJobSucceeded,
} from './db'
import type { VideoGenerationMessage } from '../../../server/utils/video-generation/enqueue'
import type { VideoGenerationJob } from '../../../server/utils/video-generation/types'
import type { VideoGenerationProviderResult } from '../../../server/utils/video-generation/providers/types'
import { processVideoGenerationJob } from './worker'

interface Env {
  DATABASE_URL?: string
  HYPERDRIVE?: { connectionString: string }
}

async function createOutputAsset(job: VideoGenerationJob, result: VideoGenerationProviderResult) {
  const r2Key = `video-generation/${job.tenantId}/${job.id}/output.mp4`
  const asset = await dbCreateVideoAsset({
    clientId: job.tenantId === 'agency' ? null : job.tenantId,
    createdBy: job.createdBy,
    title: `Generated video ${job.id}`,
    sourceProjectId: job.projectId,
    sourceJobId: null,
    r2Key,
    format: job.aspectRatio,
    width: null,
    height: null,
    durationSec: job.durationSeconds,
  })
  return { id: asset.id, r2Key }
}

export default {
  async queue(batch: MessageBatch<VideoGenerationMessage>, env: Env): Promise<void> {
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL

    for (const msg of batch.messages) {
      try {
        await processVideoGenerationJob(msg.body, {
          getJob: dbGetVideoGenerationJob,
          markRunning: dbMarkVideoGenerationJobRunning,
          markFailed: dbMarkVideoGenerationJobFailed,
          markSucceeded: dbMarkVideoGenerationJobSucceeded,
          createOutputAsset,
          provider: mockVideoGenerationProvider,
        })
        msg.ack()
      } catch (error) {
        console.error('video-generation.queue.error', msg.body?.jobId, error)
        msg.retry({ delaySeconds: 30 })
      }
    }
  },
}
