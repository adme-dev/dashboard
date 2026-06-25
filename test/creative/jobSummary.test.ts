import { describe, expect, it } from 'vitest'
import { summarizeCreativeJobs } from '~~/app/utils/creative/jobSummary'

describe('creative job summary', () => {
  it('normalizes render, generation, and audio jobs into one status model', () => {
    const summary = summarizeCreativeJobs({
      renderJobs: [
        {
          id: 'render-1',
          projectId: 'project-1',
          status: 'done',
          variants: { reels_9x16: 'renders/reels.mp4' },
          createdAt: '2026-06-26T10:00:00.000Z',
          updatedAt: '2026-06-26T10:01:00.000Z'
        },
        {
          id: 'render-2',
          projectId: 'project-1',
          status: 'failed',
          variants: {},
          error: 'runtime_not_ready: runtime_not_ready after 2500ms',
          createdAt: '2026-06-26T10:04:00.000Z',
          updatedAt: '2026-06-26T10:05:00.000Z'
        }
      ],
      generationJobs: [
        {
          id: 'generation-1',
          status: 'running',
          mode: 'image-to-video',
          modelId: 'workers-ai/model',
          prompt: 'Show a clean vehicle walkaround',
          errorMessage: null,
          createdAt: '2026-06-26T10:03:00.000Z',
          updatedAt: '2026-06-26T10:03:30.000Z'
        },
        {
          id: 'generation-2',
          status: 'blocked',
          mode: 'text-to-video',
          modelId: 'workers-ai/model',
          prompt: 'Unsupported request',
          errorMessage: 'missing approved source asset',
          createdAt: '2026-06-26T10:02:00.000Z',
          updatedAt: '2026-06-26T10:02:30.000Z'
        }
      ],
      audioAssets: [
        {
          id: 'audio-1',
          kind: 'music',
          status: 'queued',
          title: null,
          prompt: 'Warm acoustic bed',
          error: null,
          createdAt: '2026-06-26T10:01:00.000Z',
          updatedAt: '2026-06-26T10:01:30.000Z'
        },
        {
          id: 'audio-2',
          kind: 'voiceover',
          status: 'failed',
          title: 'VO take',
          prompt: 'Read this line',
          error: 'provider timeout',
          createdAt: '2026-06-26T10:06:00.000Z',
          updatedAt: '2026-06-26T10:06:30.000Z'
        }
      ]
    })

    expect(summary.counts).toEqual({
      total: 6,
      queued: 1,
      running: 1,
      ready: 1,
      failed: 2,
      blocked: 1,
      active: 2,
      completed: 1,
      attention: 3
    })
    expect(summary.items.map(item => item.id)).toEqual([
      'audio:audio-2',
      'render:render-2',
      'generation:generation-1',
      'generation:generation-2',
      'audio:audio-1',
      'render:render-1'
    ])
    expect(summary.items).toMatchObject([
      {
        id: 'audio:audio-2',
        source: 'audio_assets',
        sourceId: 'audio-2',
        kind: 'audio',
        status: 'failed',
        retryable: true,
        label: 'VO take',
        error: 'provider timeout'
      },
      {
        id: 'render:render-2',
        source: 'media_render_jobs',
        sourceId: 'render-2',
        kind: 'render',
        status: 'failed',
        retryable: true,
        label: 'Render render-2',
        error: 'runtime_not_ready after 2500ms'
      },
      {
        id: 'generation:generation-1',
        source: 'video_generation_jobs',
        sourceId: 'generation-1',
        kind: 'generation',
        status: 'running',
        retryable: false,
        label: 'Show a clean vehicle walkaround'
      },
      {
        id: 'generation:generation-2',
        status: 'blocked',
        retryable: false,
        error: 'missing approved source asset'
      },
      {
        id: 'audio:audio-1',
        status: 'queued',
        retryable: false,
        label: 'Music asset'
      },
      {
        id: 'render:render-1',
        status: 'ready',
        retryable: false,
        label: 'Render reels_9x16'
      }
    ])
  })
})
