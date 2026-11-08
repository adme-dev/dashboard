"""Add the pinned edm5 archive to a verified edm1/edm3/edm4 bundle; never upload."""
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


def validate_base(base, pins):
    receipt = json.loads((base / 'receipt.json').read_text())
    expected = {'0.11.2-edm1': pins['legacy']}
    expected.update({version: {**pins['packages'][version], 'prefix': f'/figflow/{version}/'} for version in ('0.11.2-edm3', '0.11.2-edm4')})
    if receipt != {'schemaVersion': 2, 'versions': expected}:
        raise ValueError('Base receipt differs from the reviewed edm1/edm3/edm4 inventory')
    files = {str(p.relative_to(base / 'assets')): p for p in (base / 'assets').rglob('*') if p.is_file()}
    if any(p.is_symlink() for p in (base / 'assets').rglob('*')):
        raise ValueError('Base asset inventory contains a symlink')
    expected_files = {f'figflow/{version}/{name}' for version, item in expected.items() for name in item['files']}
    if set(files) != expected_files:
        raise ValueError('Base asset inventory differs')
    for version, item in expected.items():
        for name, metadata in item['files'].items():
            path = files[f'figflow/{version}/{name}']
            if path.stat().st_size != metadata['size'] or sha(path) != metadata['sha256']:
                raise ValueError('Base asset bytes differ')
    return receipt


def prepare_bundle(base, packages, output=None):
    pins = json.loads((ROOT / 'publication.json').read_text())
    output = output or ROOT / 'dist-edm5'
    if output.exists():
        raise ValueError('Owned output already exists; preserve and reconcile it')
    current = validate_base(base, pins)
    if set(packages) != {'0.11.2-edm5'}:
        raise ValueError('Exact reviewed edm5 package is required')
    with tempfile.TemporaryDirectory(prefix='figflow-bundle-') as temporary:
        staging = Path(temporary)
        shutil.copytree(base / 'assets', staging / 'assets')
        versions = dict(current['versions'])
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
    parser.add_argument('base', type=Path)
    parser.add_argument('edm5_archive', type=Path)
    parser.add_argument('edm5_receipt', type=Path)
    args = parser.parse_args()
    result = prepare_bundle(args.base, {'0.11.2-edm5': (args.edm5_archive, args.edm5_receipt)})
    print(json.dumps({version: {k: v for k, v in receipt.items() if k != 'files'} for version, receipt in result['versions'].items()}, indent=2))
