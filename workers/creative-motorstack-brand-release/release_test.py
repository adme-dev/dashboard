import importlib.util
import json
import shutil
import tempfile
from types import SimpleNamespace
from pathlib import Path
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('release.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

class ReleaseGuards(unittest.TestCase):
    def setUp(self):
        self.manifest = r.local_manifest()
        self.evidence = json.loads((r.ROOT / 'source/verification.json').read_text())
        self.calls = []
    def fake(self, path, *args, **kwargs):
        self.calls.append((path,args))
        if path == '/deployments': return {'deployments': [{'id': self.manifest['baseDeployment'], 'created_on':'2026-10-30', 'versions':[{'version_id':self.manifest['baseVersion'],'percentage':100}]}]}
        if path == '/versions': return {'items':[{'id':self.manifest['baseVersion'],'metadata':{'created_on':'2026-10-30'}}]}
        if path.startswith('/versions/'): return {'resources': {'bindings':self.evidence['versionMetadata'][0]['bindings'], 'script_runtime':self.evidence['versionMetadata'][0]['runtime'], 'script':self.evidence['versionMetadata'][0]['script']}}
        self.fail('Unexpected request ' + path)
    def test_verified_baseline_readonly(self):
        with patch.object(r,'request',self.fake), patch.object(r,'module_hashes',return_value={'worker.js':self.manifest['baseSha256']}):
            r.verify_baseline(self.manifest)
        self.assertTrue(all(not args for _,args in self.calls))
    def test_new_latest_version_rejects_inherit_even_if_current_deployment_unchanged(self):
        def fake(path,*args,**kw):
            if path == '/versions': return {'items':[{'id':'some-other-upload','metadata':{'created_on':'2026-10-31'}}]}
            return self.fake(path,*args,**kw)
        with patch.object(r,'request',fake), self.assertRaisesRegex(RuntimeError,'Latest uploaded'):
            r.verify_baseline(self.manifest)
    def test_changed_live_deployment_rejected(self):
        changed = {**self.manifest, 'baseDeployment':'stale'}
        with patch.object(r,'request',self.fake), self.assertRaisesRegex(RuntimeError,'Active deployment'):
            r.verify_baseline(changed)
    def test_asset_config_or_binding_drift_rejected(self):
        for change in ['runtime','bindings']:
            def fake(path,*args,**kw):
                res=self.fake(path,*args,**kw)
                if change == 'runtime': res['resources']['script_runtime']={'compatibility_date':'2026-10-27'}
                else: res['resources']['bindings']=[]
                return res
            with patch.object(r,'request',fake), self.assertRaisesRegex(RuntimeError,'Bindings or complete runtime'):
                r.verify_runtime(self.manifest['baseVersion'])
    def test_current_source_hash_drift_rejected(self):
        with patch.object(r,'request',self.fake), patch.object(r,'module_hashes',return_value={'worker.js':'different'}), self.assertRaisesRegex(RuntimeError,'Latest baseline source'):
            r.verify_baseline(self.manifest)
    def test_metadata_preserves_assets_and_exact_secret_bindings(self):
        meta=r.metadata('a'*40)
        self.assertTrue(meta['keep_assets']); self.assertNotIn('assets',meta)
        self.assertEqual(meta['bindings'],[{'name':n,'type':'inherit'} for n in ['ASSETS','CREATIVE_AUTH_KEY','MOTORSTACK_API_KEY']])
        body,mime=r.multipart(meta)
        self.assertIn(b'brand-rpc.mjs',body); self.assertIn(b'cloudflare:workers',body)
        self.assertTrue(mime.startswith('multipart/form-data;'))
    def test_stale_ignored_dist_is_rebuilt_from_current_helper_source(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'release'
            shutil.copytree(r.ROOT, folder, ignore=shutil.ignore_patterns('__pycache__', '*-receipt.json'))
            helper = folder / 'brand-rpc.mjs'
            helper.write_text(helper.read_text() + '\n// Current reviewed source fixture.\n')
            before = json.loads((folder / 'dist/manifest.json').read_text())
            with patch.object(r, 'ROOT', folder):
                after = r.local_manifest()
            self.assertNotEqual(before['modules']['brand-rpc.mjs'], after['modules']['brand-rpc.mjs'])
            self.assertEqual((folder / 'dist/brand-rpc.mjs').read_bytes(), helper.read_bytes())
            self.assertEqual(after['modules']['brand-rpc.mjs'], r.sha(helper.read_bytes()))
    def test_tampered_dist_and_self_consistent_manifest_are_not_accepted(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'release'
            shutil.copytree(r.ROOT, folder, ignore=shutil.ignore_patterns('__pycache__', '*-receipt.json'))
            worker = folder / 'dist/worker.js'; worker.write_text('stale candidate')
            manifest = json.loads((folder / 'dist/manifest.json').read_text())
            manifest['modules']['worker.js'] = r.sha(worker.read_bytes())
            (folder / 'dist/manifest.json').write_text(json.dumps(manifest))
            with patch.object(r, 'ROOT', folder):
                after = r.local_manifest()
            self.assertEqual(after['modules']['worker.js'], self.manifest['modules']['worker.js'])
    def test_current_main_and_clean_source_guards(self):
        commit = 'a' * 40
        def git_reply(args, **kwargs):
            command = args[3:]
            if command[:2] == ['rev-parse', 'HEAD'] or command[:2] == ['rev-parse', 'origin/main']:
                output = commit
            elif command[0] == 'ls-remote': output = commit + '\trefs/heads/main'
            elif command[0] == 'status': output = ''
            else: self.fail('Unexpected git command')
            return SimpleNamespace(returncode=0, stdout=output)
        with patch.object(r.subprocess, 'run', git_reply): r.verify_source_commit(commit)
        for scenario in ['local', 'remote', 'dirty']:
            def mismatch(args, **kwargs):
                result = git_reply(args, **kwargs)
                if scenario == 'local' and args[3:] == ['rev-parse', 'origin/main']: result.stdout = 'b' * 40
                if scenario == 'remote' and args[3] == 'ls-remote': result.stdout = 'b' * 40 + '\trefs/heads/main'
                if scenario == 'dirty' and args[3] == 'status': result.stdout = ' M brand-rpc.mjs'
                return result
            with patch.object(r.subprocess, 'run', mismatch), self.assertRaises(RuntimeError):
                r.verify_source_commit(commit)
    def test_post_upload_baseline_uses_immutable_version_metadata_not_latest_content(self):
        candidate = 'new-candidate'
        def fake(path, *args, **kwargs):
            if path == '/versions': return {'items': [{'id': candidate, 'metadata': {'created_on': '2026-10-31'}}]}
            return self.fake(path, *args, **kwargs)
        with patch.object(r, 'request', fake), patch.object(r, 'module_hashes', side_effect=AssertionError('Cannot download old version content')):
            r.verify_baseline(self.manifest, latest_expected=candidate)
    def test_immutable_baseline_script_etag_drift_fails(self):
        def fake(path, *args, **kwargs):
            result = self.fake(path, *args, **kwargs)
            if path.startswith('/versions/'):
                result['resources']['script'] = {'etag': 'unexpected'}
            return result
        with patch.object(r, 'request', fake), self.assertRaisesRegex(RuntimeError, 'script etag changed'):
            r.verify_runtime(self.manifest['baseVersion'])
    def test_latest_source_download_has_no_version_selector_and_is_bracketed(self):
        meta = r.metadata('a' * 40)
        body, mime = r.multipart(meta)
        # Real content downloads contain modules only, not upload metadata.
        from email.parser import BytesParser
        from email.policy import default
        parsed = BytesParser(policy=default).parsebytes(b'Content-Type: ' + mime.encode() + b'\r\n\r\n' + body)
        parts = []
        for part in parsed.iter_parts():
            if part.get_filename():
                parts.append(b'--test\r\nContent-Disposition: form-data; name="' + part.get_filename().encode() + b'"; filename="' + part.get_filename().encode() + b'"\r\n\r\n' + part.get_payload(decode=True) + b'\r\n')
        content = b''.join(parts) + b'--test--\r\n'
        with patch.object(r, 'latest_version', side_effect=['candidate', 'candidate']), patch.object(r, 'request', return_value=(content, 'multipart/form-data; boundary=test')) as request:
            self.assertEqual(r.module_hashes('candidate'), self.manifest['modules'])
            request.assert_called_once_with('/content/v2', raw=True)
        with patch.object(r, 'latest_version', side_effect=['candidate', 'other']), patch.object(r, 'request', return_value=(content, 'multipart/form-data; boundary=test')), self.assertRaisesRegex(RuntimeError, 'during source download'):
            r.module_hashes('candidate')
        with patch.object(r, 'latest_version', return_value='other'), patch.object(r, 'request') as request, self.assertRaisesRegex(RuntimeError, 'before source download'):
            r.module_hashes('candidate')
        request.assert_not_called()
    def test_verified_receipt_preserves_original_upload_commit_for_current_source_match(self):
        receipt = {'versionId': 'candidate', 'commit': 'a' * 40, 'modules': self.manifest['modules']}
        detail = {'annotations': {'workers/commit_sha': 'a' * 40}}
        with patch.object(r, 'verify_runtime', return_value=detail), patch.object(r, 'module_hashes', return_value=self.manifest['modules']):
            self.assertEqual(r.verify_uploaded_candidate(self.manifest, receipt, 'candidate'), 'a' * 40)
        for bad in [{**receipt, 'commit': 'b' * 40}, {**receipt, 'versionId': 'other'}, {**receipt, 'modules': {'worker.js': 'stale'}}]:
            with patch.object(r, 'verify_runtime', return_value=detail), patch.object(r, 'module_hashes', return_value=self.manifest['modules']), self.assertRaises(RuntimeError):
                r.verify_uploaded_candidate(self.manifest, bad, 'candidate')
        with patch.object(r, 'verify_runtime', return_value=detail), patch.object(r, 'module_hashes', return_value={'worker.js': 'unexpected'}), self.assertRaisesRegex(RuntimeError, 'Candidate latest source'):
            r.verify_uploaded_candidate(self.manifest, receipt, 'candidate')
    def test_upload_requires_explicit_mutation_flag_before_network(self):
        from argparse import Namespace
        with patch.object(r,'request',side_effect=AssertionError('network not permitted')), self.assertRaisesRegex(RuntimeError,'explicit'):
            r.run(Namespace(command='upload',allow_mutation=False))

if __name__ == '__main__': unittest.main()
