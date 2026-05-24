import { describe, it, expect } from 'vitest'
import { computeNextDeskPosition } from '~~/server/utils/office/allocateDesk'

describe('computeNextDeskPosition', () => {
  it('returns (0, gridOriginY) origin when there are no existing desks', () => {
    const pos = computeNextDeskPosition({
      existingDesks: [],
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 0, y: 600 })
  })

  it('places the second desk one cell to the right', () => {
    const pos = computeNextDeskPosition({
      existingDesks: [{ x: 0, y: 600 }],
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 96, y: 600 })
  })

  it('wraps to the next row after filling 8 columns', () => {
    const existingDesks = Array.from({ length: 8 }, (_, i) => ({
      x: i * 96,
      y: 600,
    }))
    const pos = computeNextDeskPosition({
      existingDesks,
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 0, y: 676 })
  })

  it('reuses the lowest free slot when desks are sparse', () => {
    // Slot (1, 0) is free; should be picked before extending to slot (0, 1)
    const existingDesks = [
      { x: 0, y: 600 },   // (col 0, row 0)
      { x: 192, y: 600 }, // (col 2, row 0)
    ]
    const pos = computeNextDeskPosition({
      existingDesks,
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 96, y: 600 })
  })
})
