"""Prepare and build standalone candidates; never publish or change the EDM editor pins."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import subprocess
import tarfile
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_EXPANDED = 1024 * 1024 * 1024
MAX_MEMBERS = 50000


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verified(path, expected):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_ARCHIVE:
        raise ValueError('Missing, linked or oversized input: ' + str(path))
    if sha(path) != expected:
        raise ValueError('Checksum mismatch: ' + str(path))
    return path


def external_root(path):
    path = Path(path)
    if not path.is_absolute() or path != path.resolve():
        raise ValueError('Build root must be absolute, normalized and without symlinks')
    if path == REPO or REPO in path.parents or path in REPO.parents:
        raise ValueError('Build root must not overlap the repository')
    return path


def extract(archive, destination, prefix=None):
    """Validate the complete archive before writing. Never follow links or overwrite files."""
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        raise FileExistsError(destination)
    with tarfile.open(archive) as tar:
        entries = []
        total = 0
        count = 0
        seen = set()
        for member in tar:
            name = PurePosixPath(member.name)
            total += member.size
            count += 1
            if count > MAX_MEMBERS or total > MAX_EXPANDED:
                raise ValueError('Archive expansion limit exceeded')
            if name.is_absolute() or '..' in name.parts or not (member.isdir() or member.isfile()):
                raise ValueError('Unsafe archive member: ' + member.name)
            parts = name.parts
            if prefix:
                if not parts or parts[0] != prefix:
                    raise ValueError('Unexpected archive root')
                parts = parts[1:]
            if not parts:
                continue
            rel = Path(*parts)
            if rel in seen:
                raise ValueError('Duplicate archive member')
            seen.add(rel)
            entries.append((member, rel))
        destination.mkdir(parents=True, exist_ok=False)
        for member, rel in entries:
            target = destination / rel
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)


def patch_path(base, name, expected):
    rel = PurePosixPath(name)
    path = Path(base) / name
    if rel.is_absolute() or '..' in rel.parts or not rel.parts or rel.parts[0] != 'patches':
        raise ValueError('Invalid patch path')
    if not path.resolve().is_relative_to(Path(base).resolve()) or path.is_symlink():
        raise ValueError('Linked patch path')
    verified(path, expected)
    # patch -p1 must never address anything outside the extracted source.
    for line in path.read_text().splitlines():
        if line.startswith(('--- ', '+++ ')):
            name = line[4:].split('\t')[0]
            target = PurePosixPath(name)
            if target.is_absolute() or '..' in target.parts or len(target.parts) < 2 or target.parts[0] not in ('a', 'b'):
                raise ValueError('Unsafe patch target')
    return path


def tree(root):
    result = {}
    for path in sorted(Path(root).rglob('*')):
        if path.is_symlink():
            raise ValueError('Source tree contains a symlink')
        if path.is_file():
            result[str(path.relative_to(root))] = sha(path)
    return result


def write_json(path, data):
    with Path(path).open('x') as stream:
        json.dump(data, stream, indent=2, sort_keys=True)
        stream.write('\n')


def prepare(engine, root, archives, fonts, config=HERE):
    root = external_root(root)
    pins = json.loads((Path(config) / 'source-pins.json').read_text())
    if engine not in pins:
        raise ValueError('Unsupported engine')
    pin = pins[engine]
    archive = verified(Path(archives) / pin['archive'], pin['source_archive_sha256'])
    patch = patch_path(config, pin['patch'], pin['patch_sha256'])
    font = pin.get('fonts')
    if font:
        font_archive = verified(Path(fonts) / font['archive'], font['sha256'])
    root.mkdir(parents=True, exist_ok=False)
    source = root / 'source'
    extract(archive, source, f'{engine}-{pin["commit"]}')
    if sha(source / 'Cargo.lock') != pin['cargo_lock_sha256']:
        raise ValueError('Pristine Cargo.lock mismatch')
    result = subprocess.run(['patch', '-p1', '--fuzz=0', '--batch', '--forward', '-i', str(patch.resolve())], cwd=source, capture_output=True, text=True)
    (root / 'patch.log').write_text(result.stdout + result.stderr)
    if result.returncode:
        raise ValueError('Patch replay failed; retained root is not buildable')
    if sha(source / 'Cargo.lock') != pin['cargo_lock_sha256']:
        raise ValueError('Patch changed Cargo.lock')
    if font:
        extract(font_archive, root / 'fonts', 'craft-fonts-' + font['commit'])
        write_json(root / 'fonts-manifest.json', tree(root / 'fonts'))
    write_json(root / 'source-manifest.json', tree(source))
    write_json(root / 'prepared.json', {'engine': engine, 'pin': pin, 'source_pins_sha256': sha(Path(config) / 'source-pins.json'), 'patch_zero_fuzz': True, 'status': 'prepared-unbuilt'})
    return root


def environment(root, pin, engine):
    # Do not inherit caller-controlled compiler/output overrides or shared Cargo/rustup homes.
    env = {k: os.environ[k] for k in ('HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'SDKROOT') if k in os.environ}
    env.update({'PATH': str(root / 'tools/cargo/bin') + ':' + str(root / 'tools/bin') + ':/usr/bin:/bin:/usr/sbin:/sbin',
                'RUSTUP_HOME': str(root / 'tools/rustup'), 'CARGO_HOME': str(root / 'tools/cargo'),
                'RUSTUP_TOOLCHAIN': '1.95.0', 'CARGO_TARGET_DIR': str(root / 'target'),
                'CARGO_BUILD_JOBS': '3', 'CARGO_INCREMENTAL': '0', 'TMPDIR': str(root / 'tmp'),
                # Trunk 0.21.14 supports these version selectors, but its optimizer cache
                # is platform-wide and its transitive archive is not checksum-pinned here.
                'TRUNK_TOOLS_WASM_OPT': 'version_123', 'TRUNK_TOOLS_WASM_BINDGEN': '0.2.129',
                'NO_COLOR': 'true', 'DIST': str(root / 'build/packages')})
    if pin.get('fonts'):
        env.update({'CRAFT_FONTS_DIR': str(root / 'fonts'), 'CRAFT_FONTS_REQUIRED': '1'})
    if engine == 'photocraft':
        if not pin.get('fonts'):
            raise ValueError('PhotoCraft browser packaging requires pinned served fonts')
        # Photo's web wasm does not embed craft-fonts: packaging copies this manifest
        # and its font/license files beside the site for on-demand browser fetches.
        env['PHOTOCRAFT_WEB_FONTS_DIR'] = str(root / 'fonts')
    for app in ('photocraft', 'vectorcraft', 'effectcraft', 'filmcraft', 'soundcraft', 'figcraft'):
        env[app.upper() + '_BUILD_SHA'] = pin['commit']
        env[app.upper() + '_BUILD_DATE'] = '2026-11-10'
    return env


def bootstrap(root, cache, config=HERE):
    root = external_root(root)
    prepared = json.loads((root / 'prepared.json').read_text())
    receipt = json.loads((Path(config) / 'tools.json').read_text())
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise ValueError('Pinned tools support only macOS arm64; add reviewed tool digests for another host')
    inputs = {name: verified(Path(cache) / tool['archive'], tool['sha256']) for name, tool in receipt['tools'].items()}
    tools = root / 'tools'
    tools.mkdir(exist_ok=False)
    (tools / 'bin').mkdir()
    (root / 'tmp').mkdir(exist_ok=True)
    for name in ('trunk', 'bindgen'):
        unpacked = tools / (name + '-unpacked')
        extract(inputs[name], unpacked)
        binary = 'wasm-bindgen' if name == 'bindgen' else 'trunk'
        matches = [p for p in unpacked.rglob(binary) if p.is_file()]
        if len(matches) != 1:
            raise ValueError('Expected one tool binary: ' + binary)
        shutil.copyfile(matches[0], tools / 'bin' / binary)
        (tools / 'bin' / binary).chmod(0o755)
    shutil.copyfile(inputs['rustup'], tools / 'rustup-init')
    (tools / 'rustup-init').chmod(0o755)
    env = environment(root, prepared['pin'], prepared['engine'])
    with (tools / 'bootstrap.log').open('x') as log:
        subprocess.run([str(tools / 'rustup-init'), '-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', receipt['rust'], '--target', 'wasm32-unknown-unknown'], env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    binaries = ('bin/trunk', 'bin/wasm-bindgen', 'cargo/bin/rustup')
    version = subprocess.check_output([str(tools / 'cargo/bin/rustc'), '--version'], env=env, text=True).strip()
    if not version.startswith('rustc 1.95.0 '):
        raise ValueError('Unexpected Rust toolchain version')
    write_json(tools / 'ready.json', {'inputs': receipt, 'files': {name: sha(tools / name) for name in binaries}, 'rustc_version': version, 'status': 'installed'})


def build(root, config=HERE):
    root = external_root(root)
    prepared = json.loads((root / 'prepared.json').read_text())
    if sha(Path(config) / 'source-pins.json') != prepared['source_pins_sha256']:
        raise ValueError('Pins changed since preparation')
    pin = prepared['pin']
    if pin != json.loads((Path(config) / 'source-pins.json').read_text())[prepared['engine']]:
        raise ValueError('Prepared pin does not match candidate')
    if pin.get('fonts') and tree(root / 'fonts') != json.loads((root / 'fonts-manifest.json').read_text()):
        raise ValueError('Prepared fonts changed')
    if tree(root / 'source') != json.loads((root / 'source-manifest.json').read_text()):
        raise ValueError('Prepared source changed')
    ready = json.loads((root / 'tools/ready.json').read_text())
    if ready['inputs'] != json.loads((Path(config) / 'tools.json').read_text()):
        raise ValueError('Tool pins changed')
    for name in ('bin/trunk', 'bin/wasm-bindgen', 'cargo/bin/rustup'):
        verified(root / 'tools' / name, ready['files'][name])
    if sha(root / 'source/Cargo.lock') != pin['cargo_lock_sha256']:
        raise ValueError('Cargo.lock changed')
    output = root / 'build'
    output.mkdir(exist_ok=False)
    (root / 'tmp').mkdir(exist_ok=True)
    start = time.monotonic()
    with (output / 'build.log').open('x') as log:
        result = subprocess.run(['bash', 'packaging/web/package.sh'], cwd=root / 'source', env=environment(root, pin, prepared['engine']), stdout=log, stderr=subprocess.STDOUT)
    lock = sha(root / 'source/Cargo.lock')
    packages = [{'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in (output / 'packages').glob('*-web-*.zip')]
    passed = result.returncode == 0 and lock == pin['cargo_lock_sha256'] and len(packages) == 1
    write_json(output / 'receipt.json', {'status': 'built-unpublished' if passed else 'failed', 'exit': result.returncode, 'seconds': time.monotonic() - start, 'cargo_lock_sha256': lock, 'lock_unchanged': lock == pin['cargo_lock_sha256'], 'packages': packages, 'pin': pin, 'transitive_tools': ready['inputs'].get('transitive_tools', {}), 'fully_checksum_pinned_toolchain': False})
    if not passed:
        raise ValueError('Build failed, changed lockfile, or missing/ambiguous package; see receipt')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    prep = commands.add_parser('prepare')
    prep.add_argument('engine')
    prep.add_argument('--root', type=Path, required=True)
    prep.add_argument('--archives', type=Path, required=True)
    prep.add_argument('--fonts', type=Path, required=True)
    tools = commands.add_parser('bootstrap')
    tools.add_argument('--root', type=Path, required=True)
    tools.add_argument('--cache', type=Path, required=True)
    run = commands.add_parser('build')
    run.add_argument('--root', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        prepare(args.engine, args.root, args.archives, args.fonts)
    elif args.command == 'bootstrap':
        bootstrap(args.root, args.cache)
    else:
        build(args.root)


if __name__ == '__main__':
    main()
