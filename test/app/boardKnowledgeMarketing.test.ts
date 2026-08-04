import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('governed Board Knowledge product guidance', () => {
  it('keeps the feature index, detail, navigation, and work guide in sync', () => {
    const index = read('app/pages/features/index.vue')
    const detail = read('app/pages/features/[slug].vue')
    const navigation = read('app/components/MarketingNav.vue')
    const guide = read('app/pages/resources/work-management.vue')
    const publicCopy = [index, detail, navigation, guide].join('\n')

    expect(index).toContain('submitted for management approval')
    expect(detail).toContain('Files and Governed Knowledge')
    expect(detail).toContain('PDF, DOCX, XLSX, PPTX, CSV, TXT, and JSON')
    expect(detail).toContain('source-aware citations')
    expect(navigation).toContain('Governed files and board knowledge')
    expect(guide).toContain('Uploading a file does not automatically make it AI knowledge')
    expect(guide).toContain('management approval')
    expect(publicCopy).toContain('permission-aware')
  })

  it('does not claim that every upload becomes immediately searchable', () => {
    const detail = read('app/pages/features/[slug].vue')
    expect(detail).not.toMatch(/upload[^.]{0,180}(immediately searchable|searchable immediately)/i)
    expect(detail).not.toMatch(/every (file|upload)[^.]{0,160}(indexed|searchable)/i)
  })
})
