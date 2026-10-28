#!/usr/bin/env python3
"""Check pinned upstream releases; optionally prepare an isolated, unapproved candidate.

Never changes live pins, runs upstream code, builds, deploys or deletes old versions.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile
import urllib.error
import urllib.parse
import urllib.request

ENGINES = ('photocraft', 'vectorcraft', 'effectcraft', 'filmcraft', 'soundcraft', 'figcraft')
MAX_JSON = 4 * 1024 * 1024
MAX_DOWNLOAD = 300 * 1024 * 1024
MAX_TOTAL_DOWNLOAD = 512 * 1024 * 1024
SHA = re.compile(r'^[0-9a-f]{40}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')


def version(value):
    match = re.fullmatch(r'v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?', value or '')
    return tuple(map(int, match.groups())) if match else None


class SameHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        source, target = urllib.parse.urlsplit(request.full_url), urllib.parse.urlsplit(newurl)
        # Browser download URLs use GitHub's signed release-asset redirect. No credentials
        # are ever attached to those requests. Metadata credentials stay on api.github.com.
        allowed = target.scheme == 'https' and not target.username and not target.password
        if source.hostname == 'api.github.com':
            allowed = allowed and target.hostname == 'api.github.com'
        else:
            allowed = allowed and target.hostname in ('github.com', 'release-assets.githubusercontent.com', 'codeload.github.com')
        if not allowed:
            raise ValueError('Untrusted upstream redirect')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


class GitHub:
    def __init__(self, token=None):
        self.token = token
        self.opener = urllib.request.build_opener(SameHostRedirect())
        self.downloaded = 0

    def api(self, path):
        if not path.startswith('/repos/storytold/'):
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

    def download(self, url, path, expected=None):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname not in ('github.com', 'codeload.github.com') or parsed.username or parsed.password:
            raise ValueError('Unexpected upstream download URL')
        request = urllib.request.Request(url, headers={'User-Agent': 'XeroFlow-creative-updates'})
        digest = hashlib.sha256()
        count = 0
        with self.opener.open(request, timeout=60) as response, path.open('xb') as output:
            while chunk := response.read(1024 * 1024):
                count += len(chunk)
                self.downloaded += len(chunk)
                if count > MAX_DOWNLOAD or self.downloaded > MAX_TOTAL_DOWNLOAD:
                    raise ValueError('Candidate downloads exceed bounded storage budget')
                output.write(chunk)
                digest.update(chunk)
        actual = digest.hexdigest()
        if expected and actual != expected:
            raise ValueError('Upstream asset checksum mismatch')
        return count, actual


def check_engine(engine, pin, github):
    current = pin['version']
    if version(current) is None:
        raise ValueError('Invalid current version')
    releases = github.api(f'/repos/storytold/{engine}/releases?per_page=100')
    if not isinstance(releases, list) or any(not isinstance(item, dict) for item in releases):
        raise ValueError('Invalid release metadata')
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
    result['source_commit'] = commit
    result['source_url'] = f'https://codeload.github.com/storytold/{engine}/tar.gz/{commit}'
    if len(matches) != 1:
        result['browser_asset'] = None
        result['candidate_ready'] = False
        result['note'] = 'Exact browser ZIP is missing or ambiguous; no candidate can be prepared.'
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
    result['candidate_ready'] = True
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
            result.update(status='pinned_release_changed', candidate_ready=False, metadata_changes=changes)
    return result


def cargo_lock_hash(archive, engine, commit):
    wanted = f'{engine}-{commit}/Cargo.lock'
    with tarfile.open(archive) as tar:
        matches = []
        expanded = 0
        for count, member in enumerate(tar, 1):
            expanded += member.size
            if count > 100000 or expanded > 1024 * 1024 * 1024:
                raise ValueError('Source archive expanded size/member limit exceeded')
            if member.name == wanted:
                matches.append(member)
        if len(matches) != 1 or not matches[0].isfile() or matches[0].size > 4 * 1024 * 1024:
            raise ValueError('Expected one bounded root Cargo.lock in source archive')
        member = matches[0]
        if '..' in PurePosixPath(member.name).parts:
            raise ValueError('Unsafe Cargo.lock path')
        with tar.extractfile(member) as source:
            return hashlib.sha256(source.read()).hexdigest()


def prepare(report, releases, sources, destination, github):
    destination.mkdir(parents=True, exist_ok=False)
    downloads = destination / 'archives'
    downloads.mkdir()
    proposed_releases = json.loads(json.dumps(releases))
    proposed_sources = json.loads(json.dumps(sources))
    changed = []
    for entry in report['applications']:
        if entry['status'] != 'available':
            continue
        if not entry.get('candidate_ready'):
            raise ValueError('An available release has no usable browser asset')
        engine = entry['engine']
        asset = entry['browser_asset']
        expected = asset['digest'].split(':')[1] if asset['digest'] else None
        size, sha = github.download(asset['browser_download_url'], downloads / asset['name'], expected)
        if size != asset['size']:
            raise ValueError('Browser ZIP size differs from official metadata')
        source_archive = downloads / f'{engine}-{entry["source_commit"]}.tar.gz'
        _, source_sha = github.download(entry['source_url'], source_archive)
        lock_sha = cargo_lock_hash(source_archive, engine, entry['source_commit'])
        proposed_releases[engine] = {'version': entry['latest_version'], 'commit': entry['source_commit'],
            'name': asset['name'], 'size': size, 'digest': 'sha256:' + sha,
            'browser_download_url': asset['browser_download_url'], 'hosted_version': entry['latest_version'] + '-flow1'}
        proposed_sources[engine].update(version=entry['latest_version'], commit=entry['source_commit'],
            source_archive_sha256=source_sha, cargo_lock_sha256=lock_sha)
        changed.append(engine)
    candidate = {'approved': False, 'changed_engines': changed, 'report': report,
                 'gates': ['review upstream changes and licenses', 'replay or port branding and behavioral patches',
                           'build pinned source and run regression tests', 'test actual browser document workflows',
                           'review access control and install scopes', 'publish new version paths while retaining old paths',
                           'verify live hashes before switching stable app routes']}
    for name, data in [('releases.json', proposed_releases), ('source-pins.json', proposed_sources), ('candidate.json', candidate)]:
        (destination / name).write_text(json.dumps(data, indent=2) + '\n')
    return changed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', action='append', choices=ENGINES, help='Check only selected apps; default: all six')
    parser.add_argument('--report', type=Path, help='Write the check report here')
    parser.add_argument('--prepare', type=Path, metavar='NEW_DIRECTORY', help='Download and hash available candidates into a new directory; never promote them')
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parent
    releases = json.loads((root / 'releases.json').read_text())
    sources = json.loads((root / 'source-pins.json').read_text())
    github = GitHub(os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN'))
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'read_only_check': args.prepare is None, 'applications': []}
    failed = False
    for engine in dict.fromkeys(args.engine or ENGINES):
        try:
            entry = check_engine(engine, releases[engine], github)
            report['applications'].append(entry)
            if entry['status'] == 'pinned_release_changed':
                failed = True
        except (OSError, ValueError, KeyError, TypeError) as error:
            failed = True
            # Never print tokens, request headers, signed redirects or arbitrary provider bodies.
            message = f'GitHub API HTTP {error.code}' if isinstance(error, urllib.error.HTTPError) else type(error).__name__
            report['applications'].append({'engine': engine, 'current_version': releases[engine]['version'], 'status': 'check_failed', 'error': message})
    if args.prepare:
        if failed:
            parser.error('Candidate preparation refused because a release check failed')
        try:
            report['prepared_engines'] = prepare(report, releases, sources, args.prepare, github)
            report['candidate_directory'] = str(args.prepare)
        except (OSError, ValueError, KeyError, TypeError):
            report['preparation_failed'] = True
            failed = True
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
