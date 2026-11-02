import { describe, expect, it } from 'vitest'
import { matchesMotorStackPaint, motorStackPaintName, motorStackPaintNames } from '../../app/utils/banner-motorstack-colours'

describe('MotorStack paint choices', () => {
  it('extracts distinct paint labels from vehicle photos and keeps unlabelled media separate', () => {
    const images = [
      { name: 'Forester · Subaru Forester AWD · Crystal White Pearl · photos 2', mime: 'image/webp', importable: true },
      { name: 'Forester · Subaru Forester AWD · Crystal White Pearl · photos 3', mime: 'image/webp', importable: true },
      { name: 'Forester · Subaru Forester AWD · Magnetite Grey Metallic', mime: 'image/webp', importable: true },
      { name: 'Forester · brochure', mime: 'application/pdf', importable: false },
      { name: 'Forester · gallery', mime: 'image/webp', importable: true }
    ]
    expect(motorStackPaintNames(images)).toEqual(['Crystal White Pearl', 'Magnetite Grey Metallic'])
    expect(motorStackPaintName(images[0]!.name)).toBe('Crystal White Pearl')
    expect(matchesMotorStackPaint(images[0]!, 'Crystal White Pearl')).toBe(true)
    expect(matchesMotorStackPaint(images[2]!, 'Crystal White Pearl')).toBe(false)
    expect(matchesMotorStackPaint(images[4]!, '__other_images__')).toBe(true)
  })
})
