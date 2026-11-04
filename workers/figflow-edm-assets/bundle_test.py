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
        legacy = root / 'legacy'
        assets = legacy / 'assets/figflow/0.11.2-edm1'
        assets.mkdir(parents=True)
        data = b'legacy bytes'
        (assets / 'editor.wasm').write_bytes(data)
        old = {'source': 'a' * 40, 'ciRunId': '1', 'archiveSha256': 'b' * 64, 'prefix': '/figflow/0.11.2-edm1/', 'files': {'editor.wasm': {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}}}
        (legacy / 'receipt.json').write_text(json.dumps(old))
        pins = {'legacyReceiptSha256': bundle.sha(legacy / 'receipt.json'), 'packages': {}}
        packages = {}
        for number in [3, 4]:
            version = f'0.11.2-edm{number}'
            archive = root / f'figcraft-web-{version}.zip'
            files = {'index.html': b'<script src="figflow-edm-relay.mjs"></script>', 'figflow-edm-relay.mjs': b'// relay', 'editor.wasm': b'\0asm'}
            with zipfile.ZipFile(archive, 'w') as package:
                for name, content in files.items():
                    package.writestr(f'figcraft-web-{version}/{name}', content)
            receipt = root / f'{number}.json'
            receipt.write_text(json.dumps({'repository_commit': str(number) * 40, 'exit_code': 0, 'mode': 'web', 'run_id': str(number), 'archives': [{'name': archive.name, 'size': archive.stat().st_size, 'sha256': bundle.sha(archive)}]}))
            pins['packages'][version] = {'source': str(number) * 40, 'ciRunId': str(number), 'archiveSha256': bundle.sha(archive), 'files': {name: {'size': len(content), 'sha256': hashlib.sha256(content).hexdigest()} for name, content in files.items()}}
            packages[version] = (archive, receipt)
        (root / 'publication.json').write_text(json.dumps(pins))
        bundle.ROOT = root
        return legacy, packages

    def test_preserves_all_versions_and_refuses_existing_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            legacy, packages = self.fixture(root)
            result = bundle.prepare_bundle(legacy, packages)
            self.assertEqual(set(result['versions']), {'0.11.2-edm1', '0.11.2-edm3', '0.11.2-edm4'})
            self.assertEqual((root / 'dist/assets/figflow/0.11.2-edm1/editor.wasm').read_bytes(), b'legacy bytes')
            with self.assertRaisesRegex(ValueError, 'already exists'):
                bundle.prepare_bundle(legacy, packages)

    def test_refuses_changed_legacy_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            legacy, packages = self.fixture(root)
            (legacy / 'assets/figflow/0.11.2-edm1/editor.wasm').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'bytes differ'):
                bundle.prepare_bundle(legacy, packages)
            self.assertFalse((root / 'dist').exists())

    def test_refuses_missing_version_and_unreviewed_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            legacy, packages = self.fixture(root)
            with self.assertRaisesRegex(ValueError, 'Both accepted'):
                bundle.prepare_bundle(legacy, {'0.11.2-edm4': packages['0.11.2-edm4']})
            with packages['0.11.2-edm4'][0].open('ab') as output:
                output.write(b'changed')
            with self.assertRaisesRegex(ValueError, 'reviewed immutable'):
                bundle.prepare_bundle(legacy, packages)
            self.assertFalse((root / 'dist').exists())


if __name__ == '__main__':
    unittest.main()
