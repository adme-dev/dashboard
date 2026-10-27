"""Linux text-only archive allowlist layered over the existing bounded reader."""
import contextlib
import io
import json
import pathlib
import re
import runpy
import sys
import zipfile

# Keep the existing compression/size/version/path checks as the single base reader.
base = pathlib.Path(__file__).resolve().parents[3] / 'scripts/banner-studio/photocraft-read-archive.py'
captured = io.StringIO()
with contextlib.redirect_stdout(captured):
    runpy.run_path(str(base), run_name='__main__')
result = json.loads(captured.getvalue())
manifest = result['manifest']
allowed = {'manifest.json'}
for field, expected in [('thumbnail', 'thumb.png'), ('composite', 'composite/preview.png')]:
    if field in manifest:
        if manifest[field] != expected:
            raise ValueError('Unsupported native preview binding')
        allowed.add(expected)
for layer in manifest['document']['layers']:
    content = layer['content']
    if content['kind'] != 'text' or layer.get('mask') or layer.get('vector_mask'):
        raise ValueError('Unsupported raster or mask in Linux text-only document')
    cache = content.get('cache') or {}
    for tile in cache.get('tiles', []):
        digest = tile.get('hash', '')
        if not re.fullmatch(r'[a-f0-9]{64}', digest):
            raise ValueError('Invalid derived text tile identity')
        allowed.add(f'tiles/{digest}.zst')
    psd_raw = content.get('psd_raw')
    if psd_raw is not None:
        if not isinstance(psd_raw, str) or not re.fullmatch(r'[a-f0-9]{64}', psd_raw):
            raise ValueError('Invalid derived text blob identity')
        allowed.add(f'blobs/{psd_raw}.zst')
with zipfile.ZipFile(sys.argv[1]) as archive:
    if set(archive.namelist()) != allowed:
        raise ValueError('Unexpected or missing archive payload: only referenced text caches and fixed previews are allowed')
print(json.dumps(result))
