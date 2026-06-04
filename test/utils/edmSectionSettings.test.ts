import { describe, expect, it } from 'vitest'
import { getEdmSectionSettings } from '~~/app/utils/edmSectionSettings'

describe('edmSectionSettings', () => {
  it('defines editable controls for hero-section', () => {
    const settings = getEdmSectionSettings('hero-section')
    expect(settings?.title).toBe('Hero section')
    expect(settings?.fields.map(field => field.key)).toEqual([
      'imageUrl',
      'heading',
      'subheading',
      'ctaText',
      'ctaUrl',
      'overlayOpacity',
      'textColor'
    ])
  })

  it('defines editable repeater controls for menu and feature-grid', () => {
    expect(getEdmSectionSettings('menu')?.fields.find(field => field.key === 'items')?.type).toBe('menu-items')
    expect(getEdmSectionSettings('feature-grid')?.fields.find(field => field.key === 'features')?.type).toBe('feature-items')
  })

  it('returns null for primitive blocks', () => {
    expect(getEdmSectionSettings('Heading')).toBeNull()
  })
})
