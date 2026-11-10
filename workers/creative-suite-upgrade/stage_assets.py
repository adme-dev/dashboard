"""Stage a standalone unpublished ASSETS delta. Never deploy or change routes."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import zipfile
from repair_photo_package import missing_imports

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
LIMIT = 25 * 1024 * 1024
MAX_ZIP = 512 * 1024 * 1024
MAX_EXPANSION = 512 * 1024 * 1024
MAX_MEMBERS = 50000


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def checked_file(root, name, digest):
    rel = PurePosixPath(name)
    path = root / name
    if rel.is_absolute() or '..' in rel.parts or path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Unsafe input path')
    if not path.is_file() or path.stat().st_size > MAX_ZIP or file_sha(path) != digest:
        raise ValueError('Input checksum/size mismatch')
    return path


def members(archive, prefix, limit=LIMIT):
    """Preflight all ZIP paths and output collisions before creating any output."""
    infos = archive.infolist()
    if len(infos) > MAX_MEMBERS or sum(i.file_size for i in infos) > MAX_EXPANSION:
        raise ValueError('ZIP expansion/member limit exceeded')
    seen = set()
    outputs = set()
    result = []
    for info in infos:
        name = info.filename
        path = PurePosixPath(name)
        mode = stat.S_IFMT(info.external_attr >> 16)
        if (path.is_absolute() or '..' in path.parts or str(path) != name.rstrip('/')
                or any(c in name for c in '\\%?#') or any(ord(c) < 32 for c in name)
                or info.flag_bits & 1 or mode not in (0, stat.S_IFREG, stat.S_IFDIR)
                or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                or not (name == prefix + '/' or name.startswith(prefix + '/'))):
            raise ValueError('Unsafe ZIP member: ' + name)
        if name.rstrip('/') in seen:
            raise ValueError('ZIP path collision')
        seen.add(name.rstrip('/'))
        relative = name[len(prefix) + 1:]
        if info.is_dir():
            continue
        if not relative or any(part.startswith('.') for part in PurePosixPath(relative).parts):
            if relative == '.htaccess':
                continue
            raise ValueError('Unsafe hidden ZIP member')
        if relative == '_headers':
            continue  # Host configuration never enters this standalone delta.
        encoded = info.file_size >= limit
        if encoded and not relative.endswith('.wasm'):
            raise ValueError('Oversized non-WASM asset')
        output = relative + '.br' if encoded else relative
        if output in outputs:
            raise ValueError('Encoded asset path collision')
        outputs.add(output)
        result.append((info, relative, output, encoded))
    # A generated .br must not collide with an original member (regardless of ordering).
    for _, relative, output, encoded in result:
        if encoded and prefix + '/' + output in seen:
            raise ValueError('Encoded asset path collision')
    for output in outputs:
        if any(str(parent) in outputs for parent in PurePosixPath(output).parents if str(parent) != '.'):
            raise ValueError('File/directory collision')
    if not any(relative == 'index.html' for _, relative, _, _ in result):
        raise ValueError('Package has no index.html')
    return result


def write_json(path, data):
    with path.open('x') as stream:
        json.dump(data, stream, indent=2, sort_keys=True)
        stream.write('\n')


def stage(builds, output, node, config=HERE, limit=LIMIT, reuse=None):
    builds, output, config = Path(builds), Path(output), Path(config)
    if not output.is_absolute() or output != output.resolve() or output.exists():
        raise ValueError('Output must be fresh absolute path without symlinks')
    if output == REPO or REPO in output.parents or output in REPO.parents:
        raise ValueError('Stage outside the source repository')
    inputs = json.loads((config / 'stage-inputs.json').read_text())
    pins = json.loads((config / 'source-pins.json').read_text())
    reused = json.loads((Path(reuse) / 'stored-assets.json').read_text()) if reuse else {}
    preflight = []
    scopes = set()
    for engine, item in inputs.items():
        if engine not in pins or not re.fullmatch(r'[a-z]+craft', engine):
            raise ValueError('Unknown engine')
        scope = item['scope']
        if not re.fullmatch(r'\d+\.\d+\.\d+-flow[1-9]\d*', scope) or not scope.startswith(pins[engine]['version'] + '-'):
            raise ValueError('Invalid version scope')
        route = engine.replace('craft', 'flow') + '/' + scope
        if route in scopes:
            raise ValueError('Duplicate scope')
        scopes.add(route)
        receipt_path = checked_file(builds, item['receipt'], item['receipt_sha256'])
        receipt = json.loads(receipt_path.read_text())
        if receipt.get('engine') != engine or receipt.get('exit') != 0 or receipt.get('lock_unchanged') is not True or receipt.get('lock_sha256') != pins[engine]['cargo_lock_sha256']:
            raise ValueError('Unsuccessful or wrong-engine/lock receipt')
        packages = receipt.get('packages', [])
        if len(packages) != 1 or packages[0].get('sha256') != item['zip_sha256'] or packages[0].get('bytes') != item['zip_bytes'] or packages[0].get('file') != PurePosixPath(item['zip']).name:
            raise ValueError('Receipt package mismatch')
        if item.get('compiler_receipt'):
            compiler = json.loads(checked_file(builds, item['compiler_receipt'], item['compiler_receipt_sha256']).read_text())
            if compiler.get('engine') != engine or compiler.get('exit') != 0 or compiler.get('lock_unchanged') is not True or compiler.get('lock_sha256') != pins[engine]['cargo_lock_sha256']:
                raise ValueError('Invalid compiler receipt')
        archive_path = checked_file(builds, item['zip'], item['zip_sha256'])
        if archive_path.stat().st_size != item['zip_bytes']:
            raise ValueError('ZIP size mismatch')
        prefix = item.get('archive_root', f'{engine}-web-{pins[engine]["version"]}')
        if not re.fullmatch(re.escape(f'{engine}-web-{pins[engine]["version"]}') + r'(?:-flow[1-9]\d*)?', prefix):
            raise ValueError('Invalid archive root')
        with zipfile.ZipFile(archive_path) as archive:
            plan = members(archive, prefix, limit)
            if engine == 'photocraft' and not any(rel == 'fonts/manifest.txt' for _, rel, _, _ in plan):
                raise ValueError('Photo package lacks served fonts')
        preflight.append((engine, item, archive_path, route, prefix))
    output.mkdir(parents=True, exist_ok=False)
    public = output / 'public'
    public.mkdir()
    compressed, decoded_hashes, stored, artifacts = {}, {}, {}, []
    for engine, item, archive_path, route, prefix in preflight:
        # Recheck just before extraction; caches are read-only inputs, never edited here.
        if file_sha(archive_path) != item['zip_sha256']:
            raise ValueError('ZIP changed after preflight')
        with zipfile.ZipFile(archive_path) as archive:
            for info, relative, target, encoded in members(archive, prefix, limit):
                data = archive.read(info)
                if len(data) != info.file_size:
                    raise ValueError('ZIP decoded size mismatch')
                url, target_url = '/' + route + '/' + relative, '/' + route + '/' + target
                destination = public / route / target
                destination.parent.mkdir(parents=True, exist_ok=True)
                decoded_hashes[url] = sha(data)
                if encoded:
                    cached = reused.get(target_url)
                    reuse_args = []
                    if cached and cached.get('encoding') == 'br' and cached.get('decoded_sha256') == sha(data):
                        reuse_args = [str(checked_file(Path(reuse) / 'public', target_url.lstrip('/'), cached['sha256']))]
                    process = subprocess.run([str(node), str(HERE / 'brotli-stage.mjs'), str(destination), str(limit), *reuse_args], input=data, capture_output=True, check=True)
                    metadata = json.loads(process.stdout)
                    if metadata['decoded_sha256'] != sha(data) or metadata['decoded_bytes'] != len(data) or metadata['roundtrip_verified'] is not True:
                        raise ValueError('Compression receipt mismatch')
                    compressed[url] = target_url
                else:
                    with destination.open('xb') as stream:
                        stream.write(data)
                size = destination.stat().st_size
                if size >= limit:
                    raise ValueError('Stored asset exceeds strict file limit')
                digest = file_sha(destination)
                stored[target_url] = {'bytes': size, 'sha256': digest, 'decoded_url': url, 'decoded_bytes': len(data), 'decoded_sha256': sha(data), 'encoding': 'br' if encoded else 'identity'}
                if encoded and (metadata['encoded_sha256'] != digest or metadata['encoded_bytes'] != size):
                    raise ValueError('Stored compressed asset mismatch')
        artifacts.append({'engine': engine, **item, 'entry': '/' + route + '/index.html'})
        print(engine + ': staged verified delta', flush=True)
    for url, target in compressed.items():
        if (public / url.lstrip('/')).exists() or not (public / target.lstrip('/')).is_file():
            raise ValueError('Invalid compressed route')
    unresolved = missing_imports({str(p.relative_to(public)): p.read_bytes() for p in public.rglob('*.js')})
    if unresolved:
        raise ValueError('Unresolved JavaScript module imports: ' + json.dumps(unresolved))
    write_json(output / 'compressed.json', compressed)
    write_json(output / 'asset-sha256.json', decoded_hashes)
    write_json(output / 'stored-assets.json', stored)
    write_json(output / 'stage-receipt.json', {'status': 'unpublished-standalone-delta', 'complete_ASSETS_inventory': False, 'deployable_in_isolation': False, 'brotli_quality': 11, 'compression_concurrency': 1, 'strict_max_file_bytes': limit, 'assets': len(stored), 'compressed_assets': len(compressed), 'inputs': artifacts, 'input_manifest_sha256': file_sha(config / 'stage-inputs.json'), 'manifest_sha256': {name: file_sha(output / name) for name in ('compressed.json', 'asset-sha256.json', 'stored-assets.json')}, 'remaining': 'Reconcile complete existing ASSETS inventory, EDM and old live paths before any publication; browser and hosted acceptance separate.'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--builds', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--node', type=Path, required=True)
    parser.add_argument('--reuse-stage', type=Path)
    args = parser.parse_args()
    stage(args.builds, args.output, args.node, reuse=args.reuse_stage)
