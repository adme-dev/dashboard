// Server-only read adapter. The calling Worker must authorize every /__assets/ request first.
const ORIGIN = 'https://oem-variants.pages.dev'
const R2_HOST = 'pub-150d4c02365b4ffe9e158d72b3b048a1.r2.dev'
const PREFIX = '/__assets/motorstack/'
const UA = 'Mozilla/5.0 XeroFlow-Creative/1.0'
const JSON_LIMIT = 4 * 1024 * 1024
const FILE_LIMIT = 32 * 1024 * 1024
const KINDS = new Set(['all', 'slides', 'media', 'brand'])
const MIME = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' })
class AdapterError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
function response(status, data, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...extra } })
}
function text(value, max = 180) { return typeof value === 'string' ? value.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, max) : '' }
function safeURL(value) {
  try {
    if (typeof value !== 'string' || value.length > 2048) return null
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || ![new URL(ORIGIN).hostname, R2_HOST].includes(url.hostname)) return null
    if (url.origin === ORIGIN && !/^\/(?:api\/(?:logos|fonts)\/|r2\/)/.test(url.pathname)) return null
    for (const key of [...url.searchParams.keys()]) if (/key|token|auth|secret/i.test(key)) url.searchParams.delete(key)
    url.hash = ''
    return url
  } catch { return null }
}
async function boundedBody(res, limit) {
  if (!res.body || Number(res.headers.get('Content-Length')) > limit) throw new AdapterError(502, 'provider_response_too_large')
  const reader = res.body.getReader(); const chunks = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new AdapterError(502, 'provider_response_too_large')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
function extension(url) {
  try {
    const value = decodeURIComponent(new URL(url).pathname).split('/').pop().split('.').pop().toLowerCase()
    return Object.hasOwn(MIME, value) ? value : null
  } catch { return null }
}
async function idFor(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
}
export function createMotorstack({ fetcher = (...args) => fetch(...args) } = {}) {
  async function rpc(key, name, args) {
    // No arbitrary tool dispatch, even if future MCP schemas add mutation tools.
    if (!['list_oems', 'get_webslides', 'get_media_library', 'get_brand_assets', 'get_variants'].includes(name)) throw new AdapterError(400, 'tool_not_supported')
    let res
    try {
      res = await fetcher(ORIGIN + '/api/mcp', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })
    } catch { throw new AdapterError(502, 'motorstack_unavailable') }
    if (!res.ok) throw new AdapterError(res.status === 401 || res.status === 403 ? 503 : 502, 'motorstack_unavailable')
    try {
      const envelope = JSON.parse(new TextDecoder().decode(await boundedBody(res, JSON_LIMIT)))
      if (envelope.error || envelope.result?.isError) throw new Error('RPC refused')
      const result = envelope.result
      const data = result?.structuredContent ?? JSON.parse(result?.content?.find(x => x.type === 'text')?.text || 'null')
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response')
      return data
    } catch (error) {
      if (error instanceof AdapterError) throw error
      throw new AdapterError(502, 'invalid_motorstack_response')
    }
  }
  async function brands(key) {
    const data = await rpc(key, 'list_oems', {})
    if (!Array.isArray(data.oems)) throw new AdapterError(502, 'invalid_motorstack_response')
    return data.oems.filter(x => /^[a-z0-9-]{1,40}$/.test(x?.oem || '') && typeof x.name === 'string').map(x => ({ id: x.oem, name: text(x.name) })).slice(0, 100)
  }
  async function catalog(key, brand, kind, model) {
    const allowed = await brands(key)
    const owner = allowed.find(x => x.id === brand)
    if (!owner) throw new AdapterError(403, 'brand_not_available')
    const assets = []; const seen = new Set(); const colors = []; const fonts = []; const models = []; const warnings = []
    async function add(value, label, source, declaredType = '') {
      const url = safeURL(value)
      if (!url || url.href.includes(key) || assets.length >= 500) return
      const ext = extension(url.href)
      if (!ext || seen.has(url.href)) return
      seen.add(url.href)
      const mime = MIME[ext]
      const type = declaredType || (mime.startsWith('image/') ? 'image' : mime.startsWith('font/') ? 'font' : 'document')
      const id = await idFor(brand + '\n' + url.href)
      assets.push({ id, name: text(label || decodeURIComponent(url.pathname.split('/').pop())), type, mime, source, importable: mime.startsWith('image/') && mime !== 'image/svg+xml', original: url.href })
    }
    if (kind === 'all' || kind === 'slides') {
      const data = await rpc(key, 'get_webslides', { oem: brand })
      for (const [i, slide] of (Array.isArray(data.slides) ? data.slides : []).entries()) {
        const label = text(slide.heading || slide.model || 'Webslide ' + (i + 1))
        for (const [field, suffix] of [['desktop_url', 'desktop'], ['mobile_url', 'mobile'], ['combined_desktop_url', 'desktop combined'], ['combined_mobile_url', 'mobile combined'], ['overlay_url', 'overlay']]) await add(slide[field], label + ' · ' + suffix, 'Motorstack webslides')
      }
    }
    if (kind === 'all' || kind === 'media') {
      const data = await rpc(key, 'get_media_library', { oem: brand, ...(model ? { model } : {}) })
      for (const item of Array.isArray(data.brochures) ? data.brochures : []) await add(item.url, item.title || item.model, 'Motorstack brochures', 'document')
      // Provider media is structured data; only image-bearing fields are harvested, never CTA links.
      async function visit(node, label = model || owner.name, depth = 0) {
        if (!node || depth > 12) return
        if (Array.isArray(node)) { for (const item of node.slice(0, 500)) await visit(item, label, depth + 1); return }
        if (typeof node !== 'object') return
        const own = text(node.title || node.model || node.colour || node.color || node.name || node.badge || '')
        const name = own && own !== label ? text(label + ' · ' + own) : own || label
        if (typeof node.model === 'string' && !models.includes(node.model)) models.push(text(node.model))
        for (const [field, value] of Object.entries(node)) {
          if (typeof value === 'string' && /^(?:heroImage|hero_image|hero_url|main_photo_url|image|image_url|url|desktop_url|mobile_url)$/.test(field)) {
            const safe = safeURL(value); const ext = safe ? extension(safe.href) : null
            if (ext && MIME[ext].startsWith('image/')) await add(value, name, 'Motorstack media')
          } else if (Array.isArray(value) && /gallery|interior|photos|images/i.test(field)) {
            for (const [i, item] of value.slice(0, 100).entries()) {
              if (typeof item === 'string') await add(item, name + ' · ' + field + ' ' + (i + 1), 'Motorstack media')
              else await visit(item, name, depth + 1)
            }
          } else if (value && typeof value === 'object' && field !== 'brochures') await visit(value, name, depth + 1)
        }
      }
      await visit(data.models || data)
      if (model) {
        // Full-gallery output can exceed the provider's own text cap; colour heroes stay bounded.
        try {
          const variants = await rpc(key, 'get_variants', { oem: brand, model, include_photos: false })
          await visit(variants.vehicles || [])
        } catch { warnings.push('Some model colour images are temporarily unavailable.') }
      }
    }
    if (kind === 'all' || kind === 'brand') {
      const data = await rpc(key, 'get_brand_assets', { oem: brand })
      for (const logo of Array.isArray(data.logos) ? data.logos : []) await add(logo.url, owner.name + ' · ' + (logo.variant || logo.role || 'logo'), 'Motorstack brand assets')
      for (const [role, font] of Object.entries(data.fonts || {})) {
        if (!font || typeof font !== 'object') continue
        await add(font.url, text(font.family || owner.name) + ' · ' + role + (font.weight ? ' ' + Number(font.weight) : ''), 'Motorstack brand fonts', 'font')
        fonts.push({ role: text(role), family: text(font.family), weight: Number.isFinite(Number(font.weight)) ? Number(font.weight) : null })
      }
      for (const [name, value] of Object.entries(data.colours || {})) if (typeof value === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) colors.push({ name: text(name), value })
    }
    return { brand: owner, assets, colors, fonts, models: models.slice(0, 100), warnings }
  }
  function project(data, brand, kind, model) {
    return { ...data, assets: data.assets.map(({ original, ...asset }) => {
      const params = new URLSearchParams({ brand, kind, id: asset.id }); if (model) params.set('model', model)
      const url = PREFIX + 'file?' + params
      return { ...asset, url, thumbnail: asset.type === 'image' && asset.mime !== 'image/svg+xml' ? url : null }
    }) }
  }
  async function binary(key, asset) {
    let url = safeURL(asset.original)
    for (let hop = 0; hop <= 3; hop++) {
      if (!url || url.href.includes(key)) throw new AdapterError(502, 'asset_host_not_supported')
      let res
      try {
        res = await fetcher(url.href, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Accept: asset.mime, 'User-Agent': UA, ...(url.origin === ORIGIN ? { Authorization: 'Bearer ' + key } : {}) } })
      } catch { throw new AdapterError(502, 'asset_unavailable') }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('Location')
        if (!location || hop === 3) throw new AdapterError(502, 'asset_redirect_refused')
        url = safeURL(new URL(location, url).href); continue
      }
      if (!res.ok) throw new AdapterError(502, 'asset_unavailable')
      const mime = (res.headers.get('Content-Type') || '').split(';')[0].toLowerCase().trim()
      if (!Object.values(MIME).includes(mime) || mime !== asset.mime) throw new AdapterError(502, 'asset_type_refused')
      const bytes = await boundedBody(res, FILE_LIMIT)
      const ext = extension(url.href) || Object.keys(MIME).find(k => MIME[k] === mime) || 'bin'
      const name = (asset.name.replace(/[^\p{L}\p{N} ._-]/gu, '-').trim().slice(0, 100) || 'Motorstack asset') + '.' + ext
      // Even SVG and PDF are attachments, never executable same-origin documents.
      return new Response(bytes, { headers: { 'Content-Type': mime, 'Content-Length': String(bytes.length), 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer' } })
    }
    throw new AdapterError(502, 'asset_redirect_refused')
  }
  async function handleMotorstack(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(PREFIX)) return null
    if (request.method !== 'GET') return response(405, { error: 'method_not_allowed' }, { Allow: 'GET' })
    const key = env?.MOTORSTACK_API_KEY
    if (typeof key !== 'string' || !/^msk_[A-Za-z0-9_-]{20,150}$/.test(key)) return response(503, { error: 'motorstack_not_configured' })
    try {
      if (url.searchParams.has('url') || url.searchParams.has('key') || url.searchParams.has('tool')) throw new AdapterError(400, 'invalid_asset_query')
      if (url.pathname === PREFIX + 'brands') return response(200, { brands: await brands(key) })
      if (![PREFIX + 'catalog', PREFIX + 'file'].includes(url.pathname)) return response(404, { error: 'not_found' })
      const brand = url.searchParams.get('brand') || ''; const kind = url.searchParams.get('kind') || 'all'; const model = url.searchParams.get('model') || ''
      if (!/^[a-z0-9-]{1,40}$/.test(brand) || !KINDS.has(kind) || model.length > 100 || /[\r\n\u0000]/.test(model)) throw new AdapterError(400, 'invalid_asset_query')
      const id = url.searchParams.get('id') || ''
      if (url.pathname === PREFIX + 'file' && !/^[a-f0-9]{64}$/.test(id)) throw new AdapterError(400, 'invalid_asset_id')
      const data = await catalog(key, brand, kind, model)
      if (url.pathname === PREFIX + 'catalog') return response(200, project(data, brand, kind, model))
      const asset = data.assets.find(x => x.id === id)
      if (!asset) throw new AdapterError(404, 'asset_not_found')
      return await binary(key, asset)
    } catch (error) { return response(error instanceof AdapterError ? error.status : 502, { error: error instanceof AdapterError ? error.code : 'motorstack_unavailable' }) }
  }
  return { handleMotorstack }
}
export const handleMotorstack = createMotorstack().handleMotorstack
