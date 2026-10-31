"""Current-source only. Default plan is offline; no command is run on import."""
import argparse
import email.parser
import email.policy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import tomllib
import uuid

ROOT = Path(__file__).resolve().parent
ACCOUNT = 'a5b299b3ad15c1b5b895dc66f9357b17'
SCRIPT = 'xeroflow-creative-tools'
BASE = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{SCRIPT}'
TOKEN_FILE = Path.home() / 'Library/Preferences/.wrangler/config/default.toml'
sha = lambda value: hashlib.sha256(value).hexdigest()


def request(path, method='GET', payload=None, content_type=None, raw=False):
    if not path.startswith('/') or any(c in path for c in '\r\n"'):
        raise RuntimeError('Invalid API path')
    token = tomllib.loads(TOKEN_FILE.read_text())['oauth_token']
    if not isinstance(token, str) or any(c in token for c in '\r\n"'):
        raise RuntimeError('Invalid local credential format')
    cfg = f'url = "{BASE}{path}"\nheader = "Authorization: Bearer {token}"\n'
    if content_type:
        cfg += f'header = "Content-Type: {content_type}"\n'
    args = ['curl', '--config', '-', '--silent', '--show-error', '--max-time', '60', '--max-filesize', '10485760', '--request', method, '--write-out', '\n%{http_code}\n%{content_type}']
    with tempfile.TemporaryDirectory(prefix='motorstack-release-') as temp:
        if payload is not None:
            file = Path(temp) / 'body.bin'; file.write_bytes(payload)
            args += ['--data-binary', '@' + str(file)]
        result = subprocess.run(args, input=cfg.encode(), capture_output=True)
    if result.returncode:
        raise RuntimeError('Cloudflare transport failed; credentials and response omitted')
    body, status, mime = result.stdout.rsplit(b'\n', 2)
    if not status.isdigit() or not 200 <= int(status) < 300:
        raise RuntimeError('Cloudflare API refused request with status ' + status.decode(errors='replace'))
    if raw:
        return body, mime.decode()
    data = json.loads(body)
    if data.get('success') is not True:
        raise RuntimeError('Cloudflare API returned unsuccessful response')
    return data['result']


def local_manifest():
    # Ignored dist files are not evidence of current Git source. Always reproduce
    # both modules and their manifest from the reviewed local source before checks.
    built = subprocess.run(['node', str(ROOT / 'build.mjs')], cwd=ROOT, capture_output=True)
    if built.returncode:
        raise RuntimeError('Deterministic candidate build failed; no release operation is allowed')
    manifest = json.loads((ROOT / 'dist/manifest.json').read_text())
    if manifest['account'] != ACCOUNT or manifest['script'] != SCRIPT:
        raise RuntimeError('Immutable deployment target mismatch')
    if set(manifest['modules']) != {'worker.js', 'brand-rpc.mjs'}:
        raise RuntimeError('Unexpected candidate module set')
    for name, digest in manifest['modules'].items():
        if sha((ROOT / 'dist' / name).read_bytes()) != digest:
            raise RuntimeError('Candidate module hash mismatch')
    for name, digest in manifest['baseModules'].items():
        if sha((ROOT / 'source' / name).read_bytes()) != digest:
            raise RuntimeError('Baseline source changed')
    return manifest


def module_hashes(expected_latest_version):
    # This API returns latest uploaded source; there is no version query selector.
    if latest_version() != expected_latest_version:
        raise RuntimeError('Latest uploaded version changed before source download')
    body, mime = request('/content/v2', raw=True)
    message = email.parser.BytesParser(policy=email.policy.default).parsebytes(b'Content-Type: ' + mime.encode() + b'\r\nMIME-Version: 1.0\r\n\r\n' + body)
    if not message.is_multipart():
        raise RuntimeError('Expected multipart Worker source')
    result = {}
    for part in message.iter_parts():
        name = part.get_filename()
        if not name or name in result:
            raise RuntimeError('Unexpected source part')
        result[name] = sha(part.get_payload(decode=True))
    if latest_version() != expected_latest_version:
        raise RuntimeError('Latest uploaded version changed during source download')
    return result


