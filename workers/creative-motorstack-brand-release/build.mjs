import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
const source = readFileSync(root + 'source/worker.js', 'utf8')
const sha = value => createHash('sha256').update(value).digest('hex')
const expected = '845b46f54c8a7584827a83b10e903b4f5035b4368d38460b4352d84fd7cdfe4f'
if (sha(source) !== expected) throw new Error('Verified current Worker source hash mismatch')
const anchor = '  return { handleMotorstack: handleMotorstack2 };'
if (source.split(anchor).length !== 2) throw new Error('MotorStack adapter anchor mismatch')
const prefix = 'import { WorkerEntrypoint } from "cloudflare:workers";\nimport { createBrandService } from "./brand-rpc.mjs";\n'
const suffix = `\n// Private RPC only; the default HTTP handler above remains unchanged.\nexport class MotorstackBrandAssets extends WorkerEntrypoint {\n  #service() {\n    const { rpc, binary } = createMotorstack();\n    return createBrandService({ rpc, binary, safeURL, extension, MIME, idFor, boundedBody, AdapterError }, this.env);\n  }\n  listBrands() { return this.#service().listBrands(); }\n  getBrandKit(brandId) { return this.#service().getBrandKit(brandId); }\n  getBrandAsset(input) { return this.#service().getBrandAsset(input); }\n}\n`
const worker = prefix + source.replace(anchor, '  return { handleMotorstack: handleMotorstack2, rpc, binary };') + suffix
mkdirSync(root + 'dist', { recursive: true })
writeFileSync(root + 'dist/worker.js', worker)
const helper = readFileSync(root + 'brand-rpc.mjs')
writeFileSync(root + 'dist/brand-rpc.mjs', helper)
writeFileSync(root + 'dist/manifest.json', JSON.stringify({ account: 'a5b299b3ad15c1b5b895dc66f9357b17', script: 'xeroflow-creative-tools', baseVersion: '4ac68720-79ab-450a-a38f-6a5c81294269', baseDeployment: '0ddd8bf0-96c3-4855-94fd-c2e85e9bf6f1', baseSha256: expected, modules: { 'worker.js': sha(worker), 'brand-rpc.mjs': sha(helper) } }, null, 2) + '\n')
console.log('Built current-source Worker candidate; no upload or deployment.')
