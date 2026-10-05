import { expect, it, vi } from 'vitest'
import { resolveGoogleFonts } from '../../scripts/thebrief/google-fonts.mjs'

const url = 'https://fonts.googleapis.com/css2?family=Poppins:wght@600'
const css = `@font-face{font-family:'Poppins';font-style:normal;font-weight:600;src:url(https://fonts.gstatic.com/s/poppins/v1/font.ttf) format('truetype');}`
const font = Buffer.from('000100000000000000000000', 'hex')
it('snapshots exact static font bytes and source hashes', async () => {
  const fetcher = vi.fn(async address => new Response(address === url ? css : font))
  const result = await resolveGoogleFonts([url], fetcher)
  expect(result.fonts[0]).toMatchObject({ family: 'Poppins', weight: 600, bytes: font })
  expect(result.receipts[0].sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(fetcher.mock.calls.every(([, options]) => options.redirect === 'error')).toBe(true)
})
it('rejects other hosts, subsets and invalid binary content', async () => {
  const fetcher = vi.fn(async () => new Response(css))
  await expect(resolveGoogleFonts(['https://localhost/css2'], fetcher)).rejects.toThrow(/Unapproved/)
  expect(fetcher).not.toHaveBeenCalled()
  await expect(resolveGoogleFonts([url + '&text=hi'], fetcher)).rejects.toThrow(/subset/)
  await expect(resolveGoogleFonts([url], fetcher)).rejects.toThrow(/bytes/)
  await expect(resolveGoogleFonts([url], async () => new Response(css.replace('fonts.gstatic.com', 'localhost')))).rejects.toThrow(/Unapproved/)
  await expect(resolveGoogleFonts([url], async () => new Response(css.replace('font-style:normal;', 'unicode-range:U+0000-00FF;font-style:normal;')))).rejects.toThrow(/subset/)
})
