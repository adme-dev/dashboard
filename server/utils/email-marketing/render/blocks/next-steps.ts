import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { escapeHtml } from './helpers'

interface StepItem {
  title: string
  description: string
}

registerBlock({
  type: 'next-steps',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const props = (block.data.props || {}) as Record<string, unknown>
    const steps = (props.steps as StepItem[] | undefined) || getDefaultSteps(context)

    const stepsHtml = steps
      .map(
        (step, i) =>
          `<tr>
            <td style="padding:0 0 ${i < steps.length - 1 ? '16px' : '0'} 0;">
              <table cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:#3b82f6;color:#fff;font-size:14px;font-weight:bold;text-align:center;line-height:28px;">${i + 1}</div>
                </td>
                <td style="vertical-align:top;">
                  <p style="margin:0 0 2px;font-size:15px;font-weight:bold;color:#111827;">${escapeHtml(step.title)}</p>
                  <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.4;">${escapeHtml(step.description)}</p>
                </td>
              </tr></table>
            </td>
          </tr>`
      )
      .join('')

    return `
        <mj-section padding="16px 24px">
          <mj-column>
            <mj-text padding="0 0 12px" font-size="20px" font-weight="bold" color="#111827">Next Steps</mj-text>
            <mj-table padding="0" cellpadding="0" cellspacing="0">
              ${stepsHtml}
            </mj-table>
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const props = (block.data.props || {}) as Record<string, unknown>
    const steps = (props.steps as StepItem[] | undefined) || getDefaultSteps(context)

    const stepsHtml = steps
      .map((step, i) => {
        const isLast = i === steps.length - 1
        return `<tr>
          <td width="40" style="vertical-align:top;padding:0;">
            <table cellpadding="0" cellspacing="0" border="0" width="40">
              <tr>
                <td align="center" style="width:28px;height:28px;border-radius:50%;background:#3b82f6;color:#fff;font-size:14px;font-weight:bold;text-align:center;line-height:28px;">${i + 1}</td>
              </tr>
              ${!isLast ? `<tr><td align="center" style="height:100%;"><div style="width:2px;height:24px;background:#d1d5db;margin:0 auto;"></div></td></tr>` : ''}
            </table>
          </td>
          <td style="vertical-align:top;padding:4px 0 ${isLast ? '0' : '16px'} 8px;">
            <p style="margin:0 0 2px;font-size:15px;font-weight:bold;color:#111827;">${escapeHtml(step.title)}</p>
            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.4;">${escapeHtml(step.description)}</p>
          </td>
        </tr>`
      })
      .join('')

    return `
        <tr>
          <td style="padding:16px 24px;">
            <p style="margin:0 0 12px;font-size:20px;font-weight:bold;color:#111827;">Next Steps</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${stepsHtml}
            </table>
          </td>
        </tr>`
  },

  defaultProps: {
    steps: undefined
  }
})

function getDefaultSteps(context: BlockRenderContext): StepItem[] {
  return [
    {
      title: 'We\'ve received your enquiry',
      description: 'Our team will review your details shortly.'
    },
    { title: 'A team member will be in touch', description: 'We\'ll contact you within 24 hours.' },
    {
      title: 'Visit us',
      description: (context.dealerContext?.address as string) || 'Visit our showroom'
    }
  ]
}
