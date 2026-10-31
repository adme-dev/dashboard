// Diagnostics are restricted to fixed enums and numeric HTTP status. Never log
// URLs, request/response headers or bodies, credentials, or raw exception messages.
export function privateRpcErrorCategory(error) {
  const name = ['Error', 'TypeError', 'ReferenceError', 'AbortError', 'TimeoutError'].includes(error?.name) ? error.name : 'OtherError'
  const message = typeof error?.message === 'string' ? error.message : ''
  const category = name === 'TimeoutError' ? 'timeout'
    : name === 'AbortError' ? 'aborted'
      : /I\/O on behalf of a different request/i.test(message) ? 'cross_request_io'
        : /global scope|outside.*request|request context/i.test(message) ? 'request_context'
          : /illegal invocation/i.test(message) ? 'illegal_invocation'
            : /fetch is not defined/i.test(message) ? 'missing_fetch'
              : /1042/.test(message) ? 'cloudflare_1042'
                : 'other'
  return { name, category }
}

export function createPrivateMotorstackFetch(fetcher = (...args) => fetch(...args), report = event => console.info('[motorstack-rpc]', event)) {
  return async (...args) => {
    report({ stage: 'fetch_started' })
    try {
      const response = await fetcher(...args)
      report({ stage: 'fetch_response', status: response.status })
      return response
    } catch (error) {
      report({ stage: 'fetch_failed', ...privateRpcErrorCategory(error) })
      throw error
    }
  }
}

