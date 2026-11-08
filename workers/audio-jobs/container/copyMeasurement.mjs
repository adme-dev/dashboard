/** Static R1 exact-copy measurement. The same page preparation runs during capture.
 * Unsupported motion/network resources fail closed; no browser fallback counts as font proof. */
export function validateStaticCopy(input) {
  if (!input || typeof input.html !== 'string' || !input.html || input.html.length > 512 * 1024
    || /<(?:script|iframe|object|embed|link|base|meta|animate[\w:-]*|set|discard|marquee|video|audio|canvas)\b|\bon\w+\s*=|@import\b|@font-face\b/i.test(input.html)
    || /(?:url\(\s*["']?\s*(?!data:)[a-z/:])|\bsrc\s*=\s*["']\s*(?!data:)/i.test(input.html)
    || ![input.width, input.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)
    || !Number.isFinite(input.durationSec) || input.durationSec <= 0 || input.durationSec > 60
    || !Number.isInteger(input.fps) || input.fps < 1 || input.fps > 60
    || !Array.isArray(input.required) || !input.required.length || input.required.length > 100
    || input.required.some(r => !r || !/^[\w:-]{1,512}$/.test(r.clipId) || typeof r.text !== 'string' || !r.text || r.text.length > 20_000
      || !Number.isFinite(r.startSec) || r.startSec < 0 || !Number.isFinite(r.durationSec) || r.durationSec <= 0
      || r.startSec + r.durationSec > input.durationSec + 0.00001))
    throw new Error('Unsupported static copy input')
}
export async function prepareStaticCopyPage(page, input) {
  validateStaticCopy(input)
  await page.setViewport({ width: input.width, height: input.height, deviceScaleFactor: 1 })
  // Defense in depth: even malformed HTML cannot fetch remote resources or run scripts.
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'">`
  await page.setContent(csp + input.html, { waitUntil: 'load', timeout: 15_000 })
  await page.evaluate(() => document.fonts.ready)
  return inspectExactCopy(page, input)
}
export async function inspectExactCopy(page, input) {
  return page.evaluate(({ required, width, height }) => {
    const findings = []
    const messages = {
      COPY_CONTRAST_UNVERIFIED: 'Required copy needs an opaque solid backing with at least 4.5:1 text contrast. Images, gradients and transparent backing cannot be verified.',
      COPY_MARKUP_UNSUPPORTED: 'Required copy must be plain text without nested elements. Remove child layers and review again.',
      COPY_FONT_UNAVAILABLE: 'Use the supported Arial or Liberation Sans font; custom fonts need pinned font support before approval.',
      COPY_GLYPH_UNVERIFIED: 'This text is preserved, but its script needs verified font coverage before rendering.',
      COPY_OVERFLOW: 'Required copy extends outside this output. Adjust its size or placement and review again.',
      COPY_CLIPPED: 'Required copy is clipped. Expand its container and review again.',
      COPY_HIDDEN: 'Required copy must remain fully visible throughout its interval.',
      COPY_ANIMATION_UNSUPPORTED: 'Required copy must use a static layout for this renderer.',
      COPY_OVERLAP_UNVERIFIED: 'Another layer overlaps required copy. Separate the layers and review again.',
      COPY_TEXT_MISMATCH: 'The rendered text must exactly match the approved copy.',
      COPY_STYLE_UNSUPPORTED: 'Use the supported static text layout: remove generated pseudo-elements, shadows, filters and unsupported paint effects.'
    }
    const add = (code) => {
      if (!findings.some(f => f.code === code)) findings.push({ code, severity: 'blocker', message: messages[code] || 'Required copy could not be proven visible and exact in this format.' })
    }
    if (document.querySelectorAll('*').length > 500) add('COPY_STYLE_UNSUPPORTED')
    for (const node of document.querySelectorAll('html, body, body *')) {
      const paint = getComputedStyle(node)
      const isCopyMarker = required.some(r => node.getAttribute('data-storyboard-copy-id') === r.clipId)
      // A shadow/filter/outline can cover glyphs outside its element rectangle.
      // Bounding boxes cannot certify that paint, so the static profile excludes it.
      if (paint.boxShadow !== 'none' || paint.filter !== 'none' || paint.backdropFilter !== 'none'
        || (paint.outlineStyle !== 'none' && parseFloat(paint.outlineWidth) > 0)
        || (!isCopyMarker && paint.textShadow !== 'none')) add('COPY_STYLE_UNSUPPORTED')
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(node, pseudo).content
        if (content && !['none', 'normal'].includes(content)) add('COPY_STYLE_UNSUPPORTED')
      }
    }
    // Typography pseudo-elements have their own paint/layout, outside our plain
    // text profile. Inspect CSSOM as well as computed styles (including nesting).
    const inspectRules = (rules) => {
      for (const rule of rules) {
        if (typeof rule.selectorText === 'string' && /::?first-(?:line|letter)/i.test(rule.selectorText)) add('COPY_STYLE_UNSUPPORTED')
        if (rule.cssRules) inspectRules(rule.cssRules)
      }
    }
    for (const sheet of document.styleSheets) inspectRules(sheet.cssRules)
    if (document.getAnimations().length) add('COPY_ANIMATION_UNSUPPORTED')
    for (const requirement of required) {
      const nodes = [...document.querySelectorAll('[data-storyboard-copy-id]')].filter(el => el.getAttribute('data-storyboard-copy-id') === requirement.clipId)
      if (nodes.length !== 1) {
        add('COPY_ELEMENT_MISSING')
        continue
      }
      const el = nodes[0]
      // Static R1 markers are plaintext. An empty positioned child can occlude
      // glyphs without changing textContent, so descendants cannot be approved.
      if (el.children.length) add('COPY_MARKUP_UNSUPPORTED')
      if (el.textContent !== requirement.text) {
        add('COPY_TEXT_MISMATCH')
        continue
      }
      // Strictly supported bundled Latin coverage. Other scripts need an embedded,
      // measured font contract; they are blocked, never rewritten or truncated.
      if (/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/u.test(requirement.text)) add('COPY_STYLE_UNSUPPORTED')
      if ([...requirement.text].some(c => c.codePointAt(0) > 0x024f && !/\s/u.test(c) && !/[\u2000-\u206f]/u.test(c))) add('COPY_GLYPH_UNVERIFIED')
      const baseStyle = getComputedStyle(el)
      const typography = ['color', 'webkitTextFillColor', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textTransform', 'letterSpacing', 'wordSpacing', 'visibility', 'textShadow']
      for (const pseudo of ['::first-line', '::first-letter']) {
        const styled = getComputedStyle(el, pseudo)
        if (typography.some(property => styled[property] !== baseStyle[property])) add('COPY_STYLE_UNSUPPORTED')
      }
      // Explicit opaque RGB contrast profile, independent of footage beneath it.
      const luminance = (color) => {
        const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color)
        if (!match) return null
        const values = match.slice(1).map(v => Number(v) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
      }
      const foreground = baseStyle.color
      const foregroundLuminance = luminance(foreground)
      let backing = null
      for (let a = el; a; a = a.parentElement) {
        const style = getComputedStyle(a)
        if (style.backgroundImage !== 'none' || style.backgroundClip !== 'border-box' || style.backgroundBlendMode !== 'normal') {
          add('COPY_CONTRAST_UNVERIFIED')
          break
        }
        if (style.backgroundColor === 'rgba(0, 0, 0, 0)') continue
        const backgroundLuminance = luminance(style.backgroundColor)
        if (foregroundLuminance !== null && backgroundLuminance !== null && (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05) >= 4.5 && ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].every(p => style[p] === '0px')) backing = a.getBoundingClientRect()
        break
      }
      if (baseStyle.textShadow !== 'none' && !(foreground === 'rgb(255, 255, 255)' && baseStyle.textShadow === 'rgb(0, 0, 0) 0px 2px 4px')) add('COPY_STYLE_UNSUPPORTED')
      if (!backing || baseStyle.webkitTextFillColor !== foreground || parseFloat(baseStyle.webkitTextStrokeWidth) !== 0) add('COPY_CONTRAST_UNVERIFIED')
      const all = [el, ...el.querySelectorAll('*')]
      for (const node of all) {
        const s = getComputedStyle(node)
        if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) < 0.99 || s.filter !== 'none' || s.clipPath !== 'none' || s.maskImage !== 'none' || s.mixBlendMode !== 'normal') add('COPY_HIDDEN')
        if (/rgba\([^)]*,\s*0(?:\.0+)?\)/.test(s.color) || s.color === 'transparent' || s.webkitTextFillColor === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\)/.test(s.webkitTextFillColor)) add('COPY_HIDDEN')
        if (/[\n\r\t]|\s{2,}|^\s|\s$/.test(requirement.text) && !['pre', 'pre-wrap', 'break-spaces'].includes(s.whiteSpace)) add('COPY_STYLE_UNSUPPORTED')
        // Only plain left-to-right typography is supported. Preserve source text;
        // unsupported shaping/spacing is a blocker, never silently normalized.
        if (s.direction !== 'ltr' || !['normal', 'isolate'].includes(s.unicodeBidi)
          || s.fontStyle !== 'normal' || s.fontVariant !== 'normal' || s.fontFeatureSettings !== 'normal' || s.fontVariationSettings !== 'normal'
          || !['normal', '0px'].includes(s.letterSpacing) || !['normal', '0px'].includes(s.wordSpacing)
          || s.textIndent !== '0px' || s.textDecorationLine !== 'none') add('COPY_STYLE_UNSUPPORTED')
        const family = s.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase()
        if (!['arial', 'liberation sans', 'sans-serif'].includes(family) || !document.fonts.check(`${s.fontSize} ${s.fontFamily}`, requirement.text)) add('COPY_FONT_UNAVAILABLE')
        if (s.textTransform !== 'none' || s.textOverflow === 'ellipsis' || (s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '') || s.writingMode !== 'horizontal-tb') add('COPY_STYLE_UNSUPPORTED')
      }
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
        const s = getComputedStyle(ancestor)
        if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) < 0.99 || s.filter !== 'none' || s.clipPath !== 'none' || s.maskImage !== 'none' || s.mixBlendMode !== 'normal') add('COPY_HIDDEN')
        if (s.clip !== 'auto' || !['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(s.transform) || s.zoom !== '1' || s.direction !== 'ltr' || !['normal', 'isolate'].includes(s.unicodeBidi)) add('COPY_STYLE_UNSUPPORTED')
        if (s.animationName !== 'none' || s.transitionDuration.split(',').some(x => parseFloat(x) > 0)) add('COPY_ANIMATION_UNSUPPORTED')
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
        for (let i = 0; i < textNode.textContent.length; i++) {
          if (/\s/.test(textNode.textContent[i])) continue
          const range = document.createRange()
          range.setStart(textNode, i)
          range.setEnd(textNode, i + 1)
          const rects = [...range.getClientRects()]
          if (!rects.length) {
            add('COPY_HIDDEN')
            continue
          }
          for (const r of rects) {
            if (!backing || r.left < backing.left || r.right > backing.right || r.top < backing.top || r.bottom > backing.bottom) add('COPY_CONTRAST_UNVERIFIED')
            if (r.width <= 0 || r.height <= 0 || r.left < 0 || r.top < 0 || r.right > width + 0.1 || r.bottom > height + 0.1) add('COPY_OVERFLOW')
            for (let a = textNode.parentElement; a; a = a.parentElement) {
              const st = getComputedStyle(a)
              const b = a.getBoundingClientRect()
              if ((['hidden', 'clip', 'scroll', 'auto'].includes(st.overflowX) && (r.left < b.left - 0.1 || r.right > b.right + 0.1))
                || (['hidden', 'clip', 'scroll', 'auto'].includes(st.overflowY) && (r.top < b.top - 0.1 || r.bottom > b.bottom + 0.1))) add('COPY_CLIPPED')
            }
            // Every glyph must own its visible area; pointer-events:none occluders
            // are also inspected geometrically below instead of trusting hit tests.
            for (const other of document.querySelectorAll('body *')) {
              if (other === el || el.contains(other) || other.contains(el)) continue
              const st = getComputedStyle(other), b = other.getBoundingClientRect()
              if (st.display === 'none' || st.visibility !== 'visible' || Number(st.opacity) === 0 || b.width === 0 || b.height === 0) continue
              if (b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) add('COPY_OVERLAP_UNVERIFIED')
            }
          }
        }
      }
    }
    return findings
  }, { required: input.required, width: input.width, height: input.height })
}
export async function measureStaticCopy(browser, input) {
  const page = await browser.newPage()
  try {
    return { findings: await prepareStaticCopyPage(page, input) }
  } finally {
    await page.close().catch(() => {})
  }
}
export async function serveCopyMeasurement(req, res) {
  let browser
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 600_000) throw new Error('Too large')
      chunks.push(chunk)
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    validateStaticCopy(input)
    const puppeteer = (await import('puppeteer-core')).default
    browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
    const result = await measureStaticCopy(browser, input)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(result))
  } catch {
    res.writeHead(422)
    res.end('Copy could not be measured')
  } finally {
    await browser?.close().catch(() => {})
  }
}
