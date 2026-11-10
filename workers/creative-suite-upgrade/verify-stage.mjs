import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const root = process.argv[2]
const load = name => JSON.parse(readFileSync(join(root, name), 'utf8'))
const sha = data => createHash('sha256').update(data).digest('hex')
const receipt = load('stage-receipt.json'), stored = load('stored-assets.json'), decoded = load('asset-sha256.json'), compressed = load('compressed.json')
if (receipt.inputs.length !== 6 || receipt.complete_ASSETS_inventory !== false || receipt.deployable_in_isolation !== false) throw Error('Receipt scope mismatch')
for (const [name, digest] of Object.entries(receipt.manifest_sha256)) if (sha(readFileSync(join(root, name))) !== digest) throw Error('Manifest mismatch')
const actual = []
function walk(path, relative='') {
 for (const name of readdirSync(path)) {
  const file = join(path,name), rel = relative + '/' + name, stat=lstatSync(file)
  if (stat.isSymbolicLink()) throw Error('Unexpected symlink')
  if (stat.isDirectory()) walk(file,rel)
  else actual.push(rel)
 }
}
walk(join(root,'public'))
if (JSON.stringify(actual.sort()) !== JSON.stringify(Object.keys(stored).sort())) throw Error('Stored file inventory mismatch')
const rows=[]
let maximum={path:null,bytes:0},total=0
for (const [url,item] of Object.entries(stored)) {
 const raw=readFileSync(join(root,'public',url)), bytes=item.encoding==='br'?brotliDecompressSync(raw):raw
 if (raw.length>=25*1024*1024 || raw.length!==item.bytes || sha(raw)!==item.sha256 || bytes.length!==item.decoded_bytes || sha(bytes)!==item.decoded_sha256 || decoded[item.decoded_url]!==sha(bytes)) throw Error('Stored/decoded bytes mismatch: '+url)
 if (item.encoding==='br') {
  if(compressed[item.decoded_url]!==url || actual.includes(item.decoded_url)) throw Error('Compression route mismatch')
  rows.push({path:url,encoded_bytes:raw.length,decoded_bytes:bytes.length,encoded_sha256:sha(raw),decoded_sha256:sha(bytes)})
 }
 total+=raw.length
 if(raw.length>maximum.bytes) maximum={path:url,bytes:raw.length}
}
process.stdout.write(JSON.stringify({status:'verified-unpublished-standalone-delta',engines:receipt.inputs.length,assets:actual.length,compressed_assets:rows,maximum_file:maximum,total_stored_bytes:total,manifest_sha256:receipt.manifest_sha256,stage_receipt_sha256:sha(readFileSync(join(root,'stage-receipt.json'))),node:process.version,brotli:process.versions.brotli,verification:'Read every actual public file, compare encoded hash/size, independently decompress and compare decoded hashes/sizes, exact inventory and route checks; no deployment',complete_ASSETS_inventory:false},null,2)+'\n')