def verify_runtime(version):
    detail = request('/versions/' + version)
    evidence = json.loads((ROOT / 'source/verification.json').read_text())['versionMetadata'][0]
    resources = detail['resources']
    bindings = sorted((item['name'], item['type']) for item in resources['bindings'])
    expected = sorted((item['name'], item['type']) for item in evidence['bindings'])
    if version == evidence['id'] and resources.get('script', {}).get('etag') != evidence['script']['etag']:
        raise RuntimeError('Immutable baseline version script etag changed; stop and reconcile')
    # Wrangler serializes an empty compatibility_flags array; the API may omit it.
    # Normalize only that exact empty/default representation, never real flags.
    def normalized_runtime(value):
        result = dict(value)
        if result.get('compatibility_flags') == []:
            result.pop('compatibility_flags')
        return result
    if bindings != expected or normalized_runtime(resources['script_runtime']) != normalized_runtime(evidence['runtime']):
        raise RuntimeError('Bindings or complete runtime/assets settings changed; stop and reconcile')
    return detail


def latest_version():
    listing = request('/versions')
    items = listing.get('items', []) if isinstance(listing, dict) else listing
    if not items:
        raise RuntimeError('No uploaded version inventory')
    return max(items, key=lambda item: item['metadata']['created_on'])['id']


def verify_baseline(manifest, latest_expected=None):
    listings = request('/deployments')['deployments']
    deployment = max(listings, key=lambda item: item['created_on'])
    if deployment['id'] != manifest['baseDeployment'] or deployment['versions'] != [{'version_id': manifest['baseVersion'], 'percentage': 100}]:
        raise RuntimeError('Active deployment changed; stop and reconcile current source')
    # Script API inherit and keep_assets refer to latest upload, not necessarily deployed.
    if latest_version() != (latest_expected or manifest['baseVersion']):
        raise RuntimeError('Latest uploaded version changed; refuse implicit inheritance')
    verify_runtime(manifest['baseVersion'])
    if latest_expected is None or latest_expected == manifest['baseVersion']:
        if module_hashes(manifest['baseVersion']) != manifest['baseModules']:
            raise RuntimeError('Latest baseline source no longer matches reviewed baseline')
    # After upload, the old immutable version is verified by ID, script etag,
    # runtime and unchanged active deployment. Downloading its source is unsupported;
    # the candidate latest source is verified separately against the upload receipt.


def verify_source_commit(commit):
    def git(*args):
        result = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Git source verification failed; reconcile current main before release')
        return result.stdout.strip()
    if git('rev-parse', 'HEAD') != commit or git('rev-parse', 'origin/main') != commit:
        raise RuntimeError('Release must use the exact reviewed current main commit')
    remote = git('ls-remote', 'origin', 'refs/heads/main').split()
    if len(remote) != 2 or remote[0] != commit:
        raise RuntimeError('Remote main changed; fetch and reconcile before release')
    if git('status', '--porcelain', '--', str(ROOT)):
        raise RuntimeError('Release directory has uncommitted changes')


def metadata(commit):
    if len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
        raise RuntimeError('Full reviewed source commit required')
    return {'main_module': 'worker.js', 'keep_assets': True, 'compatibility_date': '2026-10-27', 'usage_model': 'standard', 'bindings': [{'name': name, 'type': 'inherit'} for name in ['ASSETS', 'CREATIVE_AUTH_KEY', 'MOTORSTACK_API_KEY']], 'annotations': {'workers/message': 'Private MotorStack brand RPC from ' + commit, 'workers/commit_sha': commit}}


def verify_uploaded_candidate(manifest, receipt, version):
    if receipt.get('modules') != manifest['modules'] or receipt.get('versionId') != version:
        raise RuntimeError('Explicit version does not match current-source module hashes and upload receipt')
    upload_commit = receipt.get('commit', '')
    if len(upload_commit) != 40 or any(c not in '0123456789abcdef' for c in upload_commit):
        raise RuntimeError('Upload receipt has invalid original source commit')
    detail = verify_runtime(version)
    if detail.get('annotations', {}).get('workers/commit_sha') != upload_commit:
        raise RuntimeError('Cloudflare upload provenance does not match the original receipt commit')
    if module_hashes(version) != manifest['modules']:
        raise RuntimeError('Candidate latest source differs from current-source modules')
    return upload_commit


