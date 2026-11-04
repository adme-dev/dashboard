import { describe, it, expect } from 'vitest'
import { validateCopyMeasurementInput } from '../../shared/video-storyboard/copyMeasurement'

describe('bounded exact-copy measurement', () => {
  const input = { html: '<div>Exact</div>', width: 1080, height: 1920, durationSec: 2, fps: 30, required: [{ clipId: 'c', text: 'Exact', startSec: 0, durationSec: 2 }] }
  it('accepts the server compiled cue identity including colons', () => {
    const clipId = `sb:app:${'shot'.repeat(40)}:cue`
    expect(validateCopyMeasurementInput({ ...input, required: [{ ...input.required[0]!, clipId }] }).required[0]!.clipId).toBe(clipId)
  })
  it('retains the full string without normalization', () => {
    expect(validateCopyMeasurementInput(input)).toEqual(input)
  })
  it.each([
    { html: '<meta http-equiv=refresh content="0; url=https://example.com">' },
    { html: '<style>@font-face{font-family:Arial;src:url(data:font/woff;base64,AAAA)}</style>' },
    { html: '<svg><animateTransform attributeName="transform" type="translate" /></svg>' },
    { html: '<svg><animateMotion path="M 0 0 L 300 0" /></svg>' },
    { html: '<svg><discard /></svg>' },
    { html: '<marquee>Exact</marquee>' },
    { required: [] }, { width: 0 }, { fps: 10000 }, { durationSec: Infinity },
    { required: [{ clipId: 'c', text: 'x', startSec: 0, durationSec: 3 }] },
    { html: '<script>fetch("https://x")</script>' },
    { html: '<iframe src="https://x"></iframe>' },
    { html: '<div onclick="alert(1)">x</div>' }
  ])('rejects unsupported or unbounded request %j', (patch) => {
    expect(() => validateCopyMeasurementInput({ ...input, ...patch })).toThrow()
  })
})
