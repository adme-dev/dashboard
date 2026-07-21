import { describe, expect, it } from 'vitest'
import { buildAttachmentContentDisposition } from '../../../server/utils/storage'

describe('attachment download content disposition', () => {
  it('forces attachment delivery with UTF-8 and ASCII filenames', () => {
    expect(buildAttachmentContentDisposition('Campaign final.pdf')).toBe(
      'attachment; filename="Campaign final.pdf"; filename*=UTF-8\'\'Campaign%20final.pdf'
    )
    expect(buildAttachmentContentDisposition('média.pdf')).toContain('filename*=UTF-8\'\'m%C3%A9dia.pdf')
  })

  it('strips header injection and path characters', () => {
    const value = buildAttachmentContentDisposition('../report\r\nX-Evil: yes".pdf')

    expect(value).toMatch(/^attachment;/)
    expect(value).not.toContain('\r')
    expect(value).not.toContain('\n')
    expect(value).not.toContain('../')
    expect(value).not.toContain('yes"')
  })
})
