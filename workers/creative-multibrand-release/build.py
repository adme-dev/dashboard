"""Build the multi-brand offer date fix onto the verified vehicle-image Worker."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'creative-vehicle-images-release' / 'build.py'
SPEC = importlib.util.spec_from_file_location('vehicle_images_release', SOURCE)
vehicle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(vehicle)
BASE_HASHES = {
    'worker.js': '17d54fbd7c20ebeb2ae2ae056da47b9989fc295a7f43aca097e75d76ce306349',
    'brand-rpc.mjs': '3e299b879319fbedfb990604716483cfcaceb82b814df33f4413643234f68b16',
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def replace_one(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError('Offer date patch anchor changed')
    return source.replace(before, after)


def build():
    vehicle.build()
    base = {name: (SOURCE.parent / 'dist' / name).read_bytes() for name in BASE_HASHES}
    if {name: digest(body) for name, body in base.items()} != BASE_HASHES:
        raise RuntimeError('Vehicle-image Worker source changed')
    rpc = base['brand-rpc.mjs'].decode()
    rpc = replace_one(rpc,
        "    const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000000 ? value : null\n",
        """    const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000000 ? value : null
    const offerEndDate = value => {
      if (value == null) return null
      if (typeof value !== 'string') fail(502, 'invalid_motorstack_catalog')
      if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value
      const match = /^(\\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\\d{4})$/.exec(value)
      if (!match) fail(502, 'invalid_motorstack_catalog')
      const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(match[2])
      const day = Number(match[1]); const year = Number(match[3])
      const date = new Date(Date.UTC(year, month, day))
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) fail(502, 'invalid_motorstack_catalog')
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
""")
    rpc = replace_one(rpc,
        "        if (item.end_date != null && (typeof item.end_date !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(item.end_date))) fail(502, 'invalid_motorstack_catalog')\n",
        "        const endDate = offerEndDate(item.end_date)\n")
    rpc = replace_one(rpc, "          endDate: item.end_date ?? null,\n", "          endDate,\n")
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    candidate = {'worker.js': base['worker.js'], 'brand-rpc.mjs': rpc.encode()}
    for name, body in candidate.items():
        (output / name).write_bytes(body)
    manifest = {'baseHashes': BASE_HASHES, 'moduleHashes': {name: digest(body) for name, body in candidate.items()}}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    print(json.dumps(build(), indent=2))
