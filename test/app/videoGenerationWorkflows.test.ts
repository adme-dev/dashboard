import { describe, expect, it } from 'vitest'
import { availableWorkflows, modelsForWorkflow, workflowForMode, videoGenerationWorkflow } from '~~/app/utils/video/generationWorkflows'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'

const selectable = selectableVideoModelOptions(listSelectableVideoGenerationModels())

describe('video generation workflows', () => {
  it('offers start & end frames only when a selectable model supports an end frame', () => {
    expect(availableWorkflows(selectable).map(w => w.id)).toEqual(['animate-image', 'start-end-frames'])
    const noEndFrame = selectable.map(m => ({ ...m, capabilities: { ...m.capabilities, endFrame: false } }))
    expect(availableWorkflows(noEndFrame).map(w => w.id)).toEqual(['animate-image'])
    expect(availableWorkflows([])).toEqual([])
  })

  it('filters models to those that can run the workflow', () => {
    expect(modelsForWorkflow(selectable, 'start-end-frames').map(m => m.id)).toEqual(['aigateway/vidu-i2v'])
    expect(modelsForWorkflow(selectable, 'animate-image').length).toBeGreaterThan(1)
    expect(modelsForWorkflow(selectable, 'text-to-video')).toEqual([])
  })

  it('maps workflows to server modes and frame counts', () => {
    expect(videoGenerationWorkflow('start-end-frames')).toMatchObject({ mode: 'image-to-video', frames: 2 })
    expect(videoGenerationWorkflow('animate-image')).toMatchObject({ mode: 'image-to-video', frames: 1 })
    expect(videoGenerationWorkflow('text-to-video')).toMatchObject({ mode: 'text-to-video', frames: 0 })
    expect(workflowForMode('text-to-video')).toBe('text-to-video')
    expect(workflowForMode('image-to-video')).toBe('animate-image')
  })
})
