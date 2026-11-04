import hashlib
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('gateway', ROOT / 'edm5-gateway.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class GatewayPreservation(unittest.TestCase):
    def test_only_authenticated_prefix_condition_changes(self):
        manifest = gateway.build()
        original = (gateway.SOURCE.parent / 'dist/worker.js').read_bytes()
        new = (ROOT / 'gateway-dist/worker.js').read_bytes()
        before = b'url.pathname.startsWith("/figflow/0.11.2-edm1/")'
        edm4 = b'["/figflow/0.11.2-edm1/", "/figflow/0.11.2-edm3/", "/figflow/0.11.2-edm4/"].some(prefix => url.pathname.startsWith(prefix))'
        edm5 = b'["/figflow/0.11.2-edm1/", "/figflow/0.11.2-edm3/", "/figflow/0.11.2-edm4/", "/figflow/0.11.2-edm5/"].some(prefix => url.pathname.startsWith(prefix))'
        live = original.replace(before, edm4)
        self.assertEqual(hashlib.sha256(live).hexdigest(), manifest['baseline']['modules']['worker.js'])
        self.assertEqual(new.count(edm5), 1)
        self.assertEqual(new.replace(edm5, edm4), live)
        self.assertLess(new.index(b'if (!access.ok)'), new.index(edm5))
        self.assertLess(new.index(edm5), new.index(b'const assetsResponse = await handleMotorstack(request, env)'))
        self.assertEqual((ROOT / 'gateway-dist/brand-rpc.mjs').read_bytes(), (gateway.SOURCE.parent / 'dist/brand-rpc.mjs').read_bytes())
        self.assertTrue(manifest['keep_assets'])


if __name__ == '__main__':
    unittest.main()
