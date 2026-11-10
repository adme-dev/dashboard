import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import prepare as subject


class Guards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name).resolve()
        self.repo = patch.object(subject, 'REPO', self.base / 'repo')
        self.repo.start()
        self.addCleanup(self.repo.stop)
        self.addCleanup(self.temp.cleanup)

    def archive(self, name='source.tar.gz', members=None):
        path = self.base / name
        with tarfile.open(path, 'w:gz') as tar:
            for name, payload, kind in members or [('app-abc/Cargo.lock', b'lock\n', 'file'), ('app-abc/file.txt', b'old\n', 'file')]:
                item = tarfile.TarInfo(name)
                if kind == 'file':
                    item.size = len(payload)
                    tar.addfile(item, io.BytesIO(payload))
                else:
                    item.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
                    item.linkname = payload.decode()
                    tar.addfile(item)
        return path

    def fixture(self, diff='--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n'):
        archive = self.archive()
        config = self.base / 'config'
        (config / 'patches').mkdir(parents=True)
        patch_file = config / 'patches/app.patch'
        patch_file.write_text(diff)
        lock = self.base / 'lock'
        lock.write_text('lock\n')
        pin = {'archive': archive.name, 'commit': 'abc', 'source_archive_sha256': subject.sha(archive), 'patch': 'patches/app.patch', 'patch_sha256': subject.sha(patch_file), 'cargo_lock_sha256': subject.sha(lock)}
        (config / 'source-pins.json').write_text(json.dumps({'app': pin}))
        return config, pin

    def test_exact_replay_and_refuse_overwrite(self):
        config, _ = self.fixture()
        root = self.base / 'build'
        subject.prepare('app', root, self.base, self.base, config)
        self.assertEqual((root / 'source/file.txt').read_text(), 'new\n')
        with self.assertRaises(FileExistsError):
            subject.prepare('app', root, self.base, self.base, config)
        self.assertEqual((root / 'source/file.txt').read_text(), 'new\n')

    def test_checksum_refuses_before_root_creation(self):
        config, pin = self.fixture()
        (self.base / pin['archive']).write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'Checksum'):
            subject.prepare('app', self.base / 'build', self.base, self.base, config)
        self.assertFalse((self.base / 'build').exists())

    def test_patch_cannot_escape_config(self):
        config, pin = self.fixture()
        for path in ('../outside.patch', '/tmp/outside.patch', 'patches/../../outside.patch'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                subject.patch_path(config, path, pin['patch_sha256'])

    def test_patch_cannot_escape_source(self):
        config, pin = self.fixture('--- a/../../outside\n+++ b/../../outside\n@@ -1 +1 @@\n-old\n+new\n')
        with self.assertRaisesRegex(ValueError, 'Unsafe patch target'):
            subject.patch_path(config, pin['patch'], pin['patch_sha256'])

    def test_patch_symlink_refused(self):
        config, pin = self.fixture()
        (config / 'patches/link.patch').symlink_to(config / pin['patch'])
        with self.assertRaises(ValueError):
            subject.patch_path(config, 'patches/link.patch', pin['patch_sha256'])

    def test_links_and_traversal_refused_before_extraction(self):
        for i, member in enumerate([('../escape', b'x', 'file'), ('/escape', b'x', 'file'), ('app-abc/link', b'../../escape', 'symlink'), ('app-abc/link', b'../../escape', 'hardlink')]):
            archive = self.archive(str(i) + '.tar.gz', [member])
            destination = self.base / ('extract' + str(i))
            with self.subTest(member=member), self.assertRaises(ValueError):
                subject.extract(archive, destination, 'app-abc')
            self.assertFalse(destination.exists())

    def test_archive_limits_and_duplicates(self):
        archive = self.archive()
        with patch.object(subject, 'MAX_EXPANDED', 2), self.assertRaises(ValueError):
            subject.extract(archive, self.base / 'large', 'app-abc')
        with patch.object(subject, 'MAX_MEMBERS', 1), self.assertRaises(ValueError):
            subject.extract(archive, self.base / 'many', 'app-abc')
        archive = self.archive('duplicates.tar.gz', [('app-abc/a', b'x', 'file')] * 2)
        with self.assertRaises(ValueError):
            subject.extract(archive, self.base / 'duplicates', 'app-abc')

    def test_lock_edit_never_becomes_prepared(self):
        config, _ = self.fixture('--- a/Cargo.lock\n+++ b/Cargo.lock\n@@ -1 +1 @@\n-lock\n+changed\n')
        root = self.base / 'build'
        with self.assertRaisesRegex(ValueError, 'changed Cargo.lock'):
            subject.prepare('app', root, self.base, self.base, config)
        self.assertFalse((root / 'prepared.json').exists())

    def test_failed_patch_never_becomes_prepared(self):
        config, _ = self.fixture('--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-no-match\n+changed\n')
        root = self.base / 'build'
        with self.assertRaisesRegex(ValueError, 'replay failed'):
            subject.prepare('app', root, self.base, self.base, config)
        self.assertFalse((root / 'prepared.json').exists())

    def test_fuzzy_context_is_not_accepted(self):
        config, pin = self.fixture('--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n wrong-header\n-old\n+new\n wrong-footer\n')
        archive = self.archive(members=[('app-abc/Cargo.lock', b'lock\n', 'file'), ('app-abc/file.txt', b'header\nold\nfooter\n', 'file')])
        pin['source_archive_sha256'] = subject.sha(archive)
        (config / 'source-pins.json').write_text(json.dumps({'app': pin}))
        with self.assertRaisesRegex(ValueError, 'replay failed'):
            subject.prepare('app', self.base / 'build', self.base, self.base, config)

    def test_post_build_lock_change_records_failure(self):
        config, _ = self.fixture()
        root = self.base / 'build'
        subject.prepare('app', root, self.base, self.base, config)
        tool_pins = {'tools': {}}
        (config / 'tools.json').write_text(json.dumps(tool_pins))
        hashes = {}
        for name in ('bin/trunk', 'bin/wasm-bindgen', 'cargo/bin/rustup'):
            binary = root / 'tools' / name
            binary.parent.mkdir(parents=True, exist_ok=True)
            binary.write_text('fixture')
            hashes[name] = subject.sha(binary)
        (root / 'tools/ready.json').write_text(json.dumps({'inputs': tool_pins, 'files': hashes}))
        def fake_build(*args, **kwargs):
            (root / 'source/Cargo.lock').write_text('unexpected dependency update')
            packages = root / 'build/packages'
            packages.mkdir()
            (packages / 'app-web-1.zip').write_bytes(b'fixture')
            return subject.subprocess.CompletedProcess(args[0], 0)
        with patch.object(subject.subprocess, 'run', side_effect=fake_build), self.assertRaisesRegex(ValueError, 'Build failed'):
            subject.build(root, config)
        receipt = json.loads((root / 'build/receipt.json').read_text())
        self.assertEqual(receipt['status'], 'failed')
        self.assertFalse(receipt['lock_unchanged'])
        self.assertEqual(len(receipt['packages']), 1)

    def test_success_exit_without_package_records_failure(self):
        config, _ = self.fixture()
        root = self.base / 'build'
        subject.prepare('app', root, self.base, self.base, config)
        tool_pins = {'tools': {}}
        (config / 'tools.json').write_text(json.dumps(tool_pins))
        hashes = {}
        for name in ('bin/trunk', 'bin/wasm-bindgen', 'cargo/bin/rustup'):
            binary = root / 'tools' / name
            binary.parent.mkdir(parents=True, exist_ok=True)
            binary.write_text('fixture')
            hashes[name] = subject.sha(binary)
        (root / 'tools/ready.json').write_text(json.dumps({'inputs': tool_pins, 'files': hashes}))
        def fake_build(*args, **kwargs):
            packages = root / 'build/packages'
            packages.mkdir()
            return subject.subprocess.CompletedProcess(args[0], 0)
        with patch.object(subject.subprocess, 'run', side_effect=fake_build), self.assertRaisesRegex(ValueError, 'Build failed'):
            subject.build(root, config)
        receipt = json.loads((root / 'build/receipt.json').read_text())
        self.assertEqual(receipt['status'], 'failed')
        self.assertTrue(receipt['lock_unchanged'])
        self.assertEqual(receipt['packages'], [])
        self.assertFalse(receipt['fully_checksum_pinned_toolchain'])

    def test_repository_and_symlink_build_roots_refused(self):
        for path in (self.base, self.base / 'repo', self.base / 'repo/child', Path('relative')):
            with self.subTest(path=path), self.assertRaises(ValueError):
                subject.external_root(path)
        (self.base / 'link').symlink_to(self.base / 'target')
        with self.assertRaises(ValueError):
            subject.external_root(self.base / 'link')

    def test_environment_isolated_and_three_jobs(self):
        with patch.dict('os.environ', {'CARGO_HOME': '/shared', 'CARGO_TARGET_DIR': '/shared', 'DIST': '/shared', 'RUSTFLAGS': 'bad', 'CI': 'true'}):
            env = subject.environment(self.base / 'build', {'commit': 'abc'}, 'app')
        self.assertEqual(env['CARGO_BUILD_JOBS'], '3')
        self.assertEqual(env['CARGO_HOME'], str(self.base / 'build/tools/cargo'))
        self.assertEqual(env['RUSTUP_HOME'], str(self.base / 'build/tools/rustup'))
        self.assertNotIn('RUSTFLAGS', env)
        self.assertNotIn('CI', env)
        self.assertEqual(env['TRUNK_TOOLS_WASM_OPT'], 'version_123')
        self.assertEqual(env['TRUNK_TOOLS_WASM_BINDGEN'], '0.2.129')

    def test_photo_served_fonts_are_engine_scoped(self):
        root = self.base / 'build'
        # Photo's package script consumes a distinct input even when CRAFT_FONTS_DIR
        # already exists. Other engines must not inherit a caller's Photo override.
        with patch.dict('os.environ', {'PHOTOCRAFT_WEB_FONTS_DIR': '/unverified-shared-fonts'}):
            for engine in ('photocraft', 'vectorcraft', 'filmcraft', 'figcraft', 'effectcraft', 'soundcraft'):
                with self.subTest(engine=engine):
                    pin = {'commit': 'abc'}
                    if engine in ('photocraft', 'vectorcraft', 'filmcraft', 'figcraft'):
                        pin['fonts'] = {'commit': 'verified-font-revision'}
                    env = subject.environment(root, pin, engine)
                    if engine == 'photocraft':
                        self.assertEqual(env['PHOTOCRAFT_WEB_FONTS_DIR'], str(root / 'fonts'))
                        self.assertEqual(env['CRAFT_FONTS_DIR'], str(root / 'fonts'))
                    else:
                        self.assertNotIn('PHOTOCRAFT_WEB_FONTS_DIR', env)
        with self.assertRaisesRegex(ValueError, 'requires pinned served fonts'):
            subject.environment(root, {'commit': 'abc'}, 'photocraft')

    def test_modified_source_refused_before_build(self):
        config, _ = self.fixture()
        root = self.base / 'build'
        subject.prepare('app', root, self.base, self.base, config)
        (root / 'source/file.txt').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'source changed'):
            subject.build(root, config)
        self.assertFalse((root / 'build').exists())


if __name__ == '__main__':
    unittest.main()
