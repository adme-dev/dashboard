"""Bounded inspection of a local owned native archive; never extracts entries."""
import hashlib
import json
import pathlib
import sys
import zipfile

path = pathlib.Path(sys.argv[1])
if path.stat().st_size > 256 * 1024 * 1024:
    raise ValueError('Native archive exceeds 256 MiB')
with zipfile.ZipFile(path) as archive:
    entries = archive.infolist()
    names = [entry.filename for entry in entries]
    if len(entries) > 10000 or len(set(names)) != len(names):
        raise ValueError('Duplicate or excessive archive entries')
    if any(name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts or '\\' in name for name in names):
        raise ValueError('Unsafe archive entry')
    if sum(entry.file_size for entry in entries) > 512 * 1024 * 1024:
        raise ValueError('Expanded archive exceeds 512 MiB')
    if archive.getinfo('manifest.json').file_size > 8 * 1024 * 1024:
        raise ValueError('Oversize native manifest')
    manifest = json.loads(archive.read('manifest.json'))
    if manifest.get('format_version') != 1 or manifest.get('generator') != 'photocraft-format 0.16.0':
        raise ValueError('Unsupported native archive version')
    # Binding the actual compressed payload catches altered bytes under a reused tile name.
    payloads = {name: hashlib.sha256(archive.read(name)).hexdigest()
                for name in names if name.startswith(('tiles/', 'blobs/'))}
    print(json.dumps({'manifest': manifest, 'payloads': payloads}))
