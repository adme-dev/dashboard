import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('bundle', ROOT / 'prepare-bundle.py')
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class AdditiveBundle(unittest.TestCase):
    def fixture(self, root):
        base = root / 'base'
        files = {'index.html': b'<script src="figflow-edm-relay.mjs"></script>', 'figflow-edm-relay.mjs': b'// relay', 'editor.wasm': b'\0asm'}
        metadata = {name: {'size': len(content), 'sha256': hashlib.sha256(content).hexdigest()} for name, content in files.items()}
        pins = {'legacy': {'source': 'a' * 40, 'ciRunId': '1', 'archiveSha256': 'b' * 64, 'prefix': '/figflow/0.11.2-edm1/', 'files': metadata}, 'packages': {}}
        versions = {'0.11.2-edm1': pins['legacy']}
        for number in [1, 3, 4]:
            version = f'0.11.2-edm{number}'
            assets = base / 'assets/figflow' / version
            assets.mkdir(parents=True)
            for name, content in files.items():
                (assets / name).write_bytes(content)
            if number != 1:
                pins['packages'][version] = {'source': str(number) * 40, 'ciRunId': str(number), 'archiveSha256': str(number) * 64, 'files': metadata}
                versions[version] = {**pins['packages'][version], 'prefix': f'/figflow/{version}/'}
        (base / 'receipt.json').write_text(json.dumps({'schemaVersion': 2, 'versions': versions}))

        version = '0.11.2-edm5'
        archive = root / f'figcraft-web-{version}.zip'
        with zipfile.ZipFile(archive, 'w') as package:
            for name, content in files.items():
                package.writestr(f'figcraft-web-{version}/{name}', content)
        receipt = root / '5.json'
        receipt.write_text(json.dumps({'repository_commit': '5' * 40, 'exit_code': 0, 'mode': 'web', 'run_id': '5', 'archives': [{'name': archive.name, 'size': archive.stat().st_size, 'sha256': bundle.sha(archive)}]}))
        pins['packages'][version] = {'source': '5' * 40, 'ciRunId': '5', 'archiveSha256': bundle.sha(archive), 'files': metadata}
        (root / 'publication.json').write_text(json.dumps(pins))
        bundle.ROOT = root
        return base, {version: (archive, receipt)}

    def test_preserves_base_and_adds_edm5_without_overwriting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base, packages = self.fixture(root)
            result = bundle.prepare_bundle(base, packages)
            self.assertEqual(set(result['versions']), {'0.11.2-edm1', '0.11.2-edm3', '0.11.2-edm4', '0.11.2-edm5'})
            self.assertEqual((root / 'dist-edm5/assets/figflow/0.11.2-edm1/editor.wasm').read_bytes(), b'\0asm')
            self.assertEqual((root / 'dist-edm5/assets/figflow/0.11.2-edm5/editor.wasm').read_bytes(), b'\0asm')
            with self.assertRaisesRegex(ValueError, 'already exists'):
                bundle.prepare_bundle(base, packages)

    def test_refuses_changed_base_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base, packages = self.fixture(root)
            (base / 'assets/figflow/0.11.2-edm1/editor.wasm').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'bytes differ'):
                bundle.prepare_bundle(base, packages)
            self.assertFalse((root / 'dist-edm5').exists())

    def test_refuses_missing_version_and_unreviewed_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base, packages = self.fixture(root)
            with self.assertRaisesRegex(ValueError, 'edm5 package is required'):
                bundle.prepare_bundle(base, {})
            with packages['0.11.2-edm5'][0].open('ab') as output:
                output.write(b'changed')
            with self.assertRaisesRegex(ValueError, 'reviewed immutable'):
                bundle.prepare_bundle(base, packages)
            self.assertFalse((root / 'dist-edm5').exists())


if __name__ == '__main__':
    unittest.main()
