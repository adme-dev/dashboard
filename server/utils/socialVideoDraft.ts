import type { SocialPublishPlatform } from '~/types'

export interface VideoStudioDraftInput {
  clientId: string
  createdBy: string
  mediaUrl: string
  format: string
  projectId: string
  jobId?: string | null
  assetId?: string | null
  socialBrief?: string | null
  campaignId?: string | null
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
  const ratio = format.match(/^(\d+):(\d+)$/)
  if (ratio && Number(ratio[1]) > Number(ratio[2])) return ['facebook']
  return ['facebook', 'instagram']
}

export async function buildVideoStudioSocialDraft(input: VideoStudioDraftInput): Promise<VideoStudioDraft> {
  const platforms = defaultPlatformsForVideoFormat(input.format)
  const primaryPlatform = platforms[0] ?? 'facebook'
  const topic = input.socialBrief?.trim() || input.prompt?.trim() || `New video creative in ${input.format}`
  let content = topic
  let captionGenerationFailed = false
  if (input.captionGenerator) {
    try {
      content = (await input.captionGenerator({ topic, platform: primaryPlatform, tone: 'professional' })).trim()
      captionGenerationFailed = !content || content === 'Unable to generate insight'
    } catch {
      captionGenerationFailed = true
    }
    if (captionGenerationFailed) content = ''
  }

  return {
    clientId: input.clientId,
    createdBy: input.createdBy,
    content: content.trim(),
    mediaUrls: [input.mediaUrl],
    platforms,
    tags: ['video-studio', input.format],
    metadata: {
      source: 'video_studio',
      ...(captionGenerationFailed ? { captionGenerationFailed: true } : {}),
      projectId: input.projectId,
      jobId: input.jobId ?? null,
      assetId: input.assetId ?? null,
      format: input.format,
      campaignId: input.campaignId ?? null,
      socialBrief: input.socialBrief ?? null,
      prompt: input.prompt ?? null,
      modelId: input.modelId ?? null
    }
  }
}
