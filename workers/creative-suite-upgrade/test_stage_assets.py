import json
import os
import shutil
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import stage_assets as subject

NODE = os.environ.get('NODE_BINARY') or shutil.which('node')


@unittest.skipUnless(NODE, 'Node is required for actual Brotli roundtrip tests')
class StagingGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        repo = patch.object(subject, 'REPO', self.base / 'repo')
        repo.start()
        self.addCleanup(repo.stop)
        self.config = self.base / 'config'
        self.config.mkdir()
        self.builds = self.base / 'builds'
        self.builds.mkdir()
        self.output = self.base / 'delta'

    def fixture(self, extra=None):
        archive = self.builds / 'effectcraft-web-1.0.0.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('effectcraft-web-1.0.0/index.html', '<html>candidate</html>')
            for name, data in extra or [('module.wasm', b'\0asm' + b'a' * 10000)]:
                z.writestr('effectcraft-web-1.0.0/' + name, data)
        receipt = {'engine': 'effectcraft', 'exit': 0, 'lock_unchanged': True, 'lock_sha256': 'pinned-lock', 'packages': [{'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': subject.file_sha(archive)}]}
        (self.builds / 'receipt.json').write_text(json.dumps(receipt))
        item = {'scope': '1.0.0-flow1', 'receipt': 'receipt.json', 'receipt_sha256': subject.file_sha(self.builds / 'receipt.json'), 'zip': archive.name, 'zip_bytes': archive.stat().st_size, 'zip_sha256': subject.file_sha(archive)}
        (self.config / 'stage-inputs.json').write_text(json.dumps({'effectcraft': item}))
        (self.config / 'source-pins.json').write_text(json.dumps({'effectcraft': {'version': '1.0.0', 'cargo_lock_sha256': 'pinned-lock'}}))
        return archive

    def run_stage(self):
        subject.stage(self.builds, self.output, NODE, self.config, limit=256)

    def test_compressed_file_route_hashes_and_no_raw_oversize(self):
        self.fixture()
        self.run_stage()
        manifest = json.loads((self.output / 'compressed.json').read_text())
        raw = '/effectflow/1.0.0-flow1/module.wasm'
        self.assertEqual(manifest, {raw: raw + '.br'})
        self.assertFalse((self.output / 'public' / raw.lstrip('/')).exists())
        encoded = self.output / 'public' / (raw + '.br').lstrip('/')
        self.assertLess(encoded.stat().st_size, 256)
        stored = json.loads((self.output / 'stored-assets.json').read_text())[raw + '.br']
        self.assertEqual(stored['sha256'], subject.file_sha(encoded))
        self.assertEqual(stored['decoded_sha256'], subject.sha(b'\0asm' + b'a' * 10000))
        receipt = json.loads((self.output / 'stage-receipt.json').read_text())
        self.assertFalse(receipt['complete_ASSETS_inventory'])
        self.assertFalse(receipt['deployable_in_isolation'])
        with self.assertRaisesRegex(ValueError, 'fresh absolute'):
            self.run_stage()

    def test_modified_zip_refused_before_output(self):
        archive = self.fixture()
        archive.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_stage()
        self.assertFalse(self.output.exists())

    def test_modified_receipt_refused(self):
        self.fixture()
        (self.builds / 'receipt.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_stage()
        self.assertFalse(self.output.exists())

    def test_path_collision_and_traversal_refused(self):
        for extra in [[('../escape', b'x')], [('module.wasm', b'a' * 10000), ('module.wasm.br', b'collision')], [('file', b'x'), ('file/child', b'x')], [('url%2fescape', b'x')]]:
            with self.subTest(extra=extra):
                self.fixture(extra)
                with self.assertRaises(ValueError):
                    self.run_stage()
                self.assertFalse(self.output.exists())

    def test_symlink_member_refused(self):
        archive = self.fixture([('valid', b'x')])
        with zipfile.ZipFile(archive, 'a') as z:
            info = zipfile.ZipInfo('effectcraft-web-1.0.0/link')
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(info, '../../escape')
        with zipfile.ZipFile(archive) as z, self.assertRaisesRegex(ValueError, 'Unsafe ZIP'):
            subject.members(z, 'effectcraft-web-1.0.0')

    def test_expansion_and_non_wasm_size_limits(self):
        self.fixture([('large.txt', b'a' * 300)])
        with self.assertRaisesRegex(ValueError, 'non-WASM'):
            self.run_stage()
        with patch.object(subject, 'MAX_EXPANSION', 10), self.assertRaisesRegex(ValueError, 'expansion'):
            self.run_stage()
        self.assertFalse(self.output.exists())

    def test_unsuccessful_receipt_rejected_even_with_matching_digest(self):
        self.fixture()
        receipt_path = self.builds / 'receipt.json'
        receipt = json.loads(receipt_path.read_text()); receipt['exit'] = 1
        receipt_path.write_text(json.dumps(receipt))
        inputs = json.loads((self.config / 'stage-inputs.json').read_text())
        inputs['effectcraft']['receipt_sha256'] = subject.file_sha(receipt_path)
        (self.config / 'stage-inputs.json').write_text(json.dumps(inputs))
        with self.assertRaisesRegex(ValueError, 'Unsuccessful'):
            self.run_stage()

    def test_compression_over_limit_never_issues_success_receipt(self):
        # Deterministic high-entropy bytes cannot fit the tiny fixture file limit.
        data = b'\0asm' + b''.join(bytes.fromhex(subject.sha(str(i).encode())) for i in range(128))
        self.fixture([('module.wasm', data)])
        with self.assertRaises(subject.subprocess.CalledProcessError):
            self.run_stage()
        self.assertFalse((self.output / 'stage-receipt.json').exists())
        self.assertFalse((self.output / 'public/effectflow/1.0.0-flow1/module.wasm').exists())
        self.assertFalse((self.output / 'public/effectflow/1.0.0-flow1/module.wasm.br').exists())

    def test_bad_scope_rejected(self):
        self.fixture()
        inputs = json.loads((self.config / 'stage-inputs.json').read_text())
        inputs['effectcraft']['scope'] = '../live'
        (self.config / 'stage-inputs.json').write_text(json.dumps(inputs))
        with self.assertRaisesRegex(ValueError, 'scope'):
            self.run_stage()


if __name__ == '__main__':
    unittest.main()
