import type { VideoGenerationModel, VideoGenerationMode } from '~~/server/utils/video-generation/types'

/**
 * Workflow-first generation: staff pick what they want to make, then a model that can do it.
 * Each workflow maps to a server generation mode plus the source frames it needs. Add a workflow
 * here (with its model predicate) when a registered model gains a new capability.
 */
export type VideoGenerationWorkflow = 'animate-image' | 'start-end-frames' | 'text-to-video'

export interface VideoGenerationWorkflowDefinition {
  id: VideoGenerationWorkflow
  label: string
  icon: string
  mode: VideoGenerationMode
  /** Source images the workflow needs: 0 (text), 1 (start) or 2 (start + end). */
  frames: 0 | 1 | 2
  supports: (model: Pick<VideoGenerationModel, 'modes' | 'capabilities'>) => boolean
}

export const VIDEO_GENERATION_WORKFLOWS: readonly VideoGenerationWorkflowDefinition[] = [
  {
    id: 'animate-image',
    label: 'Animate an image',
    icon: 'i-lucide-image-play',
    mode: 'image-to-video',
    frames: 1,
    supports: model => model.modes.includes('image-to-video')
  },
  {
    id: 'start-end-frames',
    label: 'Start & end frames',
    icon: 'i-lucide-arrow-right-left',
    mode: 'image-to-video',
    frames: 2,
    supports: model => model.modes.includes('image-to-video') && model.capabilities.endFrame
  },
  {
    id: 'text-to-video',
    label: 'Text → video',
    icon: 'i-lucide-type',
    mode: 'text-to-video',
    frames: 0,
    supports: model => model.modes.includes('text-to-video')
  }
]

export function videoGenerationWorkflow(id: VideoGenerationWorkflow): VideoGenerationWorkflowDefinition {
  return VIDEO_GENERATION_WORKFLOWS.find(workflow => workflow.id === id) ?? VIDEO_GENERATION_WORKFLOWS[0]!
}

export function modelsForWorkflow<T extends Pick<VideoGenerationModel, 'modes' | 'capabilities'>>(models: T[], id: VideoGenerationWorkflow): T[] {
  const workflow = videoGenerationWorkflow(id)
  return models.filter(model => workflow.supports(model))
}

/** Only offer workflows at least one available model can run; never an empty choice. */
export function availableWorkflows(models: Pick<VideoGenerationModel, 'modes' | 'capabilities'>[]): VideoGenerationWorkflowDefinition[] {
  return VIDEO_GENERATION_WORKFLOWS.filter(workflow => models.some(model => workflow.supports(model)))
}

/** The plain workflow for a server mode (used by templates, reuse and model pre-selection). */
export function workflowForMode(mode: VideoGenerationMode): VideoGenerationWorkflow {
  return mode === 'text-to-video' ? 'text-to-video' : 'animate-image'
}
