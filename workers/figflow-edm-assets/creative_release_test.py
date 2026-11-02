import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('library_release', Path(__file__).with_name('creative-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class LibraryGatewayBoundary(unittest.TestCase):
    def test_candidate_retains_authorization_before_both_private_routes(self):
        modules = release.candidate()
        source = modules['worker.js'].decode()
        auth = source.index('const access = await authorize(request, env)')
        rejected = source.index('if (!access.ok)', auth)
        native = source.index('url.pathname.startsWith("/figflow/0.11.2-edm1/")')
        library = source.index('url.searchParams.get("canvas") !== "1"')
        original_assets = source.index('const assetsResponse = await handleMotorstack(request, env)')
        self.assertLess(auth, rejected)
        self.assertLess(rejected, native)
        self.assertLess(native, library)
        self.assertLess(library, original_assets)
        self.assertEqual(release.transport.sha(modules['brand-rpc.mjs']), release.BASE_HASHES['brand-rpc.mjs'])
        self.assertEqual(source.count('Email library unavailable'), 2)

    def test_current_runtime_inherits_assets_secrets_and_existing_private_binding(self):
        resources = {'script_runtime': {'compatibility_date': '2026-10-27', 'compatibility_flags': ['global_fetch_strictly_public'], 'usage_model': 'standard'}, 'bindings': [
            {'name': 'ASSETS', 'type': 'assets'},
            {'name': 'CREATIVE_AUTH_KEY', 'type': 'secret_text'},
            {'name': 'MOTORSTACK_API_KEY', 'type': 'secret_text'},
            {'name': 'FIGFLOW_EDM_ASSETS', 'type': 'service', 'service': release.SERVICE, 'environment': 'production'}
        ]}
        metadata = release.metadata('a' * 40, resources)
        self.assertTrue(metadata['keep_assets'])
        self.assertEqual(len(metadata['bindings']), 4)
        self.assertTrue(all(item['type'] == 'inherit' for item in metadata['bindings']))
        resources['bindings'][-1]['service'] = 'unrelated-worker'
        with self.assertRaisesRegex(RuntimeError, 'service changed'):
            release.metadata('a' * 40, resources)

    def test_changed_active_gateway_refuses_release(self):
        with patch.object(release.transport, 'request', return_value={'deployments': [{'id': 'changed', 'created_on': '2026-11-02', 'versions': []}]}):
            with self.assertRaisesRegex(RuntimeError, 'reconcile'):
                release.baseline()


if __name__ == '__main__':
    unittest.main()
