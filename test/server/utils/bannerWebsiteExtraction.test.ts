import { describe, expect, it, vi } from 'vitest'
import { extractBrandWebsite, fetchBrandWebsiteLogo, fetchBrandWebsiteResource, readBrandCssSignals, validateBrandLogoResource } from '~~/server/utils/banner/websiteExtraction'

const resolver = { resolve4: async () => ['93.184.215.14'], resolve6: async () => [] }
const response = (body: string | Uint8Array, type = 'text/html', status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': type, ...headers } })
const dependencies = (handler: (url: string) => Response) => ({ resolver, fetcher: vi.fn(async (url: string | URL | Request) => handler(String(url))) as unknown as typeof fetch })

describe('bounded public brand website extraction', () => {
  it('uses a guarded browser resource for Cloudflare 520 HTML and CSS responses', async () => {
    const browserResource = vi.fn(async (url: string, kind: 'html' | 'css' | 'logo') => ({
      url,
      mimeType: kind === 'html' ? 'text/html' : kind === 'css' ? 'text/css' : 'image/svg+xml',
      bytes: Buffer.from(kind === 'html'
        ? '<title>BMW</title><link rel="stylesheet" href="/brand.css"><img alt="BMW logo" src="/logo.svg">'
        : kind === 'css' ? 'body{font-family:"BMW Type";color:#003399}' : '<svg xmlns="http://www.w3.org/2000/svg"><switch><g><path fill="#003399" d="M0 0h10v10z"/></g></switch></svg>')
    }))
    const deps = {
      resolver,
      fetcher: vi.fn(async () => response('edge error', 'text/plain', 520)) as unknown as typeof fetch,
      browserResource
    }
    const page = await extractBrandWebsite('https://www.bmw.com.au/en/home.html', deps)
    expect(page.title).toBe('BMW')
    expect(page.fonts[0]?.family).toBe('BMW Type')
    expect(page.primaryColors).toContain('#003399')
    expect(page.logoCandidates).toContain('https://www.bmw.com.au/logo.svg')
    expect(browserResource).toHaveBeenCalledTimes(2)
    const logo = await fetchBrandWebsiteLogo('https://www.bmw.com.au/logo.svg', deps)
    expect(logo.mimeType).toBe('image/svg+xml')
    expect(browserResource).toHaveBeenCalledTimes(3)
  })

  it('reads larger OEM homepages while enforcing the 2 MiB streamed HTML bound', async () => {
    const html = '<title>OEM homepage</title><!--' + ' '.repeat(620 * 1024) + '-->'
    const page = await extractBrandWebsite('https://brand.example/', dependencies(() => response(html)))
    expect(page.title).toBe('OEM homepage')
    await expect(fetchBrandWebsiteResource('https://brand.example/', 'html', dependencies(() => response(new Uint8Array(2 * 1024 * 1024 + 1)))))
      .rejects.toThrow('size limit')
  })

  it('reads external CSS and imports relative to final response URLs without downloading fonts', async () => {
    const deps = dependencies((url) => {
      if (url === 'https://brand.example/') return response('', 'text/html', 302, { location: '/shop/' })
      if (url === 'https://brand.example/shop/') return response(`<title>Example</title><meta content="Example Brand" property="og:site_name"><meta name="theme-color" content="#123"><link href="css/main.css" rel="stylesheet"><img alt="Brand logo" src="../logo.svg"><style>.local{color:#abc}</style>`)
      if (url.endsWith('/shop/css/main.css')) return response('@import url(type.css); body{font-family:"Dealer Sans",sans-serif;font-weight:400;background:#abcdef}h1{font-family:"Dealer Display";font-weight:700;color:#f90}', 'text/css')
      if (url.endsWith('/shop/css/type.css')) return response('@font-face{font-family:"Dealer Sans";font-weight:600;src:url(secret-font.woff2)}', 'text/css')
      throw new Error(`Unexpected fetch: ${url}`)
    })
    const page = await extractBrandWebsite('https://brand.example/', deps)
    expect(page.url).toBe('https://brand.example/shop/')
    expect(page.brandName).toBe('Example Brand')
    expect(page.fonts).toEqual([{ role: 'heading', family: 'Dealer Sans', weights: [400, 600], defaultWeight: 400 }, { role: 'body', family: 'Dealer Display', weights: [700], defaultWeight: 700 }])
    expect(page.primaryColors).toEqual(expect.arrayContaining(['#aabbcc', '#abcdef', '#ff9900']))
    expect(page.logoCandidates).toEqual(['https://brand.example/logo.svg'])
    expect(page.stylesheetsRead).toBe(2)
    expect(page.warnings.join(' ')).toContain('no font files were downloaded')
    expect(deps.fetcher).toHaveBeenCalledTimes(4)
    expect(vi.mocked(deps.fetcher).mock.calls.every(([, options]) => options?.redirect === 'manual' && !!options.signal)).toBe(true)
  })

  it.each(['http://127.0.0.1/private', 'http://169.254.169.254/latest/meta-data', 'https://[::1]/', 'file:///etc/passwd', 'https://user:password@brand.example/'])('blocks unsafe source %s before fetching', async (url) => {
    const deps = dependencies(() => response('secret'))
    await expect(fetchBrandWebsiteResource(url, 'html', deps)).rejects.toThrow()
    expect(deps.fetcher).not.toHaveBeenCalled()
  })

  it('blocks mixed private DNS answers before website transport', async () => {
    const deps = { ...dependencies(() => response('secret')), resolver: { resolve4: async () => ['93.184.215.14', '10.1.2.3'], resolve6: async () => [] } }
    await expect(fetchBrandWebsiteResource('https://brand.example/', 'html', deps)).rejects.toThrow()
    expect(deps.fetcher).not.toHaveBeenCalled()
  })

  it.each(['html', 'css', 'logo'] as const)('rechecks %s redirect targets and never requests internal destinations', async (kind) => {
    const deps = dependencies(() => response('', 'text/html', 302, { location: 'http://169.254.169.254/private' }))
    await expect(fetchBrandWebsiteResource('https://brand.example/resource', kind, deps)).rejects.toThrow()
    expect(deps.fetcher).toHaveBeenCalledTimes(1)
  })

  it('bounds redirect chains and cancels streamed bodies that exceed the byte limit', async () => {
    const redirects = dependencies(url => response('', 'text/html', 302, { location: `${url}next` }))
    await expect(fetchBrandWebsiteResource('https://brand.example/', 'html', redirects)).rejects.toThrow('redirect limit')
    expect(redirects.fetcher).toHaveBeenCalledTimes(4)
    const cancel = vi.fn()
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(257 * 1024)) },
      cancel
    })
    const deps = dependencies(() => new Response(stream, { headers: { 'content-type': 'text/css' } }))
    await expect(fetchBrandWebsiteResource('https://brand.example/style.css', 'css', deps)).rejects.toThrow('size limit')
    expect(cancel).toHaveBeenCalled()
  })

  it('returns partial draft warnings for unavailable or blocked CSS and caps linked stylesheets', async () => {
    const deps = dependencies(url => url === 'https://brand.example/'
      ? response('<title>Brand</title><style>body{color:#123456;font-family:"Inline Brand"}</style>' + Array.from({ length: 8 }, (_, i) => `<link rel="stylesheet" href="/style-${i}.css">`).join(''))
      : response('error', 'text/html', 404))
    const page = await extractBrandWebsite('https://brand.example/', deps)
    expect(page.fonts[0]?.family).toBe('Inline Brand')
    expect(page.stylesheetsRead).toBe(0)
    expect(page.warnings.some(warning => warning.includes('stylesheet'))).toBe(true)
    expect(deps.fetcher).toHaveBeenCalledTimes(5)
  })

  it('does not treat script strings or URL fragments as CSS brand colours', () => {
    const signals = readBrandCssSignals('body{background:url(image.svg#abcdef);color:#123}h1{font-family:"Another Brand";font-weight:700}')
    expect([...signals.colors.keys()]).toEqual(['#112233'])
    expect([...signals.fonts.keys()]).toEqual(['Another Brand'])
  })

  it('ignores icon fonts and assigns a single text family to both type roles', async () => {
    const css = '@font-face{font-family:"bmw_next_icons";font-weight:400}body{font-family:"bmwTypeNextWeb";font-weight:400}h1{font-family:"bmwTypeNextWeb";font-weight:700}'
    const signals = readBrandCssSignals(css)
    expect([...signals.fonts.keys()]).toEqual(['bmwTypeNextWeb'])
    const deps = dependencies(url => url.endsWith('.css') ? response(css, 'text/css') : response('<title>BMW</title><link rel="stylesheet" href="/brand.css">'))
    const page = await extractBrandWebsite('https://brand.example/', deps)
    expect(page.fonts).toEqual([
      { role: 'heading', family: 'bmwTypeNextWeb', weights: [400, 700], defaultWeight: 700 },
      { role: 'body', family: 'bmwTypeNextWeb', weights: [400, 700], defaultWeight: 400 }
    ])
  })
})

