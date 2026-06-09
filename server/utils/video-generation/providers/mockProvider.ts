import type {
  VideoGenerationProvider,
  VideoGenerationProviderRequest,
  VideoGenerationProviderSubmission,
} from '~~/server/utils/video-generation/providers/types'

export const mockVideoGenerationProvider: VideoGenerationProvider = {
  async submit(request: VideoGenerationProviderRequest): Promise<VideoGenerationProviderSubmission> {
    return {
      providerRequestId: `mock-${request.jobId}`,
      status: 'submitted',
    }
  },

  async poll(submission: VideoGenerationProviderSubmission) {
    return {
      status: 'succeeded',
      outputUrl: `https://mock.local/video-generation/${submission.providerRequestId}.mp4`,
      actualCostCents: 0,
    } as const
  },
}
