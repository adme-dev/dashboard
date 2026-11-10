import importlib.util
from pathlib import Path
import tempfile
import stat
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('photo_package', Path(__file__).with_name('repair_photo_package.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PhotoPackaging(unittest.TestCase):
    def fixture(self, root, conflict=False, missing=False):
        source = root / 'original.zip'
        prefix = 'photocraft-web-0.22.0/'
        with zipfile.ZipFile(source, 'w') as z:
            z.writestr(prefix + 'app/photocraft-web.js', "import { start } from './snippets/eframe/inline0.js';")
            z.writestr(prefix + 'snippets/eframe/inline0.js', "export const start = 1;" if not missing else "import './missing.js';")
            z.writestr(prefix + 'app/editor.part-aa', b'unchanged-WASM-gzip-part')
            z.writestr(prefix + 'fonts/font.woff2', b'font')
            if conflict:
                z.writestr(prefix + 'app/snippets/eframe/inline0.js', 'conflict')
        return source

    def test_repairs_import_resolution_preserving_all_original_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d).resolve()
            source = self.fixture(root)
            output = root / 'repaired.zip'
            receipt = module.repair(source, output, module.sha(source.read_bytes()))
            self.assertTrue(receipt['missing_imports_before'])
            self.assertEqual(receipt['missing_imports_after'], [])
            self.assertEqual(receipt['unchanged_original_files'], 4)
            with zipfile.ZipFile(source) as a, zipfile.ZipFile(output) as b:
                for name in a.namelist():
                    self.assertEqual(a.read(name), b.read(name))

    def test_refuses_overwrite_checksum_and_conflicting_snippet(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d).resolve()
            source = self.fixture(root, conflict=True)
            digest = module.sha(source.read_bytes())
            with self.assertRaisesRegex(ValueError, 'checksum'):
                module.repair(source, root / 'bad.zip', '0' * 64)
            with self.assertRaisesRegex(ValueError, 'Fresh output'):
                module.repair(source, source, digest)
            with self.assertRaisesRegex(ValueError, 'Conflicting'):
                module.repair(source, root / 'conflict.zip', digest)

    def test_refuses_other_unresolved_imports(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d).resolve()
            source = self.fixture(root, missing=True)
            with self.assertRaisesRegex(ValueError, 'Unresolved'):
                module.repair(source, root / 'bad.zip', module.sha(source.read_bytes()))

    def test_dynamic_import_and_export_from_are_checked(self):
        files = {'app/main.js': b"export { x } from './export.js'; import('./dynamic.js'); import 'https://example.com/remote.js';"}
        self.assertEqual({x['resolved'] for x in module.missing_imports(files)}, {'app/export.js', 'app/dynamic.js'})

    def test_rejects_traversal_and_symlink_members(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d).resolve()
            source = root / 'bad.zip'
            with zipfile.ZipFile(source, 'w') as z:
                z.writestr('../escape.js', 'bad')
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                module.repair(source, root / 'out.zip', module.sha(source.read_bytes()))
            with zipfile.ZipFile(source, 'w') as z:
                info = zipfile.ZipInfo('photocraft-web-0.22.0/linked.js')
                info.external_attr = (stat.S_IFLNK | 0o777) << 16
                z.writestr(info, '/external.js')
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                module.repair(source, root / 'linked.zip', module.sha(source.read_bytes()))

if __name__ == '__main__':
    unittest.main()
