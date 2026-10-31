const assert = (condition, message) => { if (!condition) throw new Error(message) }
export default {
  async test(_controller, env) {
    const rpc = env.MOTORSTACK_BRAND_ASSETS
    const brands = await rpc.listBrands()
    assert(brands.brands.length === 1 && brands.brands[0].id === 'ford', 'Named entrypoint listBrands failed')
    const kit = await rpc.getBrandKit('ford')
    assert(kit.fonts[0].weight === 700 && kit.fonts[0].file === 'FordBold-400.woff2', 'Exact source weight/file lost across RPC')
    const file = await rpc.getBrandAsset({brandId:'ford',assetId:kit.fonts[0].assetId})
    assert(file instanceof Response, 'RPC must serialize Response')
    assert(file.headers.get('Content-Type') === 'font/woff2', 'RPC MIME lost')
    assert(file.headers.get('Cache-Control') === 'private, no-store', 'RPC privacy headers lost')
    assert([...new Uint8Array(await file.arrayBuffer())].join(',') === '119,79,70,50', 'RPC binary stream changed')
    const media = await rpc.listMedia({brandId:'ford',model:'Ranger'})
    assert(media.assets.length === 1 && media.models[0] === 'Ranger', 'Media metadata lost across RPC')
    assert(!JSON.stringify(media).includes('https://'), 'Media RPC exposed provider URL')
    const image = await rpc.getMediaAsset({brandId:'ford',model:'Ranger',assetId:media.assets[0].id})
    assert(image instanceof Response && image.headers.get('Content-Type') === 'image/png', 'Media Response lost across RPC')
    assert([...new Uint8Array(await image.arrayBuffer())].join(',') === '137,80,78,71', 'Media Response bytes changed')
    const variants = await rpc.listCreativeCatalog({brandId:'ford',kind:'variants'})
    assert(variants.items[0].title === 'Ranger XLT' && variants.items[0].egcPrice === 59990, 'Variant catalogue lost across RPC')
    const offers = await rpc.listCreativeCatalog({brandId:'ford',kind:'offers'})
    assert(offers.items[0].disclaimer === 'Terms apply.' && offers.items[0].endDate === '2026-11-30', 'Offer terms lost across RPC')
    let denied = false
    try { await rpc.getBrandKit('missing') } catch (error) { denied = error.message.includes('brand_not_available') }
    assert(denied, 'RPC denied-brand error did not survive')
    let noPrivateMethod = false
    try { await rpc.service() } catch { noPrivateMethod = true }
    assert(noPrivateMethod, 'Private service helper was exposed')
  }
}
