#!/usr/bin/env python3
"""Read-only upstream check against exact source inputs and a publication receipt.

Never changes live pins, runs upstream code, builds, deploys or deletes old versions.
"""
import argparse
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

ENGINES = ('photocraft', 'vectorcraft', 'effectcraft', 'filmcraft', 'soundcraft', 'figcraft')
MAX_JSON = 4 * 1024 * 1024
MAX_DOWNLOAD = 300 * 1024 * 1024
SHA = re.compile(r'^[0-9a-f]{40}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')


def version(value):
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r'v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?', value or '')
    return tuple(map(int, match.groups())) if match else None


class SameHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        source, target = urllib.parse.urlsplit(request.full_url), urllib.parse.urlsplit(newurl)
        # This checker only requests metadata. Credentials remain on the API origin.
        allowed = target.scheme == 'https' and not target.username and not target.password
        allowed = allowed and source.hostname == target.hostname == 'api.github.com' and target.port in (None, 443)
        if not allowed:
            raise ValueError('Untrusted upstream redirect')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


class GitHub:
    def __init__(self, token=None):
        self.token = token
        self.opener = urllib.request.build_opener(SameHostRedirect())

    def api(self, path):
        if not any(path.startswith(f'/repos/storytold/{engine}/') for engine in ENGINES):
            raise ValueError('Unexpected repository API path')
        headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'XeroFlow-creative-updates', 'X-GitHub-Api-Version': '2022-11-28'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        request = urllib.request.Request('https://api.github.com' + path, headers=headers)
        with self.opener.open(request, timeout=25) as response:
            data = response.read(MAX_JSON + 1)
        if len(data) > MAX_JSON:
            raise ValueError('Upstream metadata exceeds limit')
        return json.loads(data)

    def commit(self, engine, tag):
        obj = self.api(f'/repos/storytold/{engine}/git/ref/tags/{urllib.parse.quote(tag, safe="")}')['object']
        for _ in range(5):
            if not isinstance(obj, dict) or not SHA.fullmatch(obj.get('sha', '')):
                raise ValueError('Invalid source revision')
            if obj.get('type') == 'commit':
                return obj['sha']
            if obj.get('type') != 'tag':
                break
            obj = self.api(f'/repos/storytold/{engine}/git/tags/{obj["sha"]}')['object']
        raise ValueError('Release tag does not resolve to a commit within five hops')


def check_engine(engine, pin, github):
    current = pin['version']
    if version(current) is None:
        raise ValueError('Invalid current version')
    releases = github.api(f'/repos/storytold/{engine}/releases?per_page=100')
    if not isinstance(releases, list) or any(not isinstance(item, dict) for item in releases):
        raise ValueError('Invalid release metadata')
    if any(type(r.get('draft')) is not bool or type(r.get('prerelease')) is not bool or not isinstance(r.get('tag_name'), str) for r in releases):
        raise ValueError('Invalid release flags or tag')
    stable = [r for r in releases if not r.get('draft') and not r.get('prerelease') and version(r.get('tag_name')) is not None]
    if not stable:
        raise ValueError('No stable release found in bounded release page')
    latest = max(stable, key=lambda r: version(r['tag_name']))
    tag = latest['tag_name']
    release_version = tag.removeprefix('v')
    name = f'{engine}-web-{release_version}.zip'
    assets = latest.get('assets', [])
    if not isinstance(assets, list) or any(not isinstance(asset, dict) for asset in assets):
        raise ValueError('Invalid browser asset metadata')
    matches = [asset for asset in assets if asset.get('name') == name]
    result = {'engine': engine, 'current_version': current, 'latest_version': release_version,
              'tag': tag, 'release_url': f'https://github.com/storytold/{engine}/releases/tag/{urllib.parse.quote(tag, safe="")}',
              'status': 'available' if version(release_version) > version(current) else 'pinned_ahead' if version(release_version) < version(current) else 'up_to_date'}
    commit = github.commit(engine, tag)
    if not isinstance(commit, str) or not SHA.fullmatch(commit):
        raise ValueError('Invalid source commit')
    result['source_commit'] = commit
    result['source_url'] = f'https://codeload.github.com/storytold/{engine}/tar.gz/{commit}'
    if len(matches) != 1:
        result['browser_asset'] = None
        result['browser_asset_identified'] = False
        result['note'] = 'Exact browser ZIP is missing or ambiguous.'
        if version(release_version) == version(current):
            result.update(status='pinned_release_changed', metadata_changes=['browser_asset_missing_or_ambiguous'])
        return result
    asset = matches[0]
    expected_url = f'https://github.com/storytold/{engine}/releases/download/{urllib.parse.quote(tag, safe="")}/{urllib.parse.quote(name, safe="")}'
    size = asset.get('size')
    if asset.get('browser_download_url') != expected_url or type(size) is not int or not 0 < size <= MAX_DOWNLOAD:
        raise ValueError('Unexpected browser asset URL or size')
    sha = asset.get('digest')
    if sha is not None and (not isinstance(sha, str) or not DIGEST.fullmatch(sha)):
        raise ValueError('Invalid upstream browser digest')
    result['browser_asset'] = {'name': name, 'size': size, 'digest': sha, 'browser_download_url': expected_url}
    result['browser_asset_identified'] = True
    result['upstream_digest_available'] = sha is not None
    if version(release_version) == version(current):
        changes = []
        if pin.get('commit') and pin['commit'] != commit:
            changes.append('source_commit')
        for field, actual in [('name', name), ('size', size)]:
            if field in pin and pin[field] != actual:
                changes.append('browser_' + field)
        if sha is not None and pin.get('digest') and pin['digest'] != sha:
            changes.append('browser_digest')
        if changes:
            result.update(status='pinned_release_changed', browser_asset_identified=False, metadata_changes=changes)
    return result



