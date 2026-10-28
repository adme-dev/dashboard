"""Prepare hash-pinned browser releases for Workers Static Assets.
Usage: python3 prepare.py ARCHIVE_DIRECTORY EMPTY_OUTPUT_DIRECTORY [RELEASE_MANIFEST [PREVIOUS_OUTPUT_DIRECTORY]]
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import zipfile
from brand_package import brand_package
from pwa_package import install_support

source = Path(__file__).resolve().parent
if len(sys.argv) not in (3, 4, 5):
    raise SystemExit(__doc__)
archives, output = map(Path, sys.argv[1:3])
output.mkdir(exist_ok=False)
public = output / 'public'
public.mkdir()
pins = json.loads((Path(sys.argv[3]) if len(sys.argv) >= 4 else source / 'releases.json').read_text())
compressed = {}
manifest = {}
# Keep published version scopes for existing tabs and origin-bound documents.
# Only editor directories are retained; launcher, shared assets and headers are rebuilt.
if len(sys.argv) == 5:
    previous = Path(sys.argv[4]).resolve()
    for engine in pins:
        brand = engine.replace('craft', 'flow')
        directory = previous / 'public' / brand
        if directory.is_dir():
            if any(p.is_symlink() for p in directory.rglob('*')):
                raise ValueError('Previous release contains a symlink')
            shutil.copytree(directory, public / brand)
    for url, asset in json.loads((previous / 'compressed.json').read_text()).items():
        if (public / asset.lstrip('/')).is_file():
            compressed[url] = asset
    for url, digest in json.loads((previous / 'asset-sha256.json').read_text()).items():
        if (public / url.lstrip('/')).is_file() or url in compressed:
            manifest[url] = digest
for engine, pin in pins.items():
    brand = engine.replace('craft', 'flow')
    display_name = brand[:-4].capitalize() + 'Flow'
    archive = archives / pin['name']
    assert archive.stat().st_size == pin['size']
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == pin['digest'].split(':')[1]
    prefix = f"{engine}-web-{pin['version']}/"
    with zipfile.ZipFile(archive) as z:
        assert sum(i.file_size for i in z.infolist()) < 250 * 1024 * 1024
        for info in z.infolist():
            path = PurePosixPath(info.filename)
            assert not path.is_absolute() and '..' not in path.parts and info.filename.startswith(prefix)
            if info.is_dir():
                continue
            relative = info.filename[len(prefix):]
            if not relative or any(p.startswith('.') for p in PurePosixPath(relative).parts) or relative == '_headers':
                continue
            dest = public / brand / pin.get('hosted_version', pin['version']) / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = z.read(info)
            if relative == 'index.html':
                data = data.decode('utf-8').replace(engine[:-5].capitalize() + 'Craft', display_name).encode('utf-8')
            if relative == 'manifest.webmanifest':
                manifest_data = json.loads(data)
                manifest_data['name'] = display_name
                manifest_data['short_name'] = display_name
                data = (json.dumps(manifest_data, indent=2)+'\n').encode('utf-8')
            dest.write_bytes(data)
            manifest['/' + str(dest.relative_to(public))] = hashlib.sha256(data).hexdigest()
            if dest.suffix == '.wasm' and len(data) > 25 * 1024 * 1024:
                subprocess.run(['node', '--input-type=module', '-e', '''
import {readFileSync,writeFileSync} from 'node:fs';
import {brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';
const p=process.argv[1], b=readFileSync(p);
const c=brotliCompressSync(b,{params:{[constants.BROTLI_PARAM_QUALITY]:8}});
if(c.length>25*1024*1024 || !brotliDecompressSync(c).equals(b)) throw Error('Invalid compressed asset');
writeFileSync(p+'.br',c);
''', str(dest)], check=True)
                compressed['/' + str(dest.relative_to(public))] = '/' + str(dest.relative_to(public)) + '.br'
                dest.unlink()
            elif len(data) > 25 * 1024 * 1024:
                raise ValueError('Asset exceeds Cloudflare limit')
for engine, pin in pins.items():
    directory = public / engine.replace('craft', 'flow') / pin.get('hosted_version', pin['version'])
    brand_package(directory, engine, source / 'static')
    for path in directory.rglob('*'):
        if path.is_file() and not path.name.endswith('.wasm.br'):
            manifest['/' + str(path.relative_to(public))] = hashlib.sha256(path.read_bytes()).hexdigest()
shutil.copyfile(source / 'worker.mjs', output / 'worker.mjs')
shutil.copyfile(source / 'auth.mjs', output / 'auth.mjs')
shutil.copyfile(source / 'motorstack.mjs', output / 'motorstack.mjs')
for page in ('index.html', 'credits.html'):
    html = (source / page).read_text()
    for engine, pin in pins.items():
        brand = engine.replace('craft', 'flow')
        html = html.replace(f"/{brand}/{pin['version']}/", f"/{brand}/{pin.get('hosted_version', pin['version'])}/")
    (public / page).write_text(html)
shutil.copytree(source / 'assets', public / 'images')
shutil.copytree(source / 'static', public, dirs_exist_ok=True)
install_support(public, pins)
for sw in public.rglob('sw.js'):
    sw.write_bytes((source / 'static' / 'retired-sw.js').read_bytes())
app_routes = {}
for engine, pin in pins.items():
    brand = engine.replace('craft', 'flow')
    for path in (f'/{brand}', f'/{brand}/'):
        app_routes[path] = f"/{brand}/{pin.get('hosted_version', pin['version'])}/"
(output / 'app-routes.json').write_text(json.dumps(app_routes, indent=2)+'\n')
(output / 'compressed.json').write_text(json.dumps(compressed, indent=2)+'\n')
(public / '_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: no-cache\n  Content-Security-Policy: frame-ancestors \'self\' https://app.xeroflow.io\n')
for file in public.rglob('*'):
    if file.is_file() and not file.name.endswith('.wasm.br'):
        manifest['/' + str(file.relative_to(public))] = hashlib.sha256(file.read_bytes()).hexdigest()
(output / 'asset-sha256.json').write_text(json.dumps(manifest, indent=2)+'\n')
config = {'name':'xeroflow-creative-tools','account_id':'a5b299b3ad15c1b5b895dc66f9357b17','main':'worker.mjs','compatibility_date':'2026-10-27','workers_dev':True,'preview_urls':False,'routes':[{'pattern':'creative.xeroflow.io','custom_domain':True},{'pattern':'app.xeroflow.io/creative-launch*','zone_name':'xeroflow.io'}],'assets':{'directory':'./public','binding':'ASSETS','run_worker_first':True},'observability':{'enabled':True,'head_sampling_rate':0.1}}
(output / 'wrangler.jsonc').write_text(json.dumps(config, indent=2)+'\n')
print(json.dumps({'output':str(output),'engines':list(pins),'compressed':compressed,'verified_assets':len(manifest)}))
