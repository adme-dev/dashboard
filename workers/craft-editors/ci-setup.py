"""Prepare verified creative-editor sources/tools; never build or deploy the dashboard."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import urllib.request

TOOLS = {
    'trunk': {
        'url': 'https://github.com/trunk-rs/trunk/releases/download/v0.21.14/trunk-x86_64-unknown-linux-gnu.tar.gz',
        # Older Trunk release API has no digest; verified against its official .sha256 asset.
        'sha256': 'f2b4680cd239693a646a2795e4633c625328d7b2a044fbe749fa3a2fe9e7036b',
        'version': '0.21.14',
    },
    'wasm-bindgen': {
        'url': 'https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.129/wasm-bindgen-0.2.129-x86_64-unknown-linux-musl.tar.gz',
        # Official release API asset digest, verified 2026-10-28.
        'sha256': '82d12bb940e2d4e72e0d5605387fc1b8ca179044e012b620f0ce4e7440e8320e',
        'version': '0.2.129',
    },
}
FONTS = {
    'photocraft': ('abb83316d96aa59c1cf64784289e378fe9fa5695', '53e41ed01ee81a0ef664601a73fb87281f1fd748e724f560c8128d7d33eb3328'),
    'filmcraft': ('bfcbf714e45a3ea8e98f88ab2b7971372a576414', '75a7e31d81e34937b8d66106811efe4060a5df5f4ce373951c1e533aa2964b0f'),
    'vectorcraft': ('a71c20e30af613287c504f7e685ca8fad77752bc', 'ecbe9b8f4f8cc79b05e656412b6f214efeec3c5e6f26d16f2693307eb353c048'),
    'figcraft': ('43913056ce82a3fdad0ef69f6b88d1dc922a8104', 'e2dd2bb3ae39e442ee67416b9bc29b7ca8ef906e8ff2caaf5a451aaa6c662057'),
}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def download(url, path, expected=None):
    request = urllib.request.Request(url, headers={'User-Agent': 'XeroFlow-creative-build'})
    with urllib.request.urlopen(request, timeout=120) as response, path.open('wb') as output:
        copied = 0
        while block := response.read(1024 * 1024):
            copied += len(block)
            if copied > 512 * 1024 * 1024:
                raise ValueError('Archive download exceeds 512 MiB')
            output.write(block)
    actual = digest(path)
    if expected is not None and actual != expected:
        raise ValueError(f'Checksum mismatch: {path.name}')
    return actual


def extract(archive, destination, prefix=None):
    """Only regular files/directories, no traversal, links, devices or implicit tar trust."""
    destination.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        if sum(member.size for member in members) > 1024 * 1024 * 1024:
            raise ValueError('Expanded archive exceeds 1 GiB')
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or not (member.isdir() or member.isfile()):
                raise ValueError(f'Unsafe archive member: {member.name}')
            parts = name.parts
            if prefix:
                if not parts or parts[0] != prefix:
                    raise ValueError('Unexpected archive root')
                parts = parts[1:]
            if not parts:
                continue
            target = destination.joinpath(*parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)


def setup(engine, root, tools_root, evidence):
    scripts = Path(__file__).resolve().parent
    pins = json.loads((scripts / 'source-pins.json').read_text())
    if engine not in ('photocraft', 'vectorcraft', 'effectcraft', 'filmcraft', 'soundcraft', 'figcraft'):
        raise ValueError('Unsupported CI engine')
    pin = pins[engine]
    root.mkdir(parents=True, exist_ok=False)
    tools_root.mkdir(parents=True, exist_ok=False)
    evidence.mkdir(parents=True, exist_ok=True)
    url = f'https://codeload.github.com/storytold/{engine}/tar.gz/{pin["commit"]}'
    archive = root / f'{engine}.tar.gz'
    download(url, archive, pin['source_archive_sha256'])
    source = root / engine
    extract(archive, source, f'{engine}-{pin["commit"]}')
    applied = [{'path': pin['branding_patch'], 'sha256': pin['branding_patch_sha256']}, *pin.get('additional_patches', [])]
    for patch in applied:
        path = (scripts / patch['path']).resolve()
        if scripts not in path.parents or digest(path) != patch['sha256']:
            raise ValueError('Patch path/checksum mismatch')
        subprocess.run(['patch', '-p1', '--batch', '--forward', '-i', str(path)], cwd=source, check=True)
    if digest(source / 'Cargo.lock') != pin['cargo_lock_sha256']:
        raise ValueError('Patched source changed Cargo.lock')
    font_receipt = None
    if engine in FONTS:
        commit, sha = FONTS[engine]
        fonts_url = f'https://codeload.github.com/storytold/craft-fonts/tar.gz/{commit}'
        archive = root / 'fonts.tar.gz'
        download(fonts_url, archive, sha)
        extract(archive, root / 'fonts' / engine, f'craft-fonts-{commit}')
        font_receipt = {'commit': commit, 'url': fonts_url, 'sha256': sha}
    bin_dir = tools_root / 'bin'
    bin_dir.mkdir()
    for name, tool in TOOLS.items():
        archive = tools_root / f'{name}.tar.gz'
        download(tool['url'], archive, tool['sha256'])
        expanded = tools_root / f'{name}-extracted'
        extract(archive, expanded)
        matches = [p for p in expanded.rglob(name) if p.is_file()]
        if len(matches) != 1:
            raise ValueError(f'Expected one {name} executable')
        shutil.copyfile(matches[0], bin_dir / name)
        (bin_dir / name).chmod(0o755)
    # Rustup validates the pinned Rust1.95 toolchain's official component checksums.
    # Verify the bootstrap installer against the official same-origin SHA256 file as well.
    rustup_url = 'https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init'
    checksum_file = tools_root / 'rustup-init.sha256'
    download(rustup_url + '.sha256', checksum_file)
    rustup_sha = checksum_file.read_text().split()[0]
    if len(rustup_sha) != 64 or any(c not in '0123456789abcdef' for c in rustup_sha):
        raise ValueError('Invalid official rustup checksum')
    download(rustup_url, tools_root / 'rustup-init', rustup_sha)
    (tools_root / 'rustup-init').chmod(0o755)
    receipt = {
        'engine': engine, 'source': {'url': url, **pin}, 'applied_patches': applied,
        'fonts': font_receipt, 'tools': TOOLS, 'rust': '1.95.0',
        'rustup': {'url': rustup_url, 'sha256': rustup_sha},
    }
    (evidence / 'source-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    shutil.copyfile(source / 'Cargo.lock', evidence / 'Cargo.lock')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit('Usage: ci-setup.py ENGINE SOURCE_ROOT TOOL_ROOT EVIDENCE_DIR')
    setup(sys.argv[1], *map(Path, sys.argv[2:]))
