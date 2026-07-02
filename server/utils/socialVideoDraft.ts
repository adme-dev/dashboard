import type { SocialPublishPlatform } from '~/types'

export interface VideoStudioDraftInput {
  clientId: string
  createdBy: string
  mediaUrl: string
  format: string
  projectId: string
  jobId?: string | null
  assetId?: string | null
  prompt?: string | null
  modelId?: string | null
  captionGenerator?: (brief: { topic: string, platform: SocialPublishPlatform, tone: string }) => Promise<string>
}

export interface VideoStudioDraft {
  clientId: string
  createdBy: string
  content: string
  mediaUrls: string[]
  platforms: SocialPublishPlatform[]
  tags: string[]
  metadata: Record<string, unknown>
}

export function defaultPlatformsForVideoFormat(format: string): SocialPublishPlatform[] {
  if (format === 'reels_9x16' || format === '9:16') return ['instagram', 'facebook']
  if (format === 'square_1x1' || format === '1:1') return ['facebook', 'instagram']
  if (format === 'youtube_16x9' || format === '16:9') return ['facebook']
  return ['facebook', 'instagram']
}

export async function buildVideoStudioSocialDraft(input: VideoStudioDraftInput): Promise<VideoStudioDraft> {
  const platforms = defaultPlatformsForVideoFormat(input.format)
  const primaryPlatform = platforms[0] ?? 'facebook'
  const topic = input.prompt?.trim() || `New video creative in ${input.format}`
  const content = input.captionGenerator
    ? await input.captionGenerator({ topic, platform: primaryPlatform, tone: 'professional' })
    : topic

  return {
    clientId: input.clientId,
    createdBy: input.createdBy,
    content: content.trim(),
    mediaUrls: [input.mediaUrl],
    platforms,
    tags: ['video-studio', input.format],
    metadata: {
      source: 'video_studio',
      projectId: input.projectId,
      jobId: input.jobId ?? null,
      assetId: input.assetId ?? null,
      format: input.format,
      prompt: input.prompt ?? null,
      modelId: input.modelId ?? null
    }
  }
}
