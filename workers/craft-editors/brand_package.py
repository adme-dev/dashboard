"""Apply the shared XeroFlow mark to a prepared editor shell, never to WASM bytes."""
from pathlib import Path
import hashlib
import json
import re
import shutil


def brand_package(directory: Path, engine: str, static: Path):
    logo = 'xeroflow-logo.svg'
    shutil.copyfile(static / logo, directory / logo)
    page = directory / 'index.html'
    html = page.read_text()
    # Replace only icon links; preserve WASM/JS preloads and their integrity hashes.
    html = re.sub(r'<link\b[^>]*\brel=["\'](?:icon|shortcut icon|apple-touch-icon)["\'][^>]*>', '', html, flags=re.I)
    loading = 'loading' if engine in ('effectcraft', 'filmcraft') else engine + '_loading'
    if f'id="{loading}"' not in html:
        raise ValueError(f'Unknown loading screen for {engine}')
    # A pseudo-element survives the photo bootloader replacing its progress text.
    style = f'''<style id="xeroflow-loading-brand">
#{loading} > img {{ display: none !important; }}
#{loading}::before {{ content: ""; display: block; flex: 0 0 56px; width: 56px; height: 56px; margin: 0 auto 16px; background: url("./{logo}") center / contain no-repeat; }}
</style>'''
    html = re.sub(r'<style id="xeroflow-loading-brand">.*?</style>', '', html, flags=re.S)
    html = html.replace('</head>', f'<link rel="icon" href="./{logo}" type="image/svg+xml">\n{style}\n</head>')
    page.write_text(html)
    manifest = directory / 'manifest.webmanifest'
    if manifest.exists():
        data = json.loads(manifest.read_text())
        data['icons'] = [{'src': './' + logo, 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'any'}]
        manifest.write_text(json.dumps(data, indent=2) + '\n')
    sw = directory / 'sw.js'
    if sw.exists():
        script = sw.read_text()
        # Bust only the app-shell cache; never touch document databases or OPFS.
        script, count = re.subn(r'const FILES = (\[.*?\]);', lambda m: 'const FILES = ' + json.dumps(list(dict.fromkeys(json.loads(m[1]) + ['./' + logo]))) + ';', script, count=1)
        if count != 1:
            raise ValueError(f'Unknown service-worker precache in {engine}')
        digest = hashlib.sha256((html + (manifest.read_text() if manifest.exists() else '') + (static / logo).read_text()).encode()).hexdigest()[:16]
        script, count = re.subn(r'const VERSION = "[^"]+";', f'const VERSION = "xf-{digest}";', script, count=1)
        if count != 1:
            raise ValueError(f'Unknown service-worker version in {engine}')
        sw.write_text(script)
