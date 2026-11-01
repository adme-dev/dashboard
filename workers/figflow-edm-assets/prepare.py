"""Prepare one checksum-verified native CI archive, with no network or upload."""
import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
PREFIX = Path('figflow/0.11.2-edm1')


def prepare(archive, receipt, commit):
    if len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
        raise ValueError('Full reviewed source commit required')
    evidence = json.loads(receipt.read_text())
    if evidence.get('repository_commit') != commit or evidence.get('exit_code') != 0 or evidence.get('mode') != 'web':
        raise ValueError('Successful native CI browser receipt for this source required')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    matches = [item for item in evidence.get('archives', []) if item.get('name') == archive.name]
    if len(matches) != 1 or matches[0].get('sha256') != digest or matches[0].get('size') != archive.stat().st_size:
        raise ValueError('Native archive differs from CI receipt')
    if archive.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('Native archive exceeds release bound')
    target = ROOT / 'dist'
    if target.exists():
        raise ValueError('Owned dist already exists; reconcile its receipt before preparing again')
    with tempfile.TemporaryDirectory(prefix='figflow-assets-') as temporary:
        staging = Path(temporary)
        asset_root = staging / 'assets' / PREFIX
        files = {}
        with zipfile.ZipFile(archive) as package:
            entries = package.infolist()
            if len(entries) > 200 or sum(item.file_size for item in entries) > 96 * 1024 * 1024:
                raise ValueError('Native expanded archive exceeds release bound')
            roots = {PurePosixPath(item.filename).parts[0] for item in entries}
            if len(roots) != 1:
                raise ValueError('Expected one native package directory')
            for item in entries:
                path = PurePosixPath(item.filename)
                if path.is_absolute() or '..' in path.parts or '\\' in item.filename or (item.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('Unsafe native archive path')
                if item.is_dir():
                    continue
                relative = Path(*path.parts[1:])
                if not relative.parts or not re.fullmatch(r'[A-Za-z0-9_./-]+', str(relative)) or item.file_size > 25_165_824 or str(relative) in files:
                    raise ValueError('Invalid or duplicate native asset')
                # Hosting examples are not runtime assets or deployment config.
                if relative.name.startswith('.') or relative.name in ('_headers', '_redirects'):
                    continue
                data = package.read(item)
                destination = asset_root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
                files[str(relative)] = {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        if 'index.html' not in files or 'figflow-edm-relay.mjs' not in files or not any(name.endswith('.wasm') for name in files):
            raise ValueError('Native editor, relay or WASM missing')
        if 'figflow-edm-relay.mjs' not in (asset_root / 'index.html').read_text():
            raise ValueError('Native package does not load its EDM relay')
        result = {'source': commit, 'archiveSha256': digest, 'ciRunId': evidence.get('run_id'), 'prefix': '/' + str(PREFIX) + '/', 'files': files}
        (staging / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
        shutil.copytree(staging, target)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('commit')
    args = parser.parse_args()
    print(json.dumps(prepare(args.archive, args.receipt, args.commit), indent=2))
