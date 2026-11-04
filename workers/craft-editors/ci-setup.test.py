"""Offline checks for bounded, exact font inputs; no download or compiler required."""
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('setup', Path(__file__).with_name('ci-setup.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class FontInputTests(unittest.TestCase):
    def test_download_rejects_over_budget_and_bad_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            for budget, digest in [(2, hashlib.sha256(b'abc').hexdigest()), (3, '0' * 64)]:
                with patch.object(setup.urllib.request, 'urlopen', return_value=io.BytesIO(b'abc')):
                    with self.assertRaises(ValueError):
                        setup.download('https://example.invalid/font', Path(tmp) / 'font', digest, max_bytes=budget)

    def test_manifest_and_license_are_bound_to_verified_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'fonts').mkdir()
            (root / 'packaging/web').mkdir(parents=True)
            manifest = root / 'fonts/manifest.txt'
            manifest.write_text('# Existing fonts\n')
            pin = {'repository': 'googlefonts/noto-emoji', 'commit': 'pinned',
                   'file': 'fonts/NotoEmoji-Regular.ttf', 'sha256': hashlib.sha256(b'font').hexdigest(), 'bytes': 4,
                   'license_file': 'fonts/LICENSE', 'license_sha256': hashlib.sha256(b'OFL').hexdigest(), 'license_bytes': 3}
            def response(request, timeout):
                return io.BytesIO(b'OFL' if request.full_url.endswith('LICENSE') else b'font')
            with patch.object(setup.urllib.request, 'urlopen', side_effect=response):
                receipt = setup.add_emoji_font(pin, root, root)
                self.assertEqual((root / 'packaging/web/OFL-noto-emoji.txt').read_bytes(), b'OFL')
                self.assertEqual(receipt['manifest_sha256'], setup.digest(manifest))
                self.assertEqual(manifest.read_text().count('Noto Emoji | Regular |'), 1)
                with self.assertRaisesRegex(ValueError, 'Duplicate'):
                    setup.add_emoji_font(pin, root, root)

    def test_truncated_verified_input_is_refused_before_manifest_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'fonts').mkdir()
            (root / 'packaging/web').mkdir(parents=True)
            manifest = root / 'fonts/manifest.txt'
            manifest.write_text('# Existing fonts\n')
            pin = {'repository': 'googlefonts/noto-emoji', 'commit': 'pinned',
                   'file': 'font', 'sha256': hashlib.sha256(b'a').hexdigest(), 'bytes': 2,
                   'license_file': 'license', 'license_sha256': '0' * 64, 'license_bytes': 1}
            with patch.object(setup.urllib.request, 'urlopen', return_value=io.BytesIO(b'a')):
                with self.assertRaisesRegex(ValueError, 'length'):
                    setup.add_emoji_font(pin, root, root)
            self.assertEqual(manifest.read_text(), '# Existing fonts\n')


if __name__ == '__main__':
    unittest.main()
