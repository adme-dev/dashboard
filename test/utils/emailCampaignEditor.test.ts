import { describe, expect, it } from 'vitest'
import { buildCampaignEditorPatch } from '~~/app/utils/emailCampaignEditor'

describe('buildCampaignEditorPatch', () => {
  it('includes a normalized From email when saving campaign content', () => {
    const bodySource = { root: { type: 'EmailLayout', data: { childrenIds: [] } } }

    expect(buildCampaignEditorPatch({
      subject: 'June offers',
      previewText: 'Preview copy',
      fromEmail: '  Sales@Adme.net.au  ',
      bodySource
    })).toEqual({
      subject: 'June offers',
      preview_text: 'Preview copy',
      from_email: 'Sales@Adme.net.au',
      body_source: bodySource
    })
  })

  it('clears empty campaign sender fields explicitly', () => {
    const bodySource = { root: { type: 'EmailLayout', data: { childrenIds: [] } } }

    expect(buildCampaignEditorPatch({
      subject: '',
      previewText: '',
      fromEmail: ' ',
      bodySource
    })).toEqual({
      subject: null,
      preview_text: null,
      from_email: null,
      body_source: bodySource
    })
  })

  it('trims campaign subject and preview text before saving builder content', () => {
    const bodySource = { root: { type: 'EmailLayout', data: { childrenIds: [] } } }

    expect(buildCampaignEditorPatch({
      subject: '  June offers  ',
      previewText: '  Latest deals inside  ',
      fromEmail: 'sales@example.com',
      bodySource
    })).toEqual({
      subject: 'June offers',
      preview_text: 'Latest deals inside',
      from_email: 'sales@example.com',
      body_source: bodySource
    })

    expect(buildCampaignEditorPatch({
      subject: '   ',
      previewText: '   ',
      fromEmail: 'sales@example.com',
      bodySource
    })).toEqual({
      subject: null,
      preview_text: null,
      from_email: 'sales@example.com',
      body_source: bodySource
    })
  })
})