def load_candidates(path):
    pins = json.loads(path.read_text())
    if not isinstance(pins, dict) or set(pins) != set(ENGINES):
        raise ValueError('Expected exactly six candidate engines')
    for engine, pin in pins.items():
        if not isinstance(pin, dict) or version(pin.get('version')) is None:
            raise ValueError('Invalid candidate version')
        if pin.get('status') != 'upstream-input-only-unbuilt-unpublished' or 'hosted_version' in pin:
            raise ValueError('Candidate inputs must not claim deployed status')
        if not isinstance(pin.get('candidate_version'), str) or not re.fullmatch(re.escape(pin['version']) + r'-flow[1-9][0-9]*', pin['candidate_version']):
            raise ValueError('Invalid candidate package version')
        for field, pattern in [('commit', SHA), ('digest', DIGEST), ('source_archive_sha256', re.compile(r'^[0-9a-f]{64}$')), ('cargo_lock_sha256', re.compile(r'^[0-9a-f]{64}$'))]:
            if not isinstance(pin.get(field), str) or not pattern.fullmatch(pin[field]):
                raise ValueError('Invalid candidate digest or revision')
        expected = f"{engine}-web-{pin['version']}.zip"
        if pin.get('name') != expected or type(pin.get('size')) is not int or not 0 < pin['size'] <= MAX_DOWNLOAD:
            raise ValueError('Invalid candidate asset name or size')
        expected_url = f"https://github.com/storytold/{engine}/releases/download/v{pin['version']}/{expected}"
        if pin.get('browser_download_url') != expected_url:
            raise ValueError('Invalid candidate browser URL')
    return pins



def load_configured_routes(path):
    """Read the committed route map, never execute its JavaScript or imply live acceptance."""
    raw = path.read_bytes()
    match = re.search(r'var app_routes_default = (\{.*?\});', raw.decode(), re.S)
    if not match:
        raise ValueError('Configured standalone route map not found')
    routes = json.loads(match[1])
    applications = {}
    for engine in ENGINES:
        app = engine.replace('craft', 'flow')
        target = routes.get('/' + app + '/')
        if not isinstance(target, str) or routes.get('/' + app) != target:
            raise ValueError('Ambiguous configured route')
        found = re.fullmatch('/' + app + r'/([0-9]+\.[0-9]+\.[0-9]+)-flow[1-9][0-9]*/', target)
        if not found or version(found[1]) is None:
            raise ValueError('Invalid configured standalone version route')
        applications[engine] = {'upstream_version': found[1], 'configured_route': target}
    return {'kind': 'source_configured_standalone_routes_not_runtime_acceptance',
            'source': 'workers/creative-launcher-card-release/source/worker.js',
            'source_sha256': hashlib.sha256(raw).hexdigest(), 'applications': applications}


