"""Repair Photo's relocated wasm-bindgen snippets in a new ZIP, never changing originals."""
import argparse
import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import stat
import zipfile

MAX_BYTES = 250 * 1024 * 1024
IMPORT = re.compile(r'''(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.{1,2}/[^"']+)["']''')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect(archive):
    infos = archive.infolist()
    if len(infos) > 50000 or sum(i.file_size for i in infos) > MAX_BYTES:
        raise ValueError('Archive expansion limit')
    seen = set()
    files = {}
    for info in infos:
        path = PurePosixPath(info.filename)
        if (path.is_absolute() or '..' in path.parts or str(path) != info.filename.rstrip('/')
                or any(c in info.filename for c in '\\%?#') or info.flag_bits & 1
                or stat.S_IFMT(info.external_attr >> 16) not in (0, stat.S_IFREG, stat.S_IFDIR)
                or info.filename.rstrip('/') in seen):
            raise ValueError('Unsafe archive member')
        seen.add(info.filename.rstrip('/'))
        if not info.is_dir():
            files[info.filename] = archive.read(info)
    return infos, files


def missing_imports(files):
    missing = []
    for name, data in files.items():
        if not name.endswith('.js'):
            continue
        for relative in IMPORT.findall(data.decode('utf8')):
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), relative))
            if target not in files:
                missing.append({'module': name, 'import': relative, 'resolved': target})
    return missing


def repair(source, output, expected_sha256):
    source, output = Path(source), Path(output)
    if source.is_symlink() or source.stat().st_size > MAX_BYTES or sha(source.read_bytes()) != expected_sha256:
        raise ValueError('Source archive checksum/size mismatch')
    if not output.is_absolute() or output != output.resolve() or output.exists() or output.is_symlink() or output.resolve() == source.resolve():
        raise ValueError('Fresh output required')
    with zipfile.ZipFile(source) as archive:
        infos, files = inspect(archive)
        roots = {PurePosixPath(name).parts[0] for name in files}
        if len(roots) != 1:
            raise ValueError('Expected one package root')
        prefix = roots.pop()
        if not re.fullmatch(r'photocraft-web-\d+\.\d+\.\d+', prefix) or prefix + '/app/photocraft-web.js' not in files:
            raise ValueError('Unexpected Photo package layout')
        before = missing_imports(files)
        additions = {}
        for name, data in files.items():
            if name.startswith(prefix + '/snippets/'):
                target = prefix + '/app/' + name[len(prefix) + 1:]
                if target in files and files[target] != data:
                    raise ValueError('Conflicting relocated snippet')
                if target not in files:
                    additions[target] = data
        if not additions:
            raise ValueError('No missing relocated snippets; review upstream packaging')
        final = {**files, **additions}
        unresolved = missing_imports(final)
        if unresolved:
            raise ValueError('Unresolved JavaScript module imports: ' + json.dumps(unresolved))
        output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output, 'x') as target:
            for info in infos:
                target.writestr(copy.copy(info), b'' if info.is_dir() else files[info.filename])
            for name, data in additions.items():
                target.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(output) as archive:
        _, written = inspect(archive)
    if any(written.get(name) != data for name, data in files.items()) or missing_imports(written):
        raise ValueError('Output validation failed')
    return {'status': 'repaired-unpublished-photo-package', 'source_sha256': expected_sha256,
            'output_sha256': sha(output.read_bytes()), 'bytes': output.stat().st_size,
            'added': {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in additions.items()},
            'unchanged_original_files': len(files), 'missing_imports_before': before,
            'missing_imports_after': [], 'wasm_and_parts_unchanged': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    print(json.dumps(repair(args.source, args.output, args.sha256), indent=2))
