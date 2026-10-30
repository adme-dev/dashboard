"""Deterministic update/candidate regressions; no network or editor builds."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
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
        self.assertTrue(result['candidate_ready'])
        self.assertFalse(result['upstream_digest_available'])

    def test_missing_browser_asset_is_reported_without_candidate(self):
        result = updates.check_engine('figcraft', {'version': '0.9.0'}, Metadata([release('0.10.0', assets=[])]))
        self.assertEqual(result['status'], 'available')
        self.assertFalse(result['candidate_ready'])
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
        self.assertFalse(result['candidate_ready'])
        self.assertEqual(result['metadata_changes'], ['source_commit', 'browser_size'])

    def test_annotated_tags_are_bounded_and_resolve_to_exact_commit(self):
        api = updates.GitHub()
        responses = iter([{'object': {'type': 'tag', 'sha': 'b' * 40}}, {'object': {'type': 'commit', 'sha': SHA}}])
        api.api = lambda _: next(responses)
        self.assertEqual(api.commit('figcraft', 'v0.10.0'), SHA)
        api.api = lambda _: {'object': {'type': 'tag', 'sha': 'b' * 40}}
        with self.assertRaises(ValueError):
            api.commit('figcraft', 'v0.10.0')

    def test_api_credentials_never_go_to_asset_downloads(self):
        class Opener:
            def __init__(self): self.requests = []
            def open(self, request, timeout):
                self.requests.append(request)
                return io.BytesIO(b'[]' if request.full_url.startswith('https://api.github.com/') else b'zip')
        api = updates.GitHub('test-only-token')
        api.opener = Opener()
        api.api('/repos/storytold/figcraft/releases')
        with tempfile.TemporaryDirectory() as tmp:
            api.download('https://github.com/storytold/figcraft/releases/download/v1.0.0/figcraft-web-1.0.0.zip', Path(tmp) / 'file.zip')
        self.assertEqual(api.opener.requests[0].get_header('Authorization'), 'Bearer test-only-token')
        self.assertIsNone(api.opener.requests[1].get_header('Authorization'))

    def test_candidate_hashes_lock_and_preserves_live_pins(self):
        lock = b'version = 4\n'
        tar_bytes = io.BytesIO()
        with tarfile.open(fileobj=tar_bytes, mode='w:gz') as tar:
            entry = tarfile.TarInfo('figcraft-' + SHA + '/Cargo.lock')
            entry.size = len(lock)
            tar.addfile(entry, io.BytesIO(lock))
        archive = tar_bytes.getvalue()
        class Downloads:
            def download(self, url, path, expected=None):
                data = archive if url.startswith('https://codeload.github.com/') else b'zip'
                path.write_bytes(data)
                return len(data), hashlib.sha256(data).hexdigest()
        entry = updates.check_engine('figcraft', {'version': '0.9.0'}, Metadata([release('0.10.0')]))
        live_releases = {'figcraft': {'version': '0.9.0'}}
        live_sources = {'figcraft': {'version': '0.9.0', 'branding_patch': 'patches/fig.patch', 'branding_patch_sha256': 'c' * 64}}
        before = json.dumps([live_releases, live_sources], sort_keys=True)
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'candidate'
            self.assertEqual(updates.prepare({'applications': [entry]}, live_releases, live_sources, output, Downloads()), ['figcraft'])
            candidate = json.loads((output / 'candidate.json').read_text())
            source = json.loads((output / 'source-pins.json').read_text())['figcraft']
            pins = json.loads((output / 'releases.json').read_text())['figcraft']
            self.assertFalse(candidate['approved'])
            self.assertEqual(source['cargo_lock_sha256'], hashlib.sha256(lock).hexdigest())
            self.assertEqual(source['source_archive_sha256'], hashlib.sha256(archive).hexdigest())
            self.assertEqual(source['branding_patch'], 'patches/fig.patch')
            self.assertEqual(pins['hosted_version'], '0.10.0-flow1')
            with self.assertRaises(FileExistsError):
                updates.prepare({'applications': []}, live_releases, live_sources, output, Downloads())
        self.assertEqual(json.dumps([live_releases, live_sources], sort_keys=True), before)

    def test_cargo_lock_rejects_links_and_missing_root_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'src.tar.gz'
            with tarfile.open(path, 'w:gz') as tar:
                member = tarfile.TarInfo('figcraft-' + SHA + '/Cargo.lock')
                member.type = tarfile.SYMTYPE
                member.linkname = '/etc/passwd'
                tar.addfile(member)
            with self.assertRaises(ValueError):
                updates.cargo_lock_hash(path, 'figcraft', SHA)


if __name__ == '__main__':
    unittest.main()
