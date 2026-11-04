"""Prepare an additive, pinned edm1/edm3/edm4 asset inventory; never upload."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('native_prepare', ROOT / 'prepare.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare_bundle(legacy, packages, output=None):
    pins = json.loads((ROOT / 'publication.json').read_text())
    output = output or ROOT / 'dist'
    if output.exists():
        raise ValueError('Owned output already exists; preserve and reconcile it')
    old = json.loads((legacy / 'receipt.json').read_text())
    if sha(legacy / 'receipt.json') != pins['legacyReceiptSha256']:
        raise ValueError('Legacy inventory receipt differs from reviewed baseline')
    prefix = 'figflow/0.11.2-edm1/'
    old_files = {str(p.relative_to(legacy / 'assets')): p for p in (legacy / 'assets').rglob('*') if p.is_file()}
    if set(old_files) != {prefix + name for name in old['files']} or any(p.is_symlink() for p in (legacy / 'assets').rglob('*')):
        raise ValueError('Legacy asset inventory differs')
    for name, metadata in old['files'].items():
        p = old_files[prefix + name]
        if p.stat().st_size != metadata['size'] or sha(p) != metadata['sha256']:
            raise ValueError('Legacy asset bytes differ')
    if set(packages) != {'0.11.2-edm3', '0.11.2-edm4'}:
        raise ValueError('Both accepted additional packages are required')
    with tempfile.TemporaryDirectory(prefix='figflow-bundle-') as temporary:
        staging = Path(temporary)
        shutil.copytree(legacy / 'assets', staging / 'assets')
        versions = {'0.11.2-edm1': old}
        for version, (archive, receipt) in packages.items():
            pin = pins['packages'][version]
            evidence = json.loads(receipt.read_text())
            if archive.name != f'figcraft-web-{version}.zip' or sha(archive) != pin['archiveSha256'] or evidence.get('run_id') != pin['ciRunId']:
                raise ValueError('Package is not the reviewed immutable candidate')
            prepared = native.prepare(archive, receipt, pin['source'], Path('figflow') / version, staging / version)
            if prepared != {**pin, 'prefix': f'/figflow/{version}/'}:
                raise ValueError('Prepared package inventory differs from reviewed bytes')
            shutil.move(str(staging / version / 'assets/figflow' / version), staging / 'assets/figflow' / version)
            shutil.rmtree(staging / version)
            versions[version] = prepared
        result = {'schemaVersion': 2, 'versions': versions}
        (staging / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
        shutil.copytree(staging, output)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('legacy', type=Path)
    parser.add_argument('edm3_archive', type=Path)
    parser.add_argument('edm3_receipt', type=Path)
    parser.add_argument('edm4_archive', type=Path)
    parser.add_argument('edm4_receipt', type=Path)
    args = parser.parse_args()
    result = prepare_bundle(args.legacy, {'0.11.2-edm3': (args.edm3_archive, args.edm3_receipt), '0.11.2-edm4': (args.edm4_archive, args.edm4_receipt)})
    print(json.dumps({version: {k: v for k, v in receipt.items() if k != 'files'} for version, receipt in result['versions'].items()}, indent=2))
