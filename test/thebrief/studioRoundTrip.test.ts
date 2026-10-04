import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'
import type { BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const save = vi.fn().mockResolvedValue({})
vi.stubGlobal('$fetch', save)
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')

describe('TheBrief candidate through native Banner Studio state', () => {
  it('retains animation tracks through headline edit, undo, save payload and reload', async () => {
    const candidate = await convertTheBriefHtml(source)
    const project = { id: 'pilot', name: 'Import trial', canvasData: candidate.canvasData } as BannerProject
    const studio = useBannerStudio()
    studio.loadProject(project)
    expect(studio.activeFormat.value).toMatchObject({ w: 300, h: 250 })
    const headline = studio.activeLayers.value.find(layer => layer.type === 'text')!
    const originalTracks = structuredClone(studio.getCanvasData().custom_300x250!.layers.find(layer => layer.id === headline.id)!.keyframes)
    studio.updateLayer(headline.id, { text: 'Updated headline' })
    studio.undo()
    expect(studio.activeLayers.value.find(layer => layer.id === headline.id)!.text).toBe('Hello world')
    studio.redo()
    await studio.saveProject()
    const payload = save.mock.calls.at(-1)![1].body
    const saved = JSON.parse(JSON.stringify(payload.canvasData))
    studio.loadProject({ ...project, canvasData: saved })
    const restored = studio.activeLayers.value.find(layer => layer.id === headline.id)!
    expect(restored.text).toBe('Updated headline')
    expect(restored.keyframes).toEqual(originalTracks)
    expect(restored.keyframes!.opacity!.at(-1)).toMatchObject({ time: 4, value: 1 })
    expect(studio.state.isDirty).toBe(false)
  })
})