describe('website logo mirroring boundary', () => {
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII='
  const embedded = (href: string, tag = 'image') => `<svg xmlns="http://www.w3.org/2000/svg"><${tag} href="${href}"/></svg>`
  const validateSvg = (svg: string) => validateBrandLogoResource({ bytes: Buffer.from(svg), mimeType: 'image/svg+xml' })
  const editorNamespaces = 'xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"'
  const rdfNamespaces = 'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"'
  it('retains bounded static RGB paint without accepting arbitrary CSS functions', () => {
    expect(validateSvg('<svg style="fill: rgb(0, 30, 80);"><path d="M0 0"/></svg>').bytes.toString()).toContain('fill: rgb(0, 30, 80);')
    for (const value of ['rgb(256,0,0)', 'rgb(-1,0,0)', 'rgb(NaN,0,0)', 'rgb(calc(1),0,0)', 'rgb(0,0,0) url(https://evil.example/)', 'expression(evil())']) {
      expect(() => validateSvg(`<svg style="fill:${value}"/>`)).toThrow()
    }
  })
  it('accepts inert SVG switch groups and static gradient stop colours only', () => {
    const safe = validateSvg('<svg><switch><g><linearGradient><stop style="stop-color:#e6e6ea;stop-opacity:0.5"/></linearGradient></g></switch></svg>')
    expect(safe.bytes.toString()).toContain('<switch>')
    expect(() => validateSvg('<svg><switch requiredFeatures="x"><path d="M0 0"/></switch></svg>')).toThrow('switch attributes')
    expect(() => validateSvg('<svg><switch><foreignObject><script>bad()</script></foreignObject></switch></svg>')).toThrow()
  })
  it('retains static mask modes and Unicode local gradient references', () => {
    const svg = '<svg aria-labelledby="title"><title id="title">Brand</title><defs><linearGradient id="名称未設定グラデーション_11"><stop offset="0" stop-color="#fff"/></linearGradient><mask id="mask" style="mask-type:luminance"><rect width="10" height="10" fill="#fff"/></mask><mask id="alpha" style="mask-type:alpha"/><style>.mark{fill:url(#名称未設定グラデーション_11);}</style></defs><path class="mark" mask="url(#mask)" fill="url(#名称未設定グラデーション_11)"/></svg>'
    const output = validateSvg(svg).bytes.toString()
    expect(output).toContain('mask-type:luminance')
    expect(output).toContain('mask-type:alpha')
    expect(output).toContain('fill:url(#名称未設定グラデーション_11)')
    expect(output).toContain('fill="url(#名称未設定グラデーション_11)"')
    expect(output).toContain('aria-labelledby="title"')
  })
  it.each([
    '<mask style="mask-type:url(https://evil.example/)"/>',
    '<mask style="mask-type:expression(evil())"/>',
    '<mask style="mask-type:unknown"/>',
    '<path style="mask-type:luminance"/>',
    '<style>.x{fill:url(https://evil.example/#名称);}</style>',
    '<style>.x{fill:url(#名称%2fimage);}</style>',
    '<path fill="url(//evil.example/#名称)"/>',
    '<path fill="url(#名称) url(https://evil.example/)"/>',
    '<path fill="url(#名称\\2fimage)"/>'
  ])('keeps mask properties and Unicode paint references strictly static/local', (content) => {
    expect(() => validateSvg(`<svg>${content}</svg>`)).toThrow()
  })
  it('preserves class paint rules, their cascade order and local clip paths', () => {
    const css = '.cls-1{clip-path:url(#clippath-1);}.cls-2{fill:#0071ce;}.cls-2{fill:#ffffff;}.cls-3,.cls-4{fill:none;}'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-name="Layer 1" style="enable-background:new 0 0 1000 160;"><defs><style type="text/css">${css}</style><clipPath id="clippath-1"><rect width="10" height="10"/></clipPath></defs><g class="cls-1"><path class="cls-2" d="M0 0h10v10z"/></g></svg>`
    const output = validateSvg(svg).bytes.toString()
    expect(output).toContain(css)
    expect(output).toContain('class="cls-2"')
    expect(output).toContain('clipPath id="clippath-1"')
    expect(output).toContain('enable-background:new 0 0 1000 160;')
    expect(output).not.toContain('data-name')
  })
  it.each([
    '@import "https://evil.example/style.css";',
    '.mark{fill:url(https://evil.example/image.svg);}',
    '.mark{clip-path:url(//evil.example/path);}',
    '.mark{fill:u\\72l(https://evil.example/image.svg);}',
    '.mark{background-image:url(https://evil.example/a.png);}',
    '.mark{fill:expression(evil());}',
    '.mark{fill:var(--injected);}',
    '.mark{animation:evil 1s;}',
    '.mark{fill:red;}@font-face{src:url(https://evil.example/font);}',
    '.mark{fill:red;}.mark:hover{fill:blue;}',
    'image[href]{fill:red;}',
    '.mark{fill:red;}<script>evil()</script>',
    '.mark{fill:red;}unclosed',
    '.mark{fill:red;{stroke:blue;}}'
  ])('rejects CSS outside the static class paint grammar: %s', (css) => {
    expect(() => validateSvg(`<svg><style>${css}</style><path class="mark"/></svg>`)).toThrow()
  })
  it('removes recognized MG RDF metadata while preserving painted paths', () => {
    const svg = `<svg ${editorNamespaces} ${rdfNamespaces}><metadata id="metadata14"><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title>Brand mark</dc:title></cc:Work></rdf:RDF></metadata><sodipodi:namedview objecttolerance="10" gridtolerance="10" guidetolerance="10" inkscape:pageshadow="2"/><path d="M0 0h10v10z" style="fill:#cd1316;fill-opacity:1;stroke-width:7.62348"/></svg>`
    const output = validateSvg(svg).bytes.toString()
    expect(output).not.toMatch(/metadata|rdf:|dc:|cc:|sodipodi|inkscape/)
    expect(output).toContain('fill:#cd1316;fill-opacity:1;stroke-width:7.62348')
    expect(output).toContain('d="M0 0h10v10z"')
  })
  it.each([
    '<rdf:RDF><script>evil()</script></rdf:RDF>',
    '<rdf:RDF><cc:Work rdf:about="https://evil.example/"><dc:title>Title</dc:title></cc:Work></rdf:RDF>',
    '<rdf:RDF><cc:Work rdf:about=""><dc:type rdf:resource="https://evil.example/"/></cc:Work></rdf:RDF>',
    '<rdf:RDF><cc:Work rdf:about=""><dc:title><image href="https://evil.example/a.png"/></dc:title></cc:Work></rdf:RDF>',
    '<rdf:RDF onload="evil()"/>',
    '<rdf:RDF><path d="M0 0"/></rdf:RDF>',
    '<unknown:thing/>',
    '<rdf:RDF><cc:Work><dc:title><foreignObject/></dc:title></cc:Work></rdf:RDF>'
  ])('never hides active, visible or unknown content while stripping metadata', (content) => {
    expect(() => validateSvg(`<svg ${rdfNamespaces}><metadata>${content}</metadata></svg>`)).toThrow()
  })
  it('does not allow unbounded stylesheet or non-finite background geometry', () => {
    expect(() => validateSvg(`<svg><style>${' '.repeat(32769)}</style></svg>`)).toThrow()
    expect(() => validateSvg('<svg style="enable-background:new 0 0 1e999 1;"/>')).toThrow()
    expect(() => validateSvg('<svg style="enable-background:url(https://evil.example/);"/>')).toThrow()
  })
  it('strips known Inkscape editor metadata while retaining visible Ford-style paths, styles and geometry', () => {
    const result = validateSvg(`<?xml version="1.0"?><svg ${editorNamespaces} width="1000" height="359.91382" viewBox="0 0 264.58333 95.227339" sodipodi:docname="Ford.svg" inkscape:version="1.2.2"><sodipodi:namedview id="view" pagecolor="#ffffff" bordercolor="#111111" borderopacity="1" showgrid="false" inkscape:zoom="0.6" inkscape:current-layer="g1"/><g id="g1" inkscape:label="Logo"><path id="mark" d="M0 0h10v10z" style="fill:#00095b;fill-opacity:1;stroke-width:1.00001"/></g></svg>`).bytes.toString()
    expect(result).not.toMatch(/inkscape|sodipodi|namedview|xmlns:svg/)
    expect(result).toContain('viewBox="0 0 264.58333 95.227339"')
    expect(result).toContain('d="M0 0h10v10z"')
    expect(result).toContain('style="fill:#00095b;fill-opacity:1;stroke-width:1.00001"')
    expect(result).toContain('<g id="g1">')
  })
  it.each([
    `<svg ${editorNamespaces}><sodipodi:namedview><script>evil()</script></sodipodi:namedview></svg>`,
    `<svg ${editorNamespaces}><sodipodi:namedview onload="evil()"/></svg>`,
    `<svg ${editorNamespaces}><sodipodi:namedview><path d="M0 0"/></sodipodi:namedview></svg>`,
    `<svg ${editorNamespaces}><inkscape:script>evil()</inkscape:script></svg>`,
    `<svg ${editorNamespaces}><path inkscape:onload="evil()"/></svg>`,
    '<svg xmlns:inkscape="https://evil.example/"><path inkscape:label="x"/></svg>',
    '<svg xmlns:unknown="https://evil.example/"><unknown:metadata/></svg>',
    '<svg xmlns="https://evil.example/"><path/></svg>',
    '<svg><path inkscape:label="undeclared"/></svg>'
  ])('rejects active, visible or unknown editor namespace content', (svg) => {
    expect(() => validateSvg(svg)).toThrow()
  })
  it('preserves static pattern geometry and an embedded PNG through local use references', () => {
    const svg = `<svg width="65" height="65" viewBox="0 0 65 65" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="65" height="65" fill="url(#pattern0)"/><defs><pattern id="pattern0" patternContentUnits="objectBoundingBox" patternUnits="objectBoundingBox" patternTransform="translate(0 0) scale(1)" width="1" height="1"><use xlink:href="#image0" transform="translate(0.00984615 0.00797546) scale(0.000490346)"/></pattern><image id="image0" width="2008" height="2008" xlink:href="data:image/png;base64,${tinyPng}"/></defs></svg>`
    const result = validateSvg(svg).bytes.toString()
    expect(result).toContain(`xlink:href="data:image/png;base64,${tinyPng}"`)
    expect(result).toContain('patternContentUnits="objectBoundingBox"')
    expect(result).toContain('translate(0.00984615 0.00797546) scale(0.000490346)')
    expect(result).toContain('fill="url(#pattern0)"')
    expect(result).toContain('patternTransform="translate(0 0) scale(1)"')
  })
  it.each([
    'data:image/svg+xml;base64,' + Buffer.from('<svg><script>evil()</script></svg>').toString('base64'),
    'data:text/html;base64,' + Buffer.from('<script>evil()</script>').toString('base64'),
    'data:image/png;base64,' + Buffer.from('<script>evil()</script>').toString('base64'),
    'data:image/png,%89PNG',
    `data:image/png;base64,${tinyPng.slice(0, -1)}`,
    `data:image/png;base64,${tinyPng.slice(0, -1)}!`,
    'https://evil.example/image.png',
    '//evil.example/image.png',
    'javascript:evil()'
  ])('rejects active, external, malformed or mislabeled embedded image %s', (href) => {
    expect(() => validateSvg(embedded(href))).toThrow()
  })
  it('allows embedded raster bytes only on image, never on use or CSS', () => {
    const href = `data:image/png;base64,${tinyPng}`
    expect(() => validateSvg(embedded(href, 'use'))).toThrow()
    expect(() => validateSvg(`<svg><rect fill="url(${href})"/></svg>`)).toThrow()
    expect(() => validateSvg(`<svg><image href="${href}" onload="evil()"/></svg>`)).toThrow()
  })
  it.each(['<pattern patternUnits="url(https://evil.example/)"/>', '<pattern patternTransform="url(https://evil.example/)"/>', '<pattern patternTransform="translate(1) garbage"/>', '<pattern><animate attributeName="href" values="https://evil.example/"/></pattern>'])('rejects non-static pattern content %s', (content) => {
    expect(() => validateSvg(`<svg>${content}</svg>`)).toThrow()
  })
  it('bounds the whole SVG and embedded data before raster decoding', () => {
    expect(() => validateSvg(embedded('data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024)))).toThrow('size limit')
  })
  it('accepts a static SVG with internal references and validates bytes for raster images', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" viewBox="0 0 20 20"><defs><path id="mark" d="M0 0h10v10z"/></defs><use xlink:href="#mark" fill="#123456"/></svg>'
    const result = await fetchBrandWebsiteLogo('https://brand.example/logo.svg', dependencies(() => response(svg, 'image/svg+xml')))
    expect(result.bytes.toString()).toContain('href="#mark"')
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const png = await fetchBrandWebsiteLogo('https://brand.example/logo.png', dependencies(() => response(bytes, 'image/png')))
    expect(png.bytes).toEqual(Buffer.from(bytes))
    await expect(fetchBrandWebsiteLogo('https://brand.example/logo.png', dependencies(() => response('<script>alert(1)</script>', 'image/png')))).rejects.toThrow('image type')
  })
  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><foreignObject><iframe src="https://evil.example/"></iframe></foreignObject></svg>',
    '<svg><use href="https://evil.example/mark.svg#x"/></svg>',
    '<svg xml:base="https://evil.example/"><use href="#mark"/></svg>',
    '<svg><path fill="url(https://evil.example/)"/></svg>',
    '<svg><path style="background:image-set(\'https://evil.example/a.png\')"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg>&x;</svg>'
  ])('rejects active or external SVG content', async (svg) => {
    await expect(fetchBrandWebsiteLogo('https://brand.example/logo.svg', dependencies(() => response(svg, 'image/svg+xml')))).rejects.toThrow()
  })
  it('rejects a logo redirect to private DNS without fetching the target', async () => {
    const deps = { ...dependencies(() => response('', 'image/png', 302, { location: 'https://internal.example/logo.png' })), resolver: {
      resolve4: async (host: string) => host === 'internal.example' ? ['192.168.1.2'] : ['93.184.215.14'], resolve6: async () => []
    } }
    await expect(fetchBrandWebsiteLogo('https://brand.example/logo.png', deps)).rejects.toThrow()
    expect(deps.fetcher).toHaveBeenCalledTimes(1)
  })
})
