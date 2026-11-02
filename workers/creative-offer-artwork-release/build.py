"""Build an offer-artwork candidate from the current FigFlow creative gateway."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
SPEC = importlib.util.spec_from_file_location('creative_gateway', ROOT.parent / 'figflow-edm-assets' / 'creative-release.py')
gateway = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gateway)
BASE_HASHES = {
    'worker.js': 'fb9a7ef93b7fba62c8c9d1eaf6837baa4a32aa0c5aba73ad7d939eb8d13a3fb7',
    'brand-rpc.mjs': '53bd8cd96907d296fe95cd9f8bb4999152277b65ade0eed36e932f825f15e754',
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def replace_one(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError('Current creative gateway patch anchor changed')
    return source.replace(before, after)


def build():
    modules = gateway.candidate()
    if {name: digest(body) for name, body in modules.items()} != BASE_HASHES:
        raise RuntimeError('Current creative gateway differs from the verified FigFlow source')
    worker = modules['worker.js'].decode()
    worker = replace_one(worker, '      await visit(data.models || data);\n', '''      // Offer heroes share this restricted media catalogue and its opaque IDs.
      try {
        const published = await rpc(key, "get_offers", { oem: brand, include_disclaimers: false });
        for (const offer of Array.isArray(published.offers) ? published.offers.slice(0, 500) : []) {
          if (!offer || typeof offer !== "object" || model && !matches(offer.model || offer.title || "")) continue;
          const url = safeURL(offer.image_url);
          const ext = url && extension(url.href);
          if (ext && ["image/png", "image/jpeg", "image/webp"].includes(MIME[ext])) await add(url.href, text(offer.title || offer.offer || "Offer") + " · hero", "Motorstack offers");
        }
      } catch {
        warnings.push("Some offer artwork is temporarily unavailable.");
      }
      await visit(data.models || data);
''')
    rpc = modules['brand-rpc.mjs'].decode()
    rpc = replace_one(rpc, '    const items = source.map(item => {', '    const items = await Promise.all(source.map(async item => {')
    rpc = replace_one(rpc, '''        return {
          title: value(item, 'title', 255), model: value(item, 'model'), variant: value(item, 'variant'),
          price: amount(item.price), priceLabel: value(item, 'price_label'), offer: item.offer == null ? null : terms(item.offer, 2000),
          endDate: item.end_date ?? null,
          disclaimer: item.disclaimer == null ? null : terms(item.disclaimer), hasImage: Boolean(item.image_url)
        }''', '''        const url = safeURL(item.image_url)
        const ext = url && extension(url.href)
        const artworkAssetId = ext && ['image/png', 'image/jpeg', 'image/webp'].includes(MIME[ext])
          ? await idFor(brandId + '\\n' + url.href) : null
        return {
          title: value(item, 'title', 255), model: value(item, 'model'), variant: value(item, 'variant'),
          price: amount(item.price), priceLabel: value(item, 'price_label'), offer: item.offer == null ? null : terms(item.offer, 2000),
          endDate: item.end_date ?? null,
          disclaimer: item.disclaimer == null ? null : terms(item.disclaimer), hasImage: Boolean(item.image_url), artworkAssetId
        }''')
    rpc = replace_one(rpc, '''    })
    return { schemaVersion: 1, brand, kind: input.kind, updatedAt:''', '''    }))
    return { schemaVersion: 1, brand, kind: input.kind, updatedAt:''')
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    candidate = {'worker.js': worker.encode(), 'brand-rpc.mjs': rpc.encode()}
    for name, body in candidate.items():
        (output / name).write_bytes(body)
    manifest = {'baseVersion': 'c74e9804-3e14-4a2b-a6b7-b65e79266008',
                'baseDeployment': '4b9f9b97-bdaa-4603-a154-a69f52d88b6c',
                'baseHashes': BASE_HASHES, 'moduleHashes': {name: digest(body) for name, body in candidate.items()}}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    print(json.dumps(build(), indent=2))
