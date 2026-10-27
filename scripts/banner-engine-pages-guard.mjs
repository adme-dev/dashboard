import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const entrySuffix = '/nitropack/dist/presets/cloudflare/runtime/cloudflare-pages.mjs'
const reviewedSha256 = '63767bf521317b7224e0105f9259e3bb901b276aeed50e0465cba6c041c9ee49'
const guardPath = fileURLToPath(new URL('../server/runtime/banner-engine-pages-guard.ts', import.meta.url))
const dissectionGuardPath = fileURLToPath(new URL('../server/runtime/banner-dissection-pages-guard.ts', import.meta.url))
const changed = () => new Error('[banner-engine-pages] Reviewed Pages entry changed or guard placement missing; review the entry guard before building')

/** Pin the reviewed runtime, not node_modules. Upgrades require explicit review. */
export function bannerEnginePagesGuardPlugin() {
  let transformed = false
  let localEntry = false
  return {
    name: 'xeroflow-banner-engine-pages-guard',
    options(options) {
      const inputs = typeof options.input === 'string'
        ? [options.input]
        : Array.isArray(options.input) ? options.input : Object.values(options.input ?? {})
      // The same Nuxt rollup options are inherited by Nitro prerender/dev. Only
      // these explicit non-deployable entries may omit the Pages guard.
      localEntry = inputs.length === 1 && /\/nitropack\/dist\/presets\/_nitro\/runtime\/(?:nitro-dev|nitro-prerenderer)(?:\.mjs)?$/.test(inputs[0].replaceAll('\\', '/'))
    },
    buildStart() { transformed = false },
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith(entrySuffix)) return null
      if (createHash('sha256').update(source).digest('hex') !== reviewedSha256) throw changed()
      const replacements = [
        ['  async fetch(request, env, context) {', `  async fetch(request, env, context) {
    const platformRequest = request;
    const guardedRequest = await guardBannerEnginePagesRequest(request, env);
    if (guardedRequest instanceof Response) return guardedRequest;
    request = guardedRequest;
    const boundedUpload = await guardBannerDissectionPagesRequest(request);
    if (boundedUpload instanceof Response) return boundedUpload;
    request = boundedUpload;`],
        ['cf: request.cf,', 'cf: platformRequest.cf,'],
        ['cloudflare: {\n            request,', 'cloudflare: {\n            request: platformRequest,']
      ]
      let code = source
      for (const [before, after] of replacements) {
        if (code.split(before).length !== 2) throw changed()
        code = code.replace(before, after)
      }
      code = `import { guardBannerEnginePagesRequest } from ${JSON.stringify(guardPath)};\nimport { guardBannerDissectionPagesRequest } from ${JSON.stringify(dissectionGuardPath)};\n${code}`
      for (const guard of ['guardBannerEnginePagesRequest', 'guardBannerDissectionPagesRequest']) {
        if (code.indexOf(`await ${guard}`) > code.indexOf('await request.arrayBuffer()')) throw changed()
      }
      transformed = true
      return { code, map: null }
    },
    generateBundle() {
      if (!localEntry && !transformed) throw changed()
    }
  }
}