def multipart(meta):
    boundary = 'motorstack-' + uuid.uuid4().hex
    parts = [('metadata', None, 'application/json', json.dumps(meta).encode())]
    parts += [(name, name, 'application/javascript+module', (ROOT / 'dist' / name).read_bytes()) for name in ['worker.js', 'brand-rpc.mjs']]
    chunks = []
    for name, filename, mime, body in parts:
        disposition = f'form-data; name="{name}"' + (f'; filename="{filename}"' if filename else '')
        chunks.append(f'--{boundary}\r\nContent-Disposition: {disposition}\r\nContent-Type: {mime}\r\n\r\n'.encode() + body + b'\r\n')
    return b''.join(chunks) + f'--{boundary}--\r\n'.encode(), 'multipart/form-data; boundary=' + boundary


def run(args):
    manifest = local_manifest()
    if args.command == 'plan':
        return {'target': SCRIPT, 'baseVersion': manifest['baseVersion'], 'modules': manifest['modules'], 'keep_assets': True, 'mutations': False}
    if args.command == 'check':
        if args.version:
            receipt = json.loads((ROOT / 'upload-receipt.json').read_text())
            verify_baseline(manifest, latest_expected=args.version)
            upload_commit = verify_uploaded_candidate(manifest, receipt, args.version)
            return {'baselineVerified': True, 'candidateVerified': args.version, 'uploadCommit': upload_commit, 'modules': manifest['modules'], 'mutations': False}
        verify_baseline(manifest)
        return {'baselineVerified': True, 'mutations': False}
    if not args.allow_mutation:
        raise RuntimeError('Upload/deployment requires explicit --allow-mutation after review')
    verify_source_commit(args.commit or '')
    if args.command == 'upload':
        meta = metadata(args.commit or '')
        verify_baseline(manifest)
        payload, mime = multipart(meta)
        # Never PUT /scripts: that deploys immediately. Upload version only.
        result = request('/versions?bindings_inherit=strict', 'POST', payload, mime)
        version = result['id']
        verify_runtime(version)
        if module_hashes(version) != manifest['modules']:
            raise RuntimeError('Uploaded source differs; do not deploy')
        receipt = {'versionId': version, 'modules': manifest['modules'], 'commit': args.commit, 'deployed': False}
        (ROOT / 'upload-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        return receipt
    if args.command == 'deploy':
        receipt = json.loads((ROOT / 'upload-receipt.json').read_text())
        verify_baseline(manifest, latest_expected=args.version)
        upload_commit = verify_uploaded_candidate(manifest, receipt, args.version)
        ancestry = subprocess.run(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', upload_commit, args.commit], capture_output=True)
        if ancestry.returncode:
            raise RuntimeError('Original upload commit is not an ancestor of reviewed current main')
        result = request('/deployments', 'POST', json.dumps({'strategy':'percentage','versions':[{'version_id':args.version,'percentage':100}], 'annotations':{'workers/message':'Private MotorStack brand RPC from ' + args.commit}}).encode(), 'application/json')
        result = {key: result.get(key) for key in ['id', 'versions', 'created_on']}
        result.update({'uploadCommit': upload_commit, 'releaseCommit': args.commit, 'modules': manifest['modules']})
        (ROOT / 'deployment-receipt.json').write_text(json.dumps(result, indent=2) + '\n')
        return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan','check','upload','deploy'], nargs='?', default='plan')
    parser.add_argument('--commit'); parser.add_argument('--version'); parser.add_argument('--allow-mutation', action='store_true')
    try:
        print(json.dumps(run(parser.parse_args()), indent=2))
    except Exception as error:
        raise SystemExit(str(error))
