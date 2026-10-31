import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
const source = readFileSync(root + 'source/worker.js', 'utf8')
const sha = value => createHash('sha256').update(value).digest('hex')
const baseModules = {
  'worker.js': '1461ce3b66e6b9914c75dd3fece63023b0d81d578f3c5844966095c106595080',
  'brand-rpc.mjs': 'da1fbfb349ece1e5854d7064486a551c067af9bcfaef9ec5e4824186ad79fc57'
}
for (const [name, hash] of Object.entries(baseModules)) {
  if (sha(readFileSync(root + 'source/' + name)) !== hash) throw new Error('Verified current Worker source hash mismatch: ' + name)
}
const changes = [
  ['import { createBrandService } from "./brand-rpc.mjs";', 'import { createBrandService, createPrivateMotorstackFetch } from "./brand-rpc.mjs";'],
  ['    const { rpc, binary } = createMotorstack();\n    return createBrandService({ rpc, binary, safeURL, extension, MIME, idFor, boundedBody, AdapterError }, this.env);', '    const fetcher = createPrivateMotorstackFetch();\n    const { rpc, binary } = createMotorstack({ fetcher });\n    return createBrandService({ rpc, binary, safeURL, extension, MIME, idFor, boundedBody, AdapterError, fetcher }, this.env);']
]
let worker = source
for (const [before, after] of changes) {
  if (worker.split(before).length !== 2) throw new Error('Private diagnostic patch anchor mismatch')
  worker = worker.replace(before, after)
}
mkdirSync(root + 'dist', { recursive: true })
writeFileSync(root + 'dist/worker.js', worker)
const helper = readFileSync(root + 'brand-rpc.mjs')
writeFileSync(root + 'dist/brand-rpc.mjs', helper)
writeFileSync(root + 'dist/manifest.json', JSON.stringify({ account: 'a5b299b3ad15c1b5b895dc66f9357b17', script: 'xeroflow-creative-tools', baseVersion: '5ed78b26-e678-48c2-9617-bef4304dd199', baseDeployment: '3219f175-ee7d-41f8-b3e9-520c2ec0b3d2', baseSha256: baseModules['worker.js'], baseModules, modules: { 'worker.js': sha(worker), 'brand-rpc.mjs': sha(helper) } }, null, 2) + '\n')
console.log('Built current-source Worker candidate; no upload or deployment.')
