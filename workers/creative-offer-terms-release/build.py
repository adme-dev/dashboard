"""Retain long offer terms and recover grade heroes from large photo catalogues."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'figflow-edm-assets' / 'edm5-gateway.py'
SPEC = importlib.util.spec_from_file_location('edm5_release', SOURCE)
base_release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base_release)
BASE_HASHES = {
    'worker.js': '31632a5df132a4465fd832058e2ec0b7ef1ca46e9050112faa2da70cb7c6d3d9',
    'brand-rpc.mjs': '0787e4c0acb8e2507a8d14f438a977941334212e95e0e490863b71a9812882c2',
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def replace_one(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError('Offer terms patch anchor changed')
    return source.replace(before, after)


def build():
    base_release.build()
    base = {name: (SOURCE.parent / 'gateway-dist' / name).read_bytes() for name in BASE_HASHES}
    # Reproduce only the already-published gateway transformations from
    # creative-suite-release/prepare.py. No standalone assets are rebuilt.
    published = json.loads((ROOT.parent / 'creative-suite-release' / 'publication.json').read_text())['receipt']
    if {name: digest(body) for name, body in base.items()} != published['baseline_modules']:
        raise RuntimeError('EDM5 gateway baseline changed')
    prefixes = published['prefixes']
    routes = {stable: prefix for prefix in prefixes for stable in ['/' + prefix.split('/')[1], '/' + prefix.split('/')[1] + '/']}
    worker = 'const standalonePrefixes = ' + json.dumps(prefixes) + ';\nconst isStandalone = path => standalonePrefixes.some(prefix => path.startsWith(prefix));\n' + base['worker.js'].decode()
    worker = replace_one(worker, 'if (url.pathname.endsWith("/sw.js")) {', 'if (url.pathname.endsWith("/sw.js") && !isStandalone(url.pathname)) {')
    dispatch = '''    if (url.hostname === "creative.xeroflow.io" && isStandalone(url.pathname)) {
      if (!env.CREATIVE_STANDALONE_ASSETS) return blocked(503, "Creative editor unavailable", false);
      try {
        return await env.CREATIVE_STANDALONE_ASSETS.fetch(new Request(url, { method: request.method }));
      } catch { return blocked(503, "Creative editor unavailable", false); }
    }
'''
    anchor = '    const assetsResponse = await handleMotorstack(request, env);'
    worker = replace_one(worker, anchor, dispatch + anchor)
    anchor = '    if (Object.hasOwn(app_routes_default, url.pathname)) {'
    redirects = '    if (url.hostname === "creative.xeroflow.io" && Object.hasOwn(promotedStableRoutes, url.pathname)) {\n      url.pathname = promotedStableRoutes[url.pathname];\n      return new Response(null, {status:302, headers:{Location:url.href, "Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer"}});\n    }\n'
    base['worker.js'] = ('const promotedStableRoutes = ' + json.dumps(routes) + ';\n' + replace_one(worker, anchor, redirects + anchor)).encode()
    if {name: digest(body) for name, body in base.items()} != BASE_HASHES:
        raise RuntimeError('Published Creative Suite gateway reproduction changed')
    rpc = replace_one(base['brand-rpc.mjs'].decode(), 'const terms = (text, max = 12000)', 'const terms = (text, max = 24000)')
    worker = replace_one(base['worker.js'].decode(),
        '''        } catch {
          warnings.push("Some model colour images are temporarily unavailable.");
        }
      }
    }
    if (kind === "all" || kind === "brand")''',
        '''        } catch {
          // Large model photo responses can be explicitly truncated by the provider.
          // Recover the smaller grade/paint hero catalogue, without inventing photos.
          try {
            const variants = await rpc(key, "get_variants", { oem: brand, model, include_photos: false });
            await visit(variants.vehicles || [], model);
            warnings.push("Extra model gallery images are unavailable; showing available grade and paint images.");
          } catch {
            warnings.push("Some model colour images are temporarily unavailable.");
          }
        }
      }
    }
    if (kind === "all" || kind === "brand")''')
    candidate = {'worker.js': worker.encode(), 'brand-rpc.mjs': rpc.encode()}
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    for name, body in candidate.items():
        (output / name).write_bytes(body)
    manifest = {'baseHashes': BASE_HASHES, 'moduleHashes': {name: digest(body) for name, body in candidate.items()}}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    print(json.dumps(build(), indent=2))
