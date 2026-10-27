// Local proof entrypoint only; never part of the deployed Worker.
import puppeteer from '../../../workers/banner-renderer/node_modules/@cloudflare/puppeteer/lib/esm/puppeteer/puppeteer-cloudflare.js'
import { handleBannerRender } from '../../../workers/banner-renderer/src/render'

export default {
  async fetch(request: Request, env: { CHROME: Fetcher, RESOURCES: Fetcher }) {
    const result = await handleBannerRender(await request.json(), {
      environment: 'production', appOrigins: '["https://app.xeroflow.io"]', assetOrigins: '[]'
    }, {
      launch: async () => {
        const browser = await puppeteer.connect(env.CHROME, 'local')
        browser.close = async () => {
          await browser.disconnect()
        }
        return browser
      },
      fetchResource: (input, init) => env.RESOURCES.fetch(input, init)
    })
    if (!result.ok) return Response.json(result, { status: 500 })
    return new Response(new Uint8Array(result.value.items[0].bytes).buffer, {
      headers: { 'content-type': 'image/gif' }
    })
  }
}
