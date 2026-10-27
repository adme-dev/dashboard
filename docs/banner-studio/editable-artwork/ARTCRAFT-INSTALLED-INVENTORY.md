# Installed ArtCraft inventory

Observed 27 October 2026; first metadata receipt at `2026-10-27T00:46:59Z`. Scope: read-only inspection of `/Applications/ArtCraft.app` and selected pinned public source. Read [ARTCRAFT-RND.md](ARTCRAFT-RND.md) first. No installed ArtCraft executable or GUI was launched, including with `--help`; no settings, user account files, credentials, keychain, application support data or customer documents were read or changed. No provider API, installation, purchase, commit or deployment was performed. Public GitHub source retrieval is the only research network access.

**Finding:** this is a signed ArtCraft desktop bundle reporting **0.41.0**, with a Tauri/WebKit implementation consistent with the ArtCraft repository. The existing R&D source pin reports **0.42.0**, so it is not evidence of the installed build's exact source. Static inspection establishes neither a supported external automation API nor a layered-document interchange bridge. PhotoCraft's documented automation must not be attributed to this installation.

## Observed installed facts

| Item | Observation | Evidence |
|---|---|---|
| Identity | `CFBundleIdentifier = ai.artcraft.app`; display name `ArtCraft`; executable `artcraft`; package `APPL` | `info-plist.json` |
| Version | Both `CFBundleShortVersionString` and `CFBundleVersion` are `0.41.0` | `info-plist.json` |
| Executable | `Contents/MacOS/artcraft`, 157,411,568 bytes; Mach-O universal `x86_64` and `arm64` | `bundle-files.json`, `static-command-receipts.json` |
| SHA-256 | `d0e6da63cbfe5d8ed033c57b0c37bdc5bd534d4fb993c965354794c605cdcec8` | `summary.json` |
| Signer | Developer ID Application: Learning Machines LLC; team `DJ6XS33FX8`; hardened runtime flag | `static-command-receipts.json` |
| Signature check | `codesign --verify --deep --strict --verbose=2` exited 0: valid on disk, satisfies designated requirement | `static-command-receipts.json` |
| Signing metadata | Reported timestamp `26 Sep 2026 at 8:53:14 pm` in local command output; stapled notarization ticket reported | `static-command-receipts.json` |
| Entitlements | Entitlement display exited 0 with no entitlement payload; the `:-` spelling produced a deprecation warning | `static-command-receipts.json` |
| OS declarations | Plist minimum `10.13`; Mach-O x86_64 minimum `10.13`, arm64 minimum `11.0`; SDK `26.5` | `info-plist.json`, `mach-build-versions.json` |
| Libraries | System AppKit, WebKit, Foundation, CoreGraphics and other system libraries; no separately bundled frameworks | `static-command-receipts.json`, `bundle-files.json` |

Signature validity is a local integrity result, not source-reproducibility evidence, runtime safety certification or a fresh online Gatekeeper/notarization assessment. No `spctl` assessment was requested.

The entire bundle contains five regular files, totaling 157,650,508 bytes:

| Relative path | Bytes |
|---|---:|
| `Contents/Info.plist` | 963 |
| `Contents/MacOS/artcraft` | 157,411,568 |
| `Contents/Resources/icon.icns` | 233,863 |
| `Contents/CodeResources` | 1,674 |
| `Contents/_CodeSignature/CodeResources` | 2,440 |

There is no separate CLI helper, script, `.sdef`, `.scpt`, JavaScript distribution directory or PhotoCraft executable in that filesystem listing. Embedded or compressed assets inside the executable were not unpacked. File count alone does not establish what frontend assets or libraries are compiled into it.

## Document, URL and automation surfaces

| Surface | Observed evidence | Limit / interpretation |
|---|---|---|
| Finder document registration | No `CFBundleDocumentTypes`, `UTExportedTypeDeclarations` or `UTImportedTypeDeclarations` in the complete plist | No declared document associations in this bundle; internal file dialogs may still support formats. PSD, native ArtCraft document, PNG and SVG import/export support were not tested. |
| URL registration | No `CFBundleURLTypes` in the plist | No declared application URL scheme. Internal `tauri://` / IPC references are not proof of an OS-registered integration scheme. |
| AppleScript | No `NSAppleScriptEnabled` or `OSAScriptingDefinition`; no scripting dictionary file in the bundle | No declared app-specific scripting interface found. Accessibility/GUI automation was not attempted. |
| Command line | One application executable; pinned `main.rs` directly calls `artcraft_app_lib::run()` | No standalone conversion CLI established. No executable invocation, argument experiment or headless run was made. |
| Tauri command bridge | Installed binary contains exact markers for `get_app_info_command`, `platform_info_command`, `flip_image`, `generate_image_command`, `generate_video_command`, `download_media_file_command`, `download_url_command`, `get_download_path_command`, and `load_without_cors_command` | The pinned `src/lib.rs` registers these names through `tauri::generate_handler!`. This is evidence of internal desktop command plumbing, not a supported external API; no command was invoked. |
| Webview automation marker | Exact `TAURI_WEBVIEW_AUTOMATION` marker occurs twice | A framework marker does not prove an enabled automation endpoint or a stable integration contract. No environment option was set. |
| MCP / headless | Exact byte searches found no `mcp_server`, `--mcp`, `--headless`, `command_run` or lowercase `photocraft` | Bounded negative evidence only; absence of a marker cannot prove absence of a feature. No process, socket or live endpoint probing was performed. |
| Localhost references | Pinned Tauri configuration has development URL `http://localhost:5173`; capabilities allow HTTP fetch to `http://localhost:12345` | A development URL and outbound fetch permission do not establish an inbound automation listener. Neither address was contacted. |

