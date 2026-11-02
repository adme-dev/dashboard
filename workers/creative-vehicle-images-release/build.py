"""Build vehicle image fixes onto the verified offer-artwork Creative Worker."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'creative-offer-artwork-release' / 'build.py'
SPEC = importlib.util.spec_from_file_location('offer_artwork_release', SOURCE)
offer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(offer)
BASE_HASHES = {
    'worker.js': '43c5ec9662c127185de0f0b4ed7cd6cca667e85b53e8aa98e44d32b581575dd0',
    'brand-rpc.mjs': '3e299b879319fbedfb990604716483cfcaceb82b814df33f4413643234f68b16',
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def replace_one(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError('Vehicle image patch anchor changed')
    return source.replace(before, after)


def build():
    offer.build()
    base = {name: (SOURCE.parent / 'dist' / name).read_bytes() for name in BASE_HASHES}
    if {name: digest(body) for name, body in base.items()} != BASE_HASHES:
        raise RuntimeError('Offer artwork Worker source changed')
    worker = base['worker.js'].decode()
    worker = replace_one(worker,
        '''      {
        try {
          const variants = await rpc(key, "get_variants", { oem: brand, ...model ? { model } : {}, include_photos: Boolean(model) });''',
        '''      // The all-model library already provides model heroes. Fetch colour photos only
      // for the selected model; the full catalogue is large and can time out.
      if (model) {
        try {
          const variants = await rpc(key, "get_variants", { oem: brand, model, include_photos: true });''')
    worker = replace_one(worker,
        '''// Private RPC only; the default HTTP handler above remains unchanged.
export class MotorstackBrandAssets extends WorkerEntrypoint {''',
        '''// Keep only validated plain catalogue data, scoped to this Worker's credential.
// The first list request warms the cache used by its image previews.
const mediaCatalogCache = new Map();
let mediaCatalogCredential;
function cachedMediaCatalog(catalog, credential) {
  if (credential !== mediaCatalogCredential) {
    mediaCatalogCache.clear();
    mediaCatalogCredential = credential;
  }
  return async (key, brand, kind, model) => {
    if (kind !== "media") return catalog(key, brand, kind, model);
    const scope = JSON.stringify([credential, brand, model]);
    const hit = mediaCatalogCache.get(scope);
    if (hit && hit.expires > Date.now()) return hit.data;
    const data = await catalog(key, brand, kind, model);
    mediaCatalogCache.delete(scope);
    mediaCatalogCache.set(scope, { data, expires: Date.now() + 60_000 });
    if (mediaCatalogCache.size > 20) mediaCatalogCache.delete(mediaCatalogCache.keys().next().value);
    return data;
  };
}

// Private RPC only; the default HTTP handler above remains unchanged.
export class MotorstackBrandAssets extends WorkerEntrypoint {''')
    worker = replace_one(worker,
        'return createBrandService({ rpc, binary, catalog, safeURL, extension, MIME, idFor, boundedBody, AdapterError, fetcher }, this.env);',
        'return createBrandService({ rpc, binary, catalog: cachedMediaCatalog(catalog, this.env.MOTORSTACK_API_KEY), safeURL, extension, MIME, idFor, boundedBody, AdapterError, fetcher }, this.env);')
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    candidate = {'worker.js': worker.encode(), 'brand-rpc.mjs': base['brand-rpc.mjs']}
    for name, body in candidate.items():
        (output / name).write_bytes(body)
    manifest = {'baseHashes': BASE_HASHES, 'moduleHashes': {name: digest(body) for name, body in candidate.items()}}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    print(json.dumps(build(), indent=2))