def load_published_release(path):
    """Use a committed publication receipt, without claiming a live runtime check."""
    raw = path.read_bytes()
    data = json.loads(raw)
    uuid = re.compile(r'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    if not isinstance(data, dict) or data.get('status') != 'published' or data.get('host') != 'creative.xeroflow.io':
        raise ValueError('Expected canonical published Creative Suite receipt')
    if not SHA.fullmatch(data.get('source_commit', '')) or not re.fullmatch(r'[0-9a-f]{64}', data.get('receipt_sha256', '')):
        raise ValueError('Invalid publication source or artifact digest')
    for target in ('gateway', 'assets'):
        if not isinstance(data.get(target), dict):
            raise ValueError('Invalid publication deployment object')
        for field in ('version', 'deployment'):
            if not uuid.fullmatch(data[target].get(field, '')):
                raise ValueError('Missing publication deployment identity')
    if not isinstance(data.get('published_at'), str) or not datetime.fromisoformat(data['published_at'].replace('Z', '+00:00')).tzinfo:
        raise ValueError('Publication timestamp must have a timezone')
    routes = data.get('routes')
    if not isinstance(routes, dict) or set(routes) != set(ENGINES):
        raise ValueError('Expected exactly six published routes')
    applications = {}
    for engine in ENGINES:
        app = engine.replace('craft', 'flow')
        route = routes[engine]
        found = re.fullmatch('/' + app + r'/([0-9]+\.[0-9]+\.[0-9]+)-flow[1-9][0-9]*/', route) if isinstance(route, str) else None
        if not found or version(found[1]) is None:
            raise ValueError('Invalid published application route')
        applications[engine] = {'upstream_version': found[1], 'configured_route': route}
    return {'kind': 'published_release_receipt_not_runtime_recheck',
            'source': 'workers/creative-suite-release/published-release.json',
            'source_sha256': hashlib.sha256(raw).hexdigest(),
            'source_commit': data['source_commit'], 'published_at': data['published_at'],
            'gateway': data['gateway'], 'assets': data['assets'],
            'specialised_figflow_email': data.get('specialised_figflow_email'),
            'applications': applications}


def error_label(error):
    # Provider bodies, request headers, tokens and redirects never enter the report.
    return f'GitHub API HTTP {error.code}' if isinstance(error, urllib.error.HTTPError) else type(error).__name__


def collect(pins, github, configured=None):
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'read_only_check': True,
              'baseline_kind': 'original_upstream_source_inputs_not_deployed_receipt', 'applications': []}
    if configured is not None:
        report['configured_route_baseline'] = configured
    failed = False
    for engine in ENGINES:
        try:
            entry = check_engine(engine, pins[engine], github)
            entry['candidate_version'] = pins[engine]['candidate_version']
            if configured is not None:
                baseline = dict(configured['applications'][engine])
                before, latest = version(baseline['upstream_version']), version(entry['latest_version'])
                baseline['status'] = 'available' if latest > before else 'pinned_ahead' if latest < before else 'up_to_date'
                entry['configured_route_comparison'] = baseline
            report['applications'].append(entry)
            failed |= entry['status'] == 'pinned_release_changed'
        except (OSError, ValueError, KeyError, TypeError) as error:
            failed = True
            report['applications'].append({'engine': engine, 'current_version': pins[engine]['version'],
                                           'status': 'check_failed', 'error': error_label(error)})
    return report, failed


def summary(report):
    lines = ['## Creative upstream releases', '',
             'Original upstream source pins are not the deployed release inventory; published selections are separate below.', '',
             '| Application | Source upstream | Latest stable | Status |', '| --- | --- | --- | --- |']
    for app in report.get('applications', []):
        lines.append(f"| {app['engine']} | {app['current_version']} | {app.get('latest_version', 'unknown')} | {app['status']} |")
    if report.get('configured_route_baseline'):
        baseline = report['configured_route_baseline']
        if baseline.get('kind') == 'published_release_receipt_not_runtime_recheck':
            lines.extend(['', 'Published release receipt: ' + baseline['published_at'] + '. This metadata checker does not re-run hosted acceptance.',
                          'Specialised FigFlow email remains ' + str(baseline.get('specialised_figflow_email')) + '.', ''])
        else:
            lines.extend(['', 'Historical source-configured routes, not authenticated runtime acceptance.', ''])
        lines.extend(['',
                      '| Application | Configured route | Compared with latest |', '| --- | --- | --- |'])
        for app in report.get('applications', []):
            baseline = app.get('configured_route_comparison')
            if baseline:
                lines.append(f"| {app['engine']} | {baseline['configured_route']} | {baseline['status']} |")
    if report.get('input_error'):
        lines.append('Input validation failed. No upstream checks were performed.')
    lines.extend(['', 'Read only: no application downloads, pin changes, builds, deployment, issue creation or messages.',
                  'Schedule activation requires default-branch integration and successful workflow evidence.', ''])
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pins', type=Path, default=Path(__file__).with_name('upstream-releases.json'))
    parser.add_argument('--report', type=Path)
    parser.add_argument('--summary', type=Path)
    args = parser.parse_args(argv)
    try:
        pins = load_candidates(args.pins)
        configured = load_published_release(Path(__file__).resolve().parents[1] / 'creative-suite-release/published-release.json')
        report, failed = collect(pins, GitHub(os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')), configured)
    except (OSError, ValueError, KeyError, TypeError) as error:
        report = {'read_only_check': True, 'baseline_kind': 'original_upstream_source_inputs_not_deployed_receipt',
                  'input_error': error_label(error), 'applications': []}
        failed = True
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    if args.summary:
        with args.summary.open('a') as output:
            output.write(summary(report))
    print(json.dumps(report, indent=2))
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
