"""Add install metadata and the shared dock without changing editor binaries or storage."""
from html import escape
from pathlib import Path
import json
import re

APPS = (
    ('photocraft', 'photoflow', 'PhotoFlow', 'PF', '#3b82f6'),
    ('vectorcraft', 'vectorflow', 'VectorFlow', 'VF', '#06b6d4'),
    ('effectcraft', 'effectflow', 'EffectFlow', 'EF', '#8b5cf6'),
    ('filmcraft', 'filmflow', 'FilmFlow', 'FF', '#f97316'),
    ('soundcraft', 'soundflow', 'SoundFlow', 'SF', '#10b981'),
    ('figcraft', 'figflow', 'FigFlow', 'FIG', '#ec4899'),
)
ICONS = [
    {'src': '/xeroflow-icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
    {'src': '/xeroflow-icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
    {'src': '/xeroflow-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
]
BEGIN = '<!-- xeroflow-app-support:start -->'
END = '<!-- xeroflow-app-support:end -->'


def _manifest(name, scope, background):
    return {
        'id': scope, 'name': name, 'short_name': name, 'start_url': scope,
        'scope': scope, 'display': 'standalone', 'background_color': background,
        'theme_color': background, 'lang': 'en', 'icons': ICONS,
    }


def _shell(page, name, manifest, editor):
    html = page.read_text()
    html = re.sub(r'\n?' + re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', '', html, flags=re.S)
    # Retain all scripts, preloads and integrity attributes; only replace install metadata.
    html = re.sub(r'<link\b(?=[^>]*\brel=["\'](?:manifest|apple-touch-icon)["\'])[^>]*>\s*', '', html, flags=re.I)
    html = re.sub(r'<meta\b(?=[^>]*\bname=["\'](?:theme-color|apple-mobile-web-app-capable|mobile-web-app-capable|apple-mobile-web-app-title)["\'])[^>]*>\s*', '', html, flags=re.I)
    tags = [BEGIN,
            f'<link rel="manifest" href="{manifest}">',
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">',
            '<meta name="mobile-web-app-capable" content="yes">',
            '<meta name="apple-mobile-web-app-capable" content="yes">',
            f'<meta name="apple-mobile-web-app-title" content="{escape(name, quote=True)}">',
            f'<meta name="theme-color" content="{"#1b1b1e" if editor else "#0a0b0e"}">',
            '<link rel="stylesheet" href="/install-app.css">',
            '<script type="module" src="/install-app.js"></script>']
    if editor:
        tags += ['<link rel="stylesheet" href="/editor-dock.css">',
                 '<script type="module" src="/editor-dock.js"></script>',
                 '<script type="module" src="/auth-session.js"></script>',
                 '<script type="module" src="/asset-library.js"></script>']
    tags += [END]
    if not re.search(r'</head\s*>', html, flags=re.I):
        raise ValueError(f'Missing head in {page}')
    page.write_text(re.sub(r'</head\s*>', lambda _: '\n' + '\n'.join(tags) + '\n</head>', html, count=1, flags=re.I))


def install_support(public: Path, pins: dict):
    """Write stable install identities and decorate current plus retained editor versions.

    Stable /<app>/ start URLs must be redirected to the selected version by the host.
    No service worker or offline/cache/storage behavior is added here.
    """
    public = Path(public)
    known = {app[0] for app in APPS}
    if not pins or set(pins) - known:
        raise ValueError('Expected one or more supported editor pins')
    for icon in (*[i['src'][1:] for i in ICONS], 'apple-touch-icon.png'):
        if not (public / icon).is_file():
            raise ValueError(f'Missing install icon: {icon}')
    root_manifest = _manifest('XeroFlow Creative Suite', '/', '#0a0b0e')
    root_manifest['short_name'] = 'XeroFlow'
    (public / 'manifest.webmanifest').write_text(json.dumps(root_manifest, indent=2) + '\n')
    apps = []
    for engine, brand, name, short, color in APPS:
        if engine not in pins:
            continue
        directory = public / brand
        directory.mkdir(exist_ok=True)
        manifest = _manifest(name, f'/{brand}/', '#1b1b1e')
        (directory / 'manifest.webmanifest').write_text(json.dumps(manifest, indent=2) + '\n')
        apps.append({'id': brand, 'name': name, 'url': f'/{brand}/', 'color': color, 'short': short})
        for page in directory.glob('*/index.html'):
            _shell(page, name, f'/{brand}/manifest.webmanifest', True)
    (public / 'editor-apps.json').write_text(json.dumps({'apps': apps}, indent=2) + '\n')
    if (public / 'index.html').is_file():
        _shell(public / 'index.html', 'XeroFlow Creative Suite', '/manifest.webmanifest', False)
