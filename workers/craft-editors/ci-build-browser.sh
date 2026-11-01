#!/usr/bin/env bash
# CI-only pinned upstream source build/test. No dashboard build or deployment.
# Usage: bash ci-build-browser.sh ENGINE web|test
set -euo pipefail
engine="${1:?engine required}"
mode="${2:?web or test required}"
case "$engine:$mode" in figcraft:web|figcraft:test) ;; *) exit 2;; esac
[[ "$(uname -s):$(uname -m)" == Linux:x86_64 ]] || { echo 'Linux x86_64 runner required'; exit 2; }
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
job_root="${RUNNER_TEMP:?GitHub runner temp directory required}/creative-${engine}-${mode}"
source_root="$job_root/source"
tools_root="$job_root/tools"
evidence="$RUNNER_TEMP/creative-artifacts/$engine-$mode"
mkdir -p "$evidence"
# Leave a receipt and only owned logs/artifacts even when compilation fails.
finish() {
  result=$?
  trap - EXIT
  python3 - "$source_root" "$evidence" "$engine" "$mode" "$result" <<'PY'
import hashlib,json,os,shutil,sys
from pathlib import Path
root,out=map(Path,sys.argv[1:3]);engine,mode,status=sys.argv[3:]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p in root.glob('*.log'):
    shutil.copyfile(p,out/p.name)
artifacts=[]
for p in (root/'branded-archives').glob('*.zip'):
    shutil.copyfile(p,out/p.name)
    artifacts.append({'name':p.name,'size':p.stat().st_size,'sha256':sha(p)})
lock=root/engine/'Cargo.lock'
receipt={'engine':engine,'mode':mode,'exit_code':int(status),'repository_commit':os.environ.get('GITHUB_SHA'),
         'run_id':os.environ.get('GITHUB_RUN_ID'),'run_attempt':os.environ.get('GITHUB_RUN_ATTEMPT'),
         'cargo_lock_sha256_after':sha(lock)if lock.is_file()else None,'archives':artifacts}
(out/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
PY
  exit "$result"
}
trap finish EXIT
python3 "$script_root/ci-setup.py" "$engine" "$source_root" "$tools_root" "$evidence" > "$evidence/setup.log" 2>&1
export RUSTUP_HOME="$tools_root/rustup"
export CARGO_HOME="$tools_root/cargo"
export CARGO_TARGET_DIR="$source_root/target"
export CARGO_BUILD_JOBS=3
export CARGO_INCREMENTAL=0
export CARGO_PROFILE_DEV_DEBUG=0
export CARGO_PROFILE_TEST_DEBUG=0
export NO_COLOR=true
export PATH="$CARGO_HOME/bin:$tools_root/bin:$PATH"
"$tools_root/rustup-init" -y --no-modify-path --profile minimal --default-toolchain 1.95.0 --target wasm32-unknown-unknown >> "$evidence/setup.log" 2>&1
{
  rustc --version
  cargo --version
  trunk --version
  wasm-bindgen --version
} > "$evidence/tool-versions.log"
if [[ "$mode" == web ]]; then
  bash "$script_root/build-browser.sh" "$source_root" "$tools_root" "$engine" > "$evidence/package.log" 2>&1
else
  export CARGO_BUILD_JOBS=2
  export CRAFT_FONTS_DIR="$source_root/fonts/$engine"
  export CRAFT_FONTS_REQUIRED=1
  cd "$source_root/$engine"
  for filter in browser_save_tests xf_mark_tests save_as_tests variables_export_ui_tests browser_bridge; do
    cargo test --locked -p figcraft-ui-egui --lib "$filter" > "$evidence/test-$filter.log" 2>&1
  done
  python3 - "$evidence/test-browser_bridge.log" <<'PY'
import re,sys
from pathlib import Path
expected = {
    'browser_bridge_create_replay_and_id_conflict',
    'browser_bridge_rejects_stale_and_wrong_document',
    'browser_bridge_rejects_arbitrary_commands_paths_and_nested_properties',
    'browser_bridge_update_targets_explicit_node',
    'browser_bridge_mutation_requires_revision_and_receipts_never_evict',
    'browser_bridge_large_integer_identifiers_are_lossless',
    'browser_bridge_status_and_inspect_strip_paths',
}
matched = re.findall(
    r'^test (?:browser_bridge::tests::)?(browser_bridge_[A-Za-z0-9_]+) \.\.\. ok$',
    Path(sys.argv[1]).read_text(),
    re.M,
)
if len(matched) != len(expected) or set(matched) != expected:
    raise SystemExit(f'Expected exactly seven passing browser_bridge tests; matched {len(matched)}: {matched}')
PY
  cargo test --locked -p figcraft-engine --lib browser_export_bound > "$evidence/test-browser-export-bound.log" 2>&1
  cargo test --locked -p figcraft-format --lib zip_files > "$evidence/test-zip-files.log" 2>&1
fi
python3 - "$script_root/source-pins.json" "$source_root/$engine/Cargo.lock" "$engine" <<'PY'
import hashlib,json,sys
from pathlib import Path
pin=json.loads(Path(sys.argv[1]).read_text())[sys.argv[3]]
if hashlib.sha256(Path(sys.argv[2]).read_bytes()).hexdigest()!=pin['cargo_lock_sha256']:
    raise SystemExit('Cargo.lock changed during CI execution')
PY
