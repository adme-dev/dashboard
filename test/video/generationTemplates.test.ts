import { describe, expect, it } from 'vitest'
import { VIDEO_GENERATION_TEMPLATES, resolveGenerationTemplate } from '~~/app/utils/video/generationTemplates'

describe('video generation templates', () => {
  it('exposes a curated catalog with the fields the gallery needs', () => {
    expect(VIDEO_GENERATION_TEMPLATES.length).toBeGreaterThanOrEqual(5)
    for (const template of VIDEO_GENERATION_TEMPLATES) {
      expect(template.id).toBeTruthy()
      expect(template.title).toBeTruthy()
      expect(template.tagline).toBeTruthy()
      expect(template.icon).toMatch(/^i-lucide-/)
      expect(['text-to-video', 'image-to-video']).toContain(template.mode)
      expect(template.prompt.length).toBeGreaterThan(40)
      expect(template.durationSeconds).toBeGreaterThan(0)
    }
  })

  it('has unique template ids', () => {
    const ids = VIDEO_GENERATION_TEMPLATES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves a template by id', () => {
    const first = VIDEO_GENERATION_TEMPLATES[0]!
    expect(resolveGenerationTemplate(first.id)).toEqual(first)
  })

  it('returns null for unknown ids', () => {
    expect(resolveGenerationTemplate('nope')).toBeNull()
  })

  it('includes the agency core use case: animating a vehicle still', () => {
    const vehicle = VIDEO_GENERATION_TEMPLATES.find(t => t.id === 'vehicle-hero-motion')
    expect(vehicle).toBeTruthy()
    expect(vehicle!.mode).toBe('image-to-video')
  })
})
