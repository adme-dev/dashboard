import { describe, expect, it } from 'vitest'
import { assessDesignCapabilities } from '../../shared/emailRendering/designCapabilities'
import {
  structuredDesign,
  type MutableDesignFixture
} from '../fixtures/email-design/structured'

describe('design capability assessment', () => {
  it('does not mistake structural validation for rendering or send approval', () => {
    const report = assessDesignCapabilities(structuredDesign())
    expect(report.tier).toBe('source-capabilities')
    expect(
      report.blocks.find(block => block.blockId === 'heading')?.disposition
    ).toBe('native-editable')
    expect(
      report.blocks.find(block => block.blockId === 'heading')
        ?.editableFields
    ).toEqual(['heading.data.props.text'])
  })
  it.each([
    ['Html', 'design-only'],
    ['VehicleCard', 'unsupported'],
    ['FreeformCanvas', 'unsupported'],
    ['UnknownFutureBlock', 'unsupported']
  ])(
    'does not silently translate %s into editable email content',
    (type, disposition) => {
      const input = structuredDesign()
      input.blocks.heading.type = type
      const report = assessDesignCapabilities(input)
      expect(
        report.blocks.find(block => block.blockId === 'heading')?.disposition
      ).toBe(disposition)
      expect(
        report.blocks.find(block => block.blockId === 'heading')
          ?.editableFields
      ).toEqual([])
      expect(report.hasUnsupported).toBe(disposition === 'unsupported')
    }
  )
  it('recognises column-count properties on existing composed feature blocks', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.heading = {
      type: 'feature-grid',
      data: { props: { columns: 3 } }
    }
    input.policy.editableFields = []
    expect(
      assessDesignCapabilities(input).blocks.find(
        block => block.blockId === 'heading'
      )?.disposition
    ).toBe('design-only')
  })
  it('surfaces a stored edit grant that a locked conversion cannot honour', () => {
    const input = structuredDesign()
    input.blocks.heading.type = 'Html'
    const report = assessDesignCapabilities(input)
    expect(report.hasPolicyConflicts).toBe(true)
    expect(report.issues).toContainEqual({
      code: 'POLICY_CAPABILITY_MISMATCH',
      blockId: 'heading',
      fields: ['heading.data.props.text']
    })
  })
})
