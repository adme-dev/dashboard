import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('marketing font loading', () => {
  it('ships the Geist variable font referenced by the global stylesheet', () => {
    const css = readFileSync('app/assets/css/main.css', 'utf8')
    const fontUrl = css.match(
      /@font-face\s*\{[\s\S]*?font-family:\s*['"]Geist['"][\s\S]*?url\(['"]?(\/fonts\/geist-latin-variable\.woff2)['"]?\)[\s\S]*?font-display:\s*swap[\s\S]*?font-weight:\s*100 900[\s\S]*?\}/
    )?.[1]

    expect(fontUrl).toBe('/fonts/geist-latin-variable.woff2')

    const fontPath = `public${fontUrl}`
    expect(existsSync(fontPath)).toBe(true)
    expect(readFileSync(fontPath).subarray(0, 4).toString('ascii')).toBe('wOF2')
  })
})
