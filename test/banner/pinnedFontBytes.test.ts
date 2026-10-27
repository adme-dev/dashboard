import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { BANNER_PINNED_FONT as pin } from '../../shared/bannerPinnedFont'
import { FONT_PIN, inspectPinnedFont } from '../../workers/banner-engine/fonts/runtime.mjs'

it('ships exact licensed static bytes identical to the accepted Linux font, with proven cmap coverage', () => {
  const bytes = readFileSync(resolve('public' + pin.url))
  const license = readFileSync(resolve('public' + pin.licenseUrl))
  expect(bytes.byteLength).toBe(pin.byteLength)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256)
  expect(createHash('sha256').update(license).digest('hex')).toBe(pin.licenseSha256)
  expect(pin.sha256).toBe(FONT_PIN.sha256)
  expect(inspectPinnedFont(bytes)).toMatchObject({ family: pin.family, postscriptName: pin.postscriptName, version: pin.version, weight: 700 })
  expect(inspectPinnedFont(bytes).coverage).toHaveLength(198)
  expect(license.toString()).toContain('SIL OPEN FONT LICENSE')
})
