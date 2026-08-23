import { describe, it, expect, vi } from 'vitest'

const html = `<!doctype html><html><head>
<title>Leapmotor Australia</title>
<meta property="og:site_name" content="Leapmotor">
<meta name="theme-color" content="#34e52e">
<link rel="apple-touch-icon" href="/icons/touch.png">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Barlow:wght@400;600&display=swap" rel="stylesheet">
<style>@font-face{font-family:"LeapSans";src:url(x.woff2)} h1{color:#0a0a10;font-family:"LeapSans",sans-serif} .btn{background:#34e52e}</style>
</head><body>
<a class="site-logo" href="/"><img src="/img/leapmotor-logo.svg" alt="Leapmotor logo"></a>
<img src="/img/hero.jpg" alt="C10">
</body></html>`

describe('urlScraper brand signals', () => {
  it('extracts fonts from Google Fonts links / @font-face and ranks logo candidates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })))
    const { scrapeUrl } = await import('~~/server/utils/urlScraper')
    const page = await scrapeUrl('https://leapmotor.com.au')
    expect(page.fontFamilies[0]).toBe('Barlow Condensed')
    expect(page.fontFamilies).toContain('LeapSans')
    expect(page.logoCandidates[0]).toBe('https://leapmotor.com.au/img/leapmotor-logo.svg')
    expect(page.logoCandidates).toContain('https://leapmotor.com.au/icons/touch.png')
    expect(page.themeColor).toBe('#34e52e')
    vi.unstubAllGlobals()
  })
})
