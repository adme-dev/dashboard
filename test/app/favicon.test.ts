import { existsSync, readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync('app/app.vue', 'utf8')

describe('XeroFlow favicon', () => {
  it('declares modern browser, legacy, and Apple icon formats', () => {
    expect(appSource).toContain(`type: 'image/svg+xml', href: '/favicon.svg?v=2'`)
    expect(appSource).toContain(`sizes: '32x32', href: '/favicon-32x32.png?v=2'`)
    expect(appSource).toContain(`rel: 'shortcut icon', href: '/favicon.ico?v=2'`)
    expect(appSource).toContain(`rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png?v=2'`)
  })

  it('ships every declared icon asset', () => {
    expect(existsSync('public/favicon.svg')).toBe(true)
    expect(existsSync('public/favicon-32x32.png')).toBe(true)
    expect(existsSync('public/favicon.ico')).toBe(true)
    expect(existsSync('public/apple-touch-icon.png')).toBe(true)
  })

  it('renders the PNG assets at their declared dimensions', async () => {
    const browserIcon = await sharp('public/favicon-32x32.png').metadata()
    const appleIcon = await sharp('public/apple-touch-icon.png').metadata()

    expect(browserIcon).toMatchObject({ format: 'png', width: 32, height: 32 })
    expect(appleIcon).toMatchObject({ format: 'png', width: 180, height: 180 })
  })

  it('uses the XF lettermark instead of the retired triangular logo', () => {
    const svg = readFileSync('public/favicon.svg', 'utf8')

    expect(svg).toContain('aria-label="XF"')
    expect(svg).toContain('id="letter-x"')
    expect(svg).toContain('id="letter-f"')
  })
})
