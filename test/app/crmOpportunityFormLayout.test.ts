import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/components/crm/OpportunityForm.vue', 'utf8')

describe('CRM opportunity form layout', () => {
  it('adapts its Nuxt UI field grid to the form container width', () => {
    expect(source).toContain('<form class="@container space-y-5"')
    expect(source).toContain('class="grid grid-cols-1 gap-4 @lg:grid-cols-2"')
    expect(source).toContain('label="Owner" class="@lg:col-span-2"')

    const fullWidthControls = source.match(/<(?:UInput|USelectMenu|UTextarea)\b[^>]*\bclass="w-full"/g) ?? []
    expect(fullWidthControls).toHaveLength(6)
    expect(source).not.toContain('class="grid grid-cols-2 gap-4"')
  })
})