// Private service-binding adapter. No HTTP route, arbitrary URL, or tool forwarding.
export function createBrandService({ rpc, binary, catalog, safeURL, extension, MIME, idFor, boundedBody, AdapterError, fetcher = (...args) => fetch(...args) }, env) {
  const fail = (status, code) => { throw new AdapterError(status, code) }
  const key = env?.MOTORSTACK_API_KEY
  const configured = () => {
    if (typeof key !== 'string' || !/^msk_[A-Za-z0-9_-]{20,150}$/.test(key)) fail(503, 'motorstack_not_configured')
  }
  const clean = (value, max = 180) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f]/.test(value) && !value.includes(key) ? value : ''
  const slug = value => {
    if (typeof value !== 'string' || !/^[a-z0-9-]{1,40}$/.test(value)) fail(400, 'invalid_brand_id')
    return value
  }
  async function listBrands() {
    configured()
    const data = await rpc(key, 'list_oems', {})
    if (!Array.isArray(data.oems) || data.oems.length > 1000) fail(502, 'invalid_brand_catalog')
    const brands = [], seen = new Set()
    for (const item of data.oems) {
      if (!item || typeof item.oem !== 'string' || !/^[a-z0-9-]{1,40}$/.test(item.oem) || !clean(item.name) || seen.has(item.oem)) fail(502, 'invalid_brand_catalog')
      seen.add(item.oem)
      brands.push({ id: item.oem, name: item.name })
    }
    return { schemaVersion: 1, brands }
  }
  async function detail(brandId) {
    slug(brandId)
    const { brands } = await listBrands()
    const brand = brands.find(item => item.id === brandId)
    if (!brand) fail(403, 'brand_not_available')
    const data = await rpc(key, 'get_brand_assets', { oem: brandId })
    if ((data.oem && data.oem !== brandId) || !data || typeof data !== 'object' || Array.isArray(data)) fail(502, 'invalid_brand_assets')
    const logosSource = data.logos ?? [], fontsSource = data.fonts ?? {}, colorsSource = data.colours ?? {}
    if (!Array.isArray(logosSource) || logosSource.length > 100 || typeof fontsSource !== 'object' || !fontsSource || Array.isArray(fontsSource) || Object.keys(fontsSource).length > 100 || typeof colorsSource !== 'object' || !colorsSource || Array.isArray(colorsSource) || Object.keys(colorsSource).length > 100) fail(502, 'invalid_brand_assets')
    const originals = new Map(), logos = [], fonts = [], colors = [], warnings = []
    async function asset(value, name, type) {
      const url = safeURL(value)
      const ext = url && (extension(url.href) || (/\.ico$/i.test(url.pathname) ? 'ico' : null))
      const mime = ext === 'ico' ? 'image/x-icon' : ext && MIME[ext]
      if (!url || url.href.includes(key) || !mime || !(type === 'font' ? mime.startsWith('font/') : mime.startsWith('image/'))) return null
      const id = await idFor(brandId + '\n' + url.href)
      if (!originals.has(id)) originals.set(id, { id, name, type, mime, original: url.href })
      return originals.get(id)
    }
    for (const logo of logosSource) {
      if (!logo || typeof logo !== 'object' || Array.isArray(logo)) fail(502, 'invalid_brand_assets')
      const role = clean(logo.role), variant = clean(logo.variant), file = clean(logo.file, 255) || null
      const name = file || `${brand.name} ${role || variant || 'logo'}`
      const item = await asset(logo.url, name, 'image')
      logos.push({ assetId: item?.id ?? null, role, variant, name, file, mime: item?.mime ?? null, onDark: typeof logo.on_dark === 'boolean' ? logo.on_dark : null })
      if (!item) warnings.push(`Logo ${role || variant || 'unknown'} has no supported downloadable file.`)
    }
    for (const [sourceRole, font] of Object.entries(fontsSource)) {
      const role = clean(sourceRole)
      if (!role || !font || typeof font !== 'object' || Array.isArray(font)) fail(502, 'invalid_brand_assets')
      const family = clean(font.family), file = clean(font.file, 255) || null
      const sourceWeight = typeof font.weight === 'number' && Number.isFinite(font.weight) ? font.weight : typeof font.weight === 'string' ? clean(font.weight, 40) || null : null
      const number = typeof sourceWeight === 'number' || (typeof sourceWeight === 'string' && /^\d{1,4}$/.test(sourceWeight)) ? Number(sourceWeight) : NaN
      const weight = Number.isInteger(number) && number >= 1 && number <= 1000 ? number : null
      const item = await asset(font.url, file || `${family || brand.name} ${role}`, 'font')
      fonts.push({ role, family, file, weight, sourceWeight, assetId: item?.id ?? null })
      if (!item) warnings.push(`Font role ${role} has no supported downloadable file.`)
      if (!weight) warnings.push(`Font role ${role} has no supported numeric source weight.`)
    }
    for (const [sourceName, value] of Object.entries(colorsSource)) {
      const name = clean(sourceName)
      if (name && typeof value === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) colors.push({ name, value })
      else warnings.push('An unsupported source colour was omitted.')
    }
    return { public: { schemaVersion: 1, brand, logos, fonts, colors, assets: [...originals.values()].map(({ original, ...item }) => item), warnings }, originals }
  }
  async function getBrandKit(brandId) { return (await detail(brandId)).public }
  async function getBrandAsset(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['brandId', 'assetId'].includes(key)) || typeof input.assetId !== 'string' || !/^[a-f0-9]{64}$/.test(input.assetId)) fail(400, 'invalid_asset_id')
    const { originals } = await detail(input.brandId)
    const item = originals.get(input.assetId)
    if (!item) fail(404, 'asset_not_found')
    return item.mime === 'image/x-icon' ? iconBinary(item) : binary(key, item)
  }
  function mediaInput(input, withAsset = false) {
    const fields = withAsset ? ['brandId', 'model', 'assetId'] : ['brandId', 'model']
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(field => !fields.includes(field))) fail(400, 'invalid_media_query')
    slug(input.brandId)
    if (Object.hasOwn(input, 'model') && (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 100 || /[\u0000-\u001f\u007f]/.test(input.model))) fail(400, 'invalid_media_query')
    if (withAsset && (typeof input.assetId !== 'string' || !/^[a-f0-9]{64}$/.test(input.assetId))) fail(400, 'invalid_asset_id')
    configured()
    if (input.model?.includes(key)) fail(400, 'invalid_media_query')
    return { brandId: input.brandId, model: input.model ?? '' }
  }
  async function listMedia(input) {
    const { brandId, model } = mediaInput(input)
    const data = await catalog(key, brandId, 'media', model)
    return {
      schemaVersion: 1,
      brand: { id: data.brand.id, name: clean(data.brand.name) || data.brand.id },
      assets: data.assets.map(item => ({ id: item.id, name: clean(item.name) || 'MotorStack asset', type: item.type, mime: item.mime, importable: item.importable })),
      models: data.models.map(value => clean(value, 100)).filter(Boolean),
      warnings: data.warnings.map(value => clean(value)).filter(Boolean)
    }
  }
  async function getMediaAsset(input) {
    const { brandId, model } = mediaInput(input, true)
    // Rebind the opaque asset ID to this currently available brand/model catalog.
    // Never accept a caller URL or reuse a differently scoped catalog result.
    const data = await catalog(key, brandId, 'media', model)
    const item = data.assets.find(asset => asset.id === input.assetId)
    if (!item) fail(404, 'asset_not_found')
    return binary(key, item)
  }
  // ICO support is private to this new adapter; the existing HTTP catalog is unchanged.
  async function iconBinary(item) {
    let url = safeURL(item.original)
    for (let hop = 0; hop <= 3; hop++) {
      if (!url || url.href.includes(key)) fail(502, 'asset_host_not_supported')
      const res = await fetcher(url.href, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Accept: 'image/x-icon, image/vnd.microsoft.icon', 'User-Agent': 'XeroFlow-Creative/1.0', ...(url.origin === 'https://oem-variants.pages.dev' ? { Authorization: 'Bearer ' + key } : {}) } })
      if ([301,302,303,307,308].includes(res.status)) {
        const location = res.headers.get('Location')
        if (!location || hop === 3) fail(502, 'asset_redirect_refused')
        url = safeURL(new URL(location, url).href)
        continue
      }
      if (res.status === 404 || res.status === 410) fail(404, 'asset_not_found')
      if (!res.ok) fail(502, 'asset_unavailable')
      const mime = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
      if (!['image/x-icon', 'image/vnd.microsoft.icon'].includes(mime)) fail(502, 'asset_type_refused')
      const bytes = await boundedBody(res, 2 * 1024 * 1024)
      return new Response(bytes, { headers: { 'Content-Type': 'image/x-icon', 'Content-Length': String(bytes.length), 'Content-Disposition': 'attachment; filename="favicon.ico"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer' } })
    }
    fail(502, 'asset_redirect_refused')
  }
  // Sanitize all unexpected failures crossing the RPC boundary.
  const guarded = operation => async (...args) => {
    try { return await operation(...args) }
    catch (error) {
      if (!(error instanceof AdapterError)) console.info('[motorstack-rpc]', { stage: 'helper_failed', ...privateRpcErrorCategory(error) })
      throw new Error(error instanceof AdapterError ? error.code : 'motorstack_unavailable')
    }
  }
  return { listBrands: guarded(listBrands), getBrandKit: guarded(getBrandKit), getBrandAsset: guarded(getBrandAsset), listMedia: guarded(listMedia), getMediaAsset: guarded(getMediaAsset) }
}
