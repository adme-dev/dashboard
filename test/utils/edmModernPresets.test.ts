import { describe, expect, it } from 'vitest'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MODERN_EDM_SECTION_IDS, MODERN_EDM_SECTION_PRESETS, MODERN_EDM_STARTER_TEMPLATES } from '~~/app/utils/edmModernPresets'

const nativeTypes = new Set(['Heading', 'Text', 'Button', 'Image', 'menu', 'feature-grid', 'footer', 'Html'])
describe('modern industry email library', () => {
  it('builds five distinct complete industry starters from reusable editable sections', () => {
    expect(MODERN_EDM_STARTER_TEMPLATES).toHaveLength(5)
    expect(new Set(MODERN_EDM_STARTER_TEMPLATES.map(t => t.industry)).size).toBe(5)
    expect(new Set(MODERN_EDM_SECTION_IDS).size).toBe(MODERN_EDM_SECTION_IDS.length)
    expect(MODERN_EDM_SECTION_PRESETS.map(s => s.id)).toEqual([...MODERN_EDM_SECTION_IDS])
    for (const template of MODERN_EDM_STARTER_TEMPLATES) {
      const sections = template.sectionPresetIds.map(id => MODERN_EDM_SECTION_PRESETS.find(s => s.id === id))
      expect(sections.every(Boolean)).toBe(true)
      expect(sections.map(s => s!.categoryId)).toEqual(['header', 'content', 'feature', 'call-to-action', 'footer'])
      const blocks = sections.flatMap(s => s!.blocks)
      expect(blocks.every(b => nativeTypes.has(b.type))).toBe(true)
      expect(blocks.some(b => b.type === 'Image' && String(b.data.props?.alt).length > 20)).toBe(true)
      expect(blocks.some(b => (b.type === 'Button' && String(b.data.props?.url).startsWith('https://')) || (b.type === 'Html' && /<a href="https:\/\//.test(String(b.data.props?.contents))))).toBe(true)
      expect(blocks.filter(b => b.type === 'footer')).toHaveLength(1)
      expect(blocks.find(b => b.type === 'footer')!.data.props?.showUnsubscribe).toBe(true)
      expect(JSON.stringify(blocks)).not.toMatch(/picsum|placehold\.co|100 George St|Weekly Digest/)
    }
  })
  it('keeps dark headings readable, mobile feature stacks explicit, and legal footers on a light surface', () => {
    const blocks = MODERN_EDM_SECTION_PRESETS.flatMap(s => s.blocks)
    for (const b of blocks) {
      if (b.type === 'Heading' && ['#102332', '#183C35', '#153B43', '#39324F', '#182E49'].includes(String(b.data.style?.backgroundColor))) expect(b.data.style?.color).toBe('#FFFFFF')
      if (b.type === 'feature-grid') expect(b.data.mobile?.props?.columns).toBe(1)
      if (b.type === 'footer') expect(b.data.style?.backgroundColor).toBe('#F6F7F9')
    }
    expect(MODERN_EDM_SECTION_PRESETS.filter(s => s.categoryId === 'transactional')).toHaveLength(3)
  })
  it('ships generated image delivery copies locally with JPEG signatures and bounded byte sizes', () => {
    const generated = MODERN_EDM_SECTION_PRESETS.flatMap(s => s.blocks).filter(b => b.type === 'Image' && String(b.data.props?.url).includes('/email/modern/'))
    expect(generated).toHaveLength(4)
    for (const image of generated) {
      const url = new URL(String(image.data.props?.url))
      expect(url.origin).toBe('https://app.xeroflow.io')
      const file = resolve(import.meta.dirname, '../../public' + url.pathname)
      expect(existsSync(file)).toBe(true)
      expect(statSync(file).size).toBeLessThan(300 * 1024)
      expect([...readFileSync(file).subarray(0, 3)]).toEqual([255, 216, 255])
    }
  })
})
