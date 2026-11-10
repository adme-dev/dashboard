import hashlib
from pathlib import Path
import subprocess
import tempfile
import unittest


class VerifiedReuse(unittest.TestCase):
    def test_reused_compressed_bytes_must_decode_to_current_input(self):
        script = Path(__file__).with_name('brotli-stage.mjs')
        raw = b'WASM fixture payload' * 100
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            first, reused, refused = root / 'first.br', root / 'reused.br', root / 'refused.br'
            subprocess.run(['node', str(script), str(first), '100000'], input=raw, check=True, capture_output=True)
            subprocess.run(['node', str(script), str(reused), '100000', str(first)], input=raw, check=True, capture_output=True)
            self.assertEqual(hashlib.sha256(first.read_bytes()).digest(), hashlib.sha256(reused.read_bytes()).digest())
            result = subprocess.run(['node', str(script), str(refused), '100000', str(first)], input=b'different payload', capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(refused.exists())
