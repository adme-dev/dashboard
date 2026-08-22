import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const featureIndex = readFileSync(new URL('../../app/pages/features/index.vue', import.meta.url), 'utf8')
const featureDetails = readFileSync(new URL('../../app/pages/features/[slug].vue', import.meta.url), 'utf8')

function extractEntry(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  if (start === -1) return ''

  const end = source.indexOf(endMarker, start + startMarker.length)
  return source.slice(start, end === -1 ? source.length : end)
}

describe('client financial marketing copy', () => {
  it('keeps the existing Xero entries synchronized around allocation and reconciliation concepts', () => {
    const indexEntry = extractEntry(featureIndex, "{ title: 'Xero Integration'", "{ title: 'EOM Engine'")
    const detailEntry = extractEntry(featureDetails, "'xero-integration': {", "'eom-engine': {")

    expect(indexEntry).toMatch(/project allocations?/i)
    expect(detailEntry).toMatch(/project allocations?/i)

    expect(indexEntry).toMatch(/Agency Gross Income/i)
    expect(detailEntry).toMatch(/Agency Gross Income|\bAGI\b/)

    expect(indexEntry).toMatch(/unallocated-source reconciliation/i)
    expect(detailEntry).toMatch(/unallocated-source reconciliation/i)
  })

  it('keeps the detailed entry explicit about source mapping, pass-through, visibility, totals, and governance', () => {
    const detailEntry = extractEntry(featureDetails, "'xero-integration': {", "'eom-engine': {")

    expect(detailEntry).toMatch(/Xero revenue lines and Xero supplier lines to projects/i)
    expect(detailEntry).toMatch(/synced Meta and Google Ads spend is treated as pass-through/i)
    expect(detailEntry).toMatch(/unallocated values remain visible until assigned/i)
    expect(detailEntry).toMatch(/client total equals project totals plus unallocated amounts/i)
    expect(detailEntry).toMatch(/Finance-gated, audited allocation changes/i)
  })
})
