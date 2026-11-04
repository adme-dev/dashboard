"""Reproduce the active multi-brand gateway and extend only its EDM prefix list."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'creative-multibrand-release/build.py'
spec = importlib.util.spec_from_file_location('current_multibrand', SOURCE)
current = importlib.util.module_from_spec(spec)
spec.loader.exec_module(current)


def build():
    pins = json.loads((ROOT / 'publication.json').read_text())
    current.build()
    modules = {name: (SOURCE.parent / 'dist' / name).read_bytes() for name in pins['gatewayBaseline']['modules']}
    if {name: hashlib.sha256(data).hexdigest() for name, data in modules.items()} != pins['gatewayBaseline']['modules']:
        raise ValueError('Current gateway reproduction differs from live reviewed modules')
    before = b'url.pathname.startsWith("/figflow/0.11.2-edm1/")'
    after = b'["/figflow/0.11.2-edm1/", "/figflow/0.11.2-edm3/", "/figflow/0.11.2-edm4/"].some(prefix => url.pathname.startsWith(prefix))'
    if modules['worker.js'].count(before) != 1:
        raise ValueError('Authenticated native routing anchor changed')
    modules['worker.js'] = modules['worker.js'].replace(before, after)
    output = ROOT / 'gateway-dist'
    output.mkdir(exist_ok=True)
    for name, data in modules.items():
        (output / name).write_bytes(data)
    manifest = {'baseline': pins['gatewayBaseline'], 'modules': {name: hashlib.sha256(data).hexdigest() for name, data in modules.items()}, 'keep_assets': True}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    print(json.dumps(build(), indent=2))
