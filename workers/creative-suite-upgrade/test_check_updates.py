"""Deterministic update/candidate regressions; no network or editor builds."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('updates', Path(__file__).with_name('check-updates.py'))
updates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updates)
SHA = 'a' * 40


def release(number, **extra):
    tag = 'v' + number
    name = 'figcraft-web-' + number + '.zip'
    return {'tag_name': tag, 'draft': False, 'prerelease': False,
            'assets': [{'name': name, 'size': 3, 'digest': None,
                        'browser_download_url': 'https://github.com/storytold/figcraft/releases/download/' + tag + '/' + name}], **extra}


class Metadata:
    def __init__(self, releases):
        self.releases = releases
    def api(self, path):
        return self.releases
    def commit(self, engine, tag):
        return SHA


class Checks(unittest.TestCase):
    def test_semver_uses_numeric_components_and_rejects_prereleases(self):
        self.assertGreater(updates.version('v0.10.0'), updates.version('0.9.99'))
        self.assertEqual(updates.version('v1.2.3+build.4'), (1, 2, 3))
        for value in ('v1.2.3-rc.1', '1.2', '1.02.3', 'main', '../1.2.3'):
            self.assertIsNone(updates.version(value))

    def test_highest_stable_release_ignores_prerelease_and_draft(self):
        data = Metadata([release('0.9.0'), release('0.10.0'), release('9.0.0', draft=True), release('8.0.0', prerelease=True)])
        result = updates.check_engine('figcraft', {'version': '0.9.0'}, data)
        self.assertEqual(result['latest_version'], '0.10.0')
        self.assertEqual(result['status'], 'available')
        self.assertEqual(result['source_commit'], SHA)
        self.assertTrue(result['browser_asset_identified'])
        self.assertFalse(result['upstream_digest_available'])

    def test_missing_browser_asset_is_reported_without_candidate(self):
        result = updates.check_engine('figcraft', {'version': '0.9.0'}, Metadata([release('0.10.0', assets=[])]))
        self.assertEqual(result['status'], 'available')
        self.assertFalse(result['browser_asset_identified'])
        self.assertIsNone(result['browser_asset'])

    def test_untrusted_asset_urls_invalid_digests_and_metadata_refused(self):
        for field, value in [('browser_download_url', 'http://localhost/evil.zip'), ('digest', 'sha256:bad'), ('size', True)]:
            item = release('0.10.0')
            item['assets'][0][field] = value
            with self.assertRaises(ValueError):
                updates.check_engine('figcraft', {'version': '0.9.0'}, Metadata([item]))
        with self.assertRaises(ValueError):
            updates.check_engine('figcraft', {'version': '0.9.0'}, Metadata(['invalid']))

    def test_same_version_revision_or_asset_change_is_not_up_to_date(self):
        pin = {'version': '0.10.0', 'commit': 'b' * 40, 'size': 9}
        result = updates.check_engine('figcraft', pin, Metadata([release('0.10.0')]))
        self.assertEqual(result['status'], 'pinned_release_changed')
        self.assertFalse(result['browser_asset_identified'])
        self.assertEqual(result['metadata_changes'], ['source_commit', 'browser_size'])

    def test_annotated_tags_are_bounded_and_resolve_to_exact_commit(self):
        api = updates.GitHub()
        responses = iter([{'object': {'type': 'tag', 'sha': 'b' * 40}}, {'object': {'type': 'commit', 'sha': SHA}}])
        api.api = lambda _: next(responses)
        self.assertEqual(api.commit('figcraft', 'v0.10.0'), SHA)
        api.api = lambda _: {'object': {'type': 'tag', 'sha': 'b' * 40}}
        with self.assertRaises(ValueError):
            api.commit('figcraft', 'v0.10.0')


    def test_candidate_schema_requires_six_unpublished_pins(self):
        pins = updates.load_candidates(Path(__file__).with_name('upstream-releases.json'))
        self.assertEqual(set(pins), set(updates.ENGINES))
        for change in ('missing', 'version', 'status', 'commit', 'digest', 'size', 'candidate_version', 'browser_download_url', 'hosted_version'):
            data = json.loads(json.dumps(pins))
            if change == 'missing':
                del data['figcraft']
            else:
                data['figcraft'][change] = True
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'pins.json'
                path.write_text(json.dumps(data))
                with self.assertRaises(ValueError, msg=change):
                    updates.load_candidates(path)

    def test_malformed_flags_and_tags_rejected(self):
        for field, value in [('draft', 'false'), ('prerelease', None), ('tag_name', 123)]:
            with self.assertRaises(ValueError):
                updates.check_engine('figcraft', {'version': '0.9.0'}, Metadata([release('0.10.0', **{field: value})]))

    def test_missing_and_ambiguous_browser_asset(self):
        item = release('0.10.0')
        item['assets'] *= 2
        result = updates.check_engine('figcraft', {'version': '0.9.0'}, Metadata([item]))
        self.assertFalse(result['browser_asset_identified'])

    def test_failures_are_redacted_and_other_engines_continue(self):
        pins = updates.load_candidates(Path(__file__).with_name('upstream-releases.json'))
        class Broken:
            def api(self, path):
                raise ValueError('secret-provider-body')
        report, failed = updates.collect(pins, Broken())
        self.assertTrue(failed)
        self.assertEqual(len(report['applications']), 6)
        self.assertNotIn('secret-provider-body', json.dumps(report))
        self.assertEqual(report['baseline_kind'], 'original_upstream_source_inputs_not_deployed_receipt')
        self.assertIn('not the deployed', updates.summary(report))

    def test_api_credentials_and_redirects_are_confined(self):
        class Opener:
            def open(self, request, timeout):
                self.request = request
                return io.BytesIO(b'[]')
        api = updates.GitHub('test-token')
        api.opener = Opener()
        api.api('/repos/storytold/figcraft/releases')
        self.assertEqual(api.opener.request.get_header('Authorization'), 'Bearer test-token')
        with self.assertRaises(ValueError):
            api.api('/repos/other/project/releases')
        request = updates.urllib.request.Request('https://api.github.com/repos/storytold/figcraft/releases')
        redirect = updates.SameHostRedirect()
        for url in ('http://api.github.com/path', 'https://evil.example/path', 'https://api.github.com:8443/path'):
            with self.assertRaises(ValueError):
                redirect.redirect_request(request, None, 302, 'Found', {}, url)

    def test_invalid_input_still_writes_failure_report(self):
        from contextlib import redirect_stdout
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'report.json'
            with redirect_stdout(io.StringIO()):
                code = updates.main(['--pins', str(Path(tmp) / 'absent'), '--report', str(path)])
            self.assertEqual(code, 1)
            self.assertEqual(json.loads(path.read_text())['input_error'], 'FileNotFoundError')

    def test_missing_same_version_asset_is_a_changed_release(self):
        result = updates.check_engine('figcraft', {'version': '0.10.0'}, Metadata([release('0.10.0', assets=[])]))
        self.assertEqual(result['status'], 'pinned_release_changed')

    def test_configured_routes_are_separate_from_candidate_pins(self):
        path = Path(__file__).resolve().parents[1] / 'creative-launcher-card-release/source/worker.js'
        baseline = updates.load_configured_routes(path)
        self.assertEqual(set(baseline['applications']), set(updates.ENGINES))
        self.assertIn('not_runtime_acceptance', baseline['kind'])
        self.assertEqual(baseline['applications']['figcraft']['configured_route'], '/figflow/0.11.2-flow1/')
        pins = updates.load_candidates(Path(__file__).with_name('upstream-releases.json'))
        self.assertNotEqual(pins['figcraft']['version'], baseline['applications']['figcraft']['upstream_version'])
        with tempfile.TemporaryDirectory() as tmp:
            invalid = Path(tmp) / 'worker.js'
            invalid.write_text('var app_routes_default = {};')
            with self.assertRaises(ValueError):
                updates.load_configured_routes(invalid)


    def test_published_baseline_uses_six_live_selections_and_retains_provenance(self):
        path = Path(__file__).resolve().parents[1] / 'creative-suite-release/published-release.json'
        baseline = updates.load_published_release(path)
        self.assertEqual(baseline['kind'], 'published_release_receipt_not_runtime_recheck')
        self.assertEqual(baseline['applications']['photocraft']['configured_route'], '/photoflow/0.22.0-flow2/')
        self.assertEqual(baseline['applications']['filmcraft']['configured_route'], '/filmflow/0.19.0-flow2/')
        self.assertEqual(baseline['applications']['figcraft']['upstream_version'], '0.17.0')
        self.assertEqual(baseline['specialised_figflow_email'], '0.11.2-edm5')
        self.assertEqual(baseline['source_commit'], '9ac1d65c399f0bf5c003b96530d4dcdcd4309129')

    def test_published_receipt_rejects_unpublished_incomplete_or_cross_app_routes(self):
        path = Path(__file__).resolve().parents[1] / 'creative-suite-release/published-release.json'
        for change in ('status', 'source', 'missing', 'cross_app', 'version', 'gateway', 'null_target', 'list_target'):
            data = json.loads(path.read_text())
            if change == 'status': data['status'] = 'prepared'
            if change == 'source': data['source_commit'] = 'main'
            if change == 'missing': del data['routes']['figcraft']
            if change == 'cross_app': data['routes']['figcraft'] = data['routes']['photocraft']
            if change == 'version': data['routes']['figcraft'] = '/figflow/latest/'
            if change == 'gateway': data['gateway']['version'] = 'pending'
            if change == 'null_target': data['gateway'] = None
            if change == 'list_target': data['assets'] = []
            with tempfile.TemporaryDirectory() as tmp:
                invalid = Path(tmp) / 'release.json'; invalid.write_text(json.dumps(data))
                with self.assertRaises(ValueError, msg=change): updates.load_published_release(invalid)

    def test_summary_labels_published_receipt_without_claiming_runtime_recheck(self):
        path = Path(__file__).resolve().parents[1] / 'creative-suite-release/published-release.json'
        baseline = updates.load_published_release(path)
        report = {'applications': [], 'configured_route_baseline': baseline}
        text = updates.summary(report)
        self.assertIn('Published release receipt', text)
        self.assertIn('does not re-run hosted acceptance', text)
        self.assertIn('0.11.2-edm5', text)


if __name__ == '__main__':
    unittest.main()
