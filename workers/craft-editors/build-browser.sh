#!/usr/bin/env bash
# Build one settled, patched source tree at a time. See source-pins.json and README.
# Usage: bash build-browser.sh SOURCE_ROOT TOOL_ROOT ENGINE
set -euo pipefail
source_root="${1:?source root required}"
tools_root="${2:?isolated tool root required}"
engine="${3:?engine required}"
case "$engine" in photocraft|vectorcraft|effectcraft|filmcraft|soundcraft|figcraft) ;; *) exit 2;; esac
source_root="$(cd "$source_root" && pwd)"
tools_root="$(cd "$tools_root" && pwd)"
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 - "$script_root" "$source_root" "$engine" <<'PY'
import hashlib,json,shutil,sys
from pathlib import Path
scripts,root,engine=Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3]
pin=json.loads((scripts/'source-pins.json').read_text())[engine]
if hashlib.sha256((root/engine/'Cargo.lock').read_bytes()).hexdigest()!=pin['cargo_lock_sha256']:
    raise SystemExit('Cargo.lock differs from pinned source')
if shutil.disk_usage(root).free<2*1024**3:
    raise SystemExit('Less than 2 GiB free; preserve sources and clear only owned build intermediates')
PY
export RUSTUP_HOME="$tools_root/rustup"
export CARGO_HOME="$tools_root/cargo"
export CARGO_TARGET_DIR="${FLOW_BUILD_TARGET_DIR:-$source_root/target}"
python3 - "$source_root" "$CARGO_TARGET_DIR" <<'PY_TARGET'
from pathlib import Path
import sys
root, target = map(lambda p: Path(p).resolve(), sys.argv[1:])
if target == root or root not in target.parents:
    raise SystemExit('Build target must be a dedicated directory inside SOURCE_ROOT')
PY_TARGET
export CARGO_BUILD_JOBS="${FLOW_BUILD_JOBS:-3}"
export CARGO_INCREMENTAL=0
export NO_COLOR=true
export PATH="$tools_root/cargo/bin:$tools_root/bin:$PATH"
rustc --version | grep -q '^rustc 1.95.0 '
trunk --version | grep -q '0.21.14'
wasm-bindgen --version | grep -q '0.2.129'
if [[ -d "$source_root/fonts/$engine" ]]; then
  export CRAFT_FONTS_DIR="$source_root/fonts/$engine"
  export CRAFT_FONTS_REQUIRED=1
fi
cd "$source_root/$engine"
shasum -a 256 Cargo.lock > "$source_root/$engine-lock-before.sha256"
bash packaging/web/package.sh > "$source_root/build-$engine.log" 2>&1
shasum -a 256 -c "$source_root/$engine-lock-before.sha256"
mkdir -p "$source_root/branded-archives"
cp dist/release/*-web-*.zip "$source_root/branded-archives/"
