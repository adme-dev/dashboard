"""Preserve the live creative assets; add one authenticated private-service prefix."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
LEGACY = ROOT.parent / 'creative-motorstack-brand-release'
BASE_VERSION = 'e5de27cd-41cd-456f-a7f7-9a91e0276777'
BASE_DEPLOYMENT = 'd75c00fc-5168-4ddf-b410-aaf9967c1457'
SERVICE = 'xeroflow-figflow-edm-assets'
BASE_HASHES = {
    'worker.js': '9a4a9a44bf44dae92695f6bb69731cf4586c0f546e1562c7af6230c92ea52d8d',
    'brand-rpc.mjs': '53bd8cd96907d296fe95cd9f8bb4999152277b65ade0eed36e932f825f15e754',
}
spec = importlib.util.spec_from_file_location('creative_transport', LEGACY / 'release.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


def candidate():
    subprocess.run(['node', str(LEGACY / 'build.mjs')], cwd=REPO, check=True, capture_output=True)
    modules = {name: (LEGACY / 'dist' / name).read_bytes() for name in BASE_HASHES}
    if {name: transport.sha(data) for name, data in modules.items()} != BASE_HASHES:
        raise RuntimeError('Current-source creative build differs from the verified live base')
    anchor = b'    const assetsResponse = await handleMotorstack(request, env);'
    addition = b'''    if (url.hostname === "creative.xeroflow.io" && url.pathname.startsWith("/figflow/0.11.2-edm1/")) {
      if (!env.FIGFLOW_EDM_ASSETS) return blocked(503, "Email designer unavailable", false);
      try {
        return await env.FIGFLOW_EDM_ASSETS.fetch(new Request(url, { method: request.method }));
      } catch { return blocked(503, "Email designer unavailable", false); }
    }
'''
    if modules['worker.js'].count(anchor) != 1:
        raise RuntimeError('Authenticated creative routing anchor changed')
    # This anchor is after the existing authorize() rejection and before the
    # old asset routing. No public or authentication route is changed.
    modules['worker.js'] = modules['worker.js'].replace(anchor, addition + anchor)
    return modules


def baseline(latest=BASE_VERSION):
    active = max(transport.request('/deployments')['deployments'], key=lambda item: item['created_on'])
    if active['id'] != BASE_DEPLOYMENT or active['versions'] != [{'version_id': BASE_VERSION, 'percentage': 100}]:
        raise RuntimeError('Creative production changed; reconcile before release')
    if transport.latest_version() != latest:
        raise RuntimeError('Latest creative upload changed; reconcile before release')
    if latest == BASE_VERSION and transport.module_hashes(BASE_VERSION) != BASE_HASHES:
        raise RuntimeError('Live creative source differs')
    return transport.request('/versions/' + BASE_VERSION)['resources']


def source():
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=REPO, text=True).strip()
    if git('remote', 'get-url', 'origin') not in ('https://github.com/adme-dev/dashboard.git', 'git@github.com:adme-dev/dashboard.git'):
        raise RuntimeError('Wrong source repository')
    git('fetch', 'origin', 'main')
    commit = git('rev-parse', 'HEAD')
    if commit != git('rev-parse', 'origin/main'):
        raise RuntimeError('Release requires exact current main')
    if any(line and not line.startswith('?? .verification/') for line in git('status', '--porcelain', '--untracked-files=all').splitlines()):
        raise RuntimeError('Release source must be clean')
    return commit


def private_service(commit):
    original = transport.BASE
    try:
        transport.BASE = original.rsplit('/', 1)[0] + '/' + SERVICE
        active = max(transport.request('/deployments')['deployments'], key=lambda item: item['created_on'])
        versions = active['versions']
        if len(versions) != 1 or versions[0]['percentage'] != 100:
            raise RuntimeError('Native service must have one verified active version')
        version = transport.request('/versions/' + versions[0]['version_id'])
        if version.get('annotations', {}).get('workers/tag') != commit:
            raise RuntimeError('Native service source does not match current main')
        bindings = version['resources']['bindings']
        if [(item['name'], item['type']) for item in bindings] != [('ASSETS', 'assets')]:
            raise RuntimeError('Native asset service bindings differ')
        if transport.request('/subdomain').get('enabled') is not False:
            raise RuntimeError('Native asset service has a public workers.dev address')
        return versions[0]['version_id']
    finally:
        transport.BASE = original


def metadata(commit, resources):
    runtime = resources['script_runtime']
    if runtime.get('compatibility_date') != '2026-10-27' or runtime.get('compatibility_flags') != ['global_fetch_strictly_public']:
        raise RuntimeError('Creative runtime changed')
    names = sorted((item['name'], item['type']) for item in resources['bindings'])
    if names != [('ASSETS', 'assets'), ('CREATIVE_AUTH_KEY', 'secret_text'), ('MOTORSTACK_API_KEY', 'secret_text')]:
        raise RuntimeError('Creative bindings changed')
    return {
        'main_module': 'worker.js', 'keep_assets': True,
        'compatibility_date': runtime['compatibility_date'],
        'compatibility_flags': runtime['compatibility_flags'], 'usage_model': runtime['usage_model'],
        'bindings': [{'name': name, 'type': 'inherit'} for name, _ in names] + [
            {'name': 'FIGFLOW_EDM_ASSETS', 'type': 'service', 'service': SERVICE, 'environment': 'production'}
        ],
        'annotations': {'workers/message': 'Immutable FigFlow EDM service from ' + commit, 'workers/commit_sha': commit}
    }


def verify_candidate(version, modules, resources, commit):
    detail = transport.request('/versions/' + version)
    actual = detail['resources']
    if detail.get('annotations', {}).get('workers/commit_sha') != commit:
        raise RuntimeError('Creative source provenance differs')
    if actual['script_runtime'] != resources['script_runtime']:
        raise RuntimeError('Existing creative asset or runtime configuration changed')
    expected = sorted([(item['name'], item['type']) for item in resources['bindings']] + [('FIGFLOW_EDM_ASSETS', 'service')])
    if sorted((item['name'], item['type']) for item in actual['bindings']) != expected:
        raise RuntimeError('Creative binding inventory differs')
    binding = next(item for item in actual['bindings'] if item['name'] == 'FIGFLOW_EDM_ASSETS')
    if binding.get('service') != SERVICE or binding.get('environment') != 'production':
        raise RuntimeError('Native service binding target differs')
    if transport.module_hashes(version) != {name: transport.sha(data) for name, data in modules.items()}:
        raise RuntimeError('Uploaded creative source differs')


def run(command):
    modules = candidate()
    hashes = {name: transport.sha(data) for name, data in modules.items()}
    if command == 'plan':
        return {'target': transport.SCRIPT, 'baseVersion': BASE_VERSION, 'modules': hashes, 'keep_assets': True, 'service': SERVICE, 'mutations': False}
    commit = source()
    native_version = private_service(commit)
    receipt_path = ROOT / 'dist/creative-upload.json'
    receipt = json.loads(receipt_path.read_text()) if command == 'deploy' else None
    latest = receipt['version'] if receipt else BASE_VERSION
    resources = baseline(latest)
    if command == 'check':
        metadata(commit, resources)
        return {'baselineVerified': True, 'nativeVersion': native_version, 'mutations': False}
    if command == 'upload':
        boundary = 'figflow-' + uuid.uuid4().hex
        parts = [('metadata', None, 'application/json', json.dumps(metadata(commit, resources)).encode())]
        parts += [(name, name, 'application/javascript+module', data) for name, data in modules.items()]
        chunks = []
        for name, filename, mime, data in parts:
            disposition = f'form-data; name="{name}"' + (f'; filename="{filename}"' if filename else '')
            chunks.append(f'--{boundary}\r\nContent-Disposition: {disposition}\r\nContent-Type: {mime}\r\n\r\n'.encode() + data + b'\r\n')
        body = b''.join(chunks) + f'--{boundary}--\r\n'.encode()
        version = transport.request('/versions?bindings_inherit=strict', 'POST', body, 'multipart/form-data; boundary=' + boundary)['id']
        # Keep the upload identity even if the verification call is interrupted.
        receipt = {'version': version, 'source': commit, 'nativeVersion': native_version, 'modules': hashes}
        receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
        verify_candidate(version, modules, resources, commit)
        return receipt
    if receipt['source'] != commit or receipt['modules'] != hashes or receipt['nativeVersion'] != native_version:
        raise RuntimeError('Upload receipt differs from current reviewed release')
    verify_candidate(receipt['version'], modules, resources, commit)
    result = transport.request('/deployments', 'POST', json.dumps({
        'strategy': 'percentage', 'versions': [{'version_id': receipt['version'], 'percentage': 100}],
        'annotations': {'workers/message': 'FigFlow EDM from ' + commit}
    }).encode(), 'application/json')
    result = {key: result.get(key) for key in ('id', 'versions', 'created_on')}
    (ROOT / 'dist/creative-deployment.json').write_text(json.dumps({**receipt, **result}, indent=2) + '\n')
    return {**receipt, **result}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'check', 'upload', 'deploy'], nargs='?', default='plan')
    print(json.dumps(run(parser.parse_args().command), indent=2))