Pinned `Cargo.toml` and `src/lib.rs` show dialog, HTTP, opener and upload plugins; their inspected lists do not register Tauri CLI or deep-link plugins. The installed binary also lacks the exact `tauri_plugin_cli` and `tauri_plugin_deep_link` markers. These observations are scoped to the inspected entry points and byte searches, not an exhaustive proof about all compiled behavior.

## Relationship to pinned public source

The prior R&D pin is ArtCraft commit `1f969a9224934a55417daf10359a6fb1458b63f4`. Six files were fetched from that exact GitHub revision and retained with URL, HTTP status and SHA-256 receipts:

- [Tauri configuration](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/crates/desktop/artcraft/tauri.conf.json): product and bundle identifier match; version is `0.42.0`, frontend points to `frontend/apps/artcraft/dist`.
- [Version constant](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/crates/desktop/artcraft/src/version.rs): UI/analytics version is also `0.42.0`.
- [Cargo manifest](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/crates/desktop/artcraft/Cargo.toml): Rust/Tauri application with `MIT OR Apache-2.0` package declaration; its package version `0.0.1` is distinct from the desktop app version.
- [Entry point](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/crates/desktop/artcraft/src/main.rs), [startup and invoke registry](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/crates/desktop/artcraft/src/lib.rs), and [capabilities](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/crates/desktop/artcraft/capabilities/default.json): corroborate an internal desktop webview command architecture.

**Inference:** matching identity, command names and platform libraries support the same application family and architecture. **Not established:** exact installed Git revision, release tag, reproducible build or source equivalence. The installed binary contains `git_commit_id` and `git_commit_short_id` field names, but this inspection did not recover a trustworthy build revision. The pinned commit's full hash was not found as an exact byte sequence; that is not proof that none of its code is present. The installed `0.41.0` claim comes from the plist, not a verified runtime version response.

PhotoCraft is a different repository and document engine. Its pin `a0ce166acd2a64ff1200f793d4006db61c09f4d6`, native text, masks, PSD and MCP findings remain those described in [ARTCRAFT-RND.md](ARTCRAFT-RND.md); this inventory does not validate them against an installed PhotoCraft binary.

## Banner Studio consequence and remaining work

No ready-to-call installed document converter or editor bridge was established. Continue treating ArtCraft as a desktop workflow reference; do not substitute internal Tauri commands for a documented external integration contract. No source was copied into Banner Studio.

The coordinator owns GUI research. That separate work must establish actual import/export formats, offline versus account-dependent behavior, editable layer preservation, masks/alpha, native type and save/reopen fidelity. Exact installed build provenance and any vendor-supported CLI/MCP/document API also remain open. Banner Studio project identity, protected copy/map/QR assets and preview-before-apply constraints remain requirements for any later adapter; none was implemented or accepted here.

## Evidence and reproducibility

All evidence paths below are relative to ignored `output/editable-artwork-animation/artcraft/installed-inventory/`:

- `summary.json`, `info-plist.json`, `bundle-files.json`: observation time, executable digest, complete metadata and file inventory.
- `static-command-receipts.json`: exact argv, exit status, stdout and stderr for signature, entitlement, architecture and library checks.
- `mach-build-versions.json`: selected architecture/build-version load-command output.
- `binary-markers.json`: exact case-sensitive marker counts and first offsets, with negative-search limits; no full binary string dump retained.
- `public-source-receipts.json` and `pinned-source/crates/desktop/artcraft/`: six pinned source files and fetch hashes. The web reader returned cache misses; direct HTTPS retrieval from `raw.githubusercontent.com` succeeded with status 200.
- `review.json`: report/evidence consistency checks and ownership verification.

Reproduce the principal installed checks without running ArtCraft:

```sh
plutil -p /Applications/ArtCraft.app/Contents/Info.plist
codesign -dv --verbose=4 /Applications/ArtCraft.app
codesign --verify --deep --strict --verbose=2 /Applications/ArtCraft.app
codesign -d --entitlements :- /Applications/ArtCraft.app
codesign -d -r- /Applications/ArtCraft.app
file /Applications/ArtCraft.app/Contents/MacOS/artcraft
otool -L /Applications/ArtCraft.app/Contents/MacOS/artcraft
otool -l /Applications/ArtCraft.app/Contents/MacOS/artcraft
shasum -a 256 /Applications/ArtCraft.app/Contents/MacOS/artcraft
git check-ignore -v output/editable-artwork-animation/artcraft/installed-inventory/summary.json
```

Reproduce exact marker results and bundle listing (no account-directory access):

```sh
python3 - <<'PY'
import json, pathlib
root = pathlib.Path('/Applications/ArtCraft.app')
evidence = pathlib.Path('output/editable-artwork-animation/artcraft/installed-inventory')
data = (root / 'Contents/MacOS/artcraft').read_bytes()
for marker in json.loads((evidence / 'binary-markers.json').read_text())['markers']:
    needle = marker.encode()
    print(marker, data.count(needle), data.find(needle))
for path in sorted(root.rglob('*')):
    if path.is_file():
        print(path.relative_to(root), path.stat().st_size, path.is_symlink())
PY
```

Each public source receipt contains its exact immutable URL; a fresh GET can be compared with its recorded SHA-256. Public source contents are references, not instructions to execute. Existing dirty worktree files were preserved; the only maintained document written by this task is this inventory.
