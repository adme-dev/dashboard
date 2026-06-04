import { describe, expect, it } from 'vitest'
import {
  edmBlockHasResponsiveRules,
  edmResponsiveClassForBlock,
  getBlockForDevice,
  getHideClassForBlock,
  isHiddenOnDevice,
  mobileStyleDeclarationsForBlock
} from '~~/app/utils/edmResponsive'

describe('edmResponsive helpers', () => {
  it('keeps desktop/base blocks unchanged when no mobile override exists', () => {
    const block = { type: 'Text', data: { props: { text: 'Base' }, style: { color: '#111111' } } }

    expect(getBlockForDevice(block, 'desktop')).toEqual(block)
    expect(getBlockForDevice(block, 'mobile')).toEqual(block)
    expect(edmBlockHasResponsiveRules(block)).toBe(false)
  })

  it('merges mobile style and props over base values', () => {
    const block = {
      type: 'Text',
      data: {
        props: { text: 'Desktop', align: 'left' },
        style: { color: '#111111', padding: { top: 16, right: 24, bottom: 16, left: 24 } },
        mobile: {
          props: { text: 'Mobile' },
          style: { color: '#222222', padding: { top: 8, right: 12, bottom: 8, left: 12 } }
        }
      }
    }

    expect(getBlockForDevice(block, 'mobile').data.props).toEqual({ text: 'Mobile', align: 'left' })
    expect(getBlockForDevice(block, 'mobile').data.style).toEqual({
      color: '#222222',
      padding: { top: 8, right: 12, bottom: 8, left: 12 }
    })
  })

  it('computes visibility flags per device', () => {
    const block = { type: 'Text', data: { hideOnMobile: true, hideOnDesktop: false } }

    expect(isHiddenOnDevice(block, 'mobile')).toBe(true)
    expect(isHiddenOnDevice(block, 'desktop')).toBe(false)
    expect(getHideClassForBlock(block)).toBe('edm-hide-mobile')
  })

  it('uses deterministic responsive class names from block ids', () => {
    expect(edmResponsiveClassForBlock('block-123_abc')).toBe('edm-r-block-123_abc')
    expect(edmResponsiveClassForBlock('bad id!')).toBe('edm-r-bad-id-')
  })

  it('builds sanitized mobile CSS declarations for supported style values', () => {
    const block = {
      type: 'Text',
      data: {
        mobile: {
          style: {
            color: '#123456',
            backgroundColor: 'javascript:alert(1)',
            fontSize: 14,
            textAlign: 'center',
            padding: { top: 4, right: 8, bottom: 4, left: 8 },
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: '#abcdef'
          }
        }
      }
    }

    expect(mobileStyleDeclarationsForBlock(block)).toEqual([
      ['color', '#123456'],
      ['font-size', '14px'],
      ['text-align', 'center'],
      ['padding', '4px 8px 4px 8px'],
      ['border', '2px solid #abcdef']
    ])
  })
})
