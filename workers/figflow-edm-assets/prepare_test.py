import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('prepare_native_assets', Path(__file__).with_name('prepare.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class ArchiveBoundary(unittest.TestCase):
    def fixture(self, root, extra=None):
        archive = root / 'native.zip'
        with zipfile.ZipFile(archive, 'w') as package:
            for name, data in {
                'native/index.html': '<script type="module" src="./figflow-edm-relay.mjs"></script>',
                'native/figflow-edm-relay.mjs': '/* synthetic */',
                'native/editor.wasm': b'\x00asm',
                **(extra or {})
            }.items():
                package.writestr(name, data)
        receipt = root / 'receipt.json'
        receipt.write_text(json.dumps({'repository_commit': 'a' * 40, 'exit_code': 0, 'mode': 'web', 'run_id': '123', 'archives': [{
            'name': archive.name, 'size': archive.stat().st_size,
            'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()
        }]}))
        return archive, receipt

    def test_preserves_verified_package_and_refuses_replacement(self):
        with tempfile.TemporaryDirectory(prefix='figflow-archive-test-') as temp:
            root = Path(temp)
            prepare.ROOT = root
            archive, receipt = self.fixture(root)
            result = prepare.prepare(archive, receipt, 'a' * 40)
            self.assertEqual(result['ciRunId'], '123')
            self.assertEqual((root / 'dist/assets/figflow/0.11.2-edm1/editor.wasm').read_bytes(), b'\x00asm')
            with self.assertRaisesRegex(ValueError, 'already exists'):
                prepare.prepare(archive, receipt, 'a' * 40)

    def test_rejects_archive_traversal_without_writing_output(self):
        with tempfile.TemporaryDirectory(prefix='figflow-archive-test-') as temp:
            root = Path(temp)
            prepare.ROOT = root
            archive, receipt = self.fixture(root, {'native/../../escape': 'bad'})
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                prepare.prepare(archive, receipt, 'a' * 40)
            self.assertFalse((root / 'dist').exists())

    def test_rejects_wrong_source_or_tampered_archive(self):
        with tempfile.TemporaryDirectory(prefix='figflow-archive-test-') as temp:
            root = Path(temp)
            prepare.ROOT = root
            archive, receipt = self.fixture(root)
            with self.assertRaisesRegex(ValueError, 'this source'):
                prepare.prepare(archive, receipt, 'b' * 40)
            with archive.open('ab') as file:
                file.write(b'changed')
            with self.assertRaisesRegex(ValueError, 'differs'):
                prepare.prepare(archive, receipt, 'a' * 40)


if __name__ == '__main__':
    unittest.main()
