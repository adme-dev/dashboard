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
    'browser_bridge_designer_context_requires_exact_revision_and_empty_params',
    'browser_bridge_status_and_inspect_strip_paths',
    'browser_bridge_designer_import_snapshot_replay_and_revision_fence',
}
matched = re.findall(
    r'^test (?:browser_bridge::tests::)?(browser_bridge_[A-Za-z0-9_]+) \.\.\. ok$',
    Path(sys.argv[1]).read_text(),
    re.M,
)
if len(matched) != len(expected) or set(matched) != expected:
    raise SystemExit(f'Expected exactly nine passing browser_bridge tests; matched {len(matched)}: {matched}')
PY
  cargo test --locked -p figcraft-ui-egui --lib edm_ > "$evidence/test-edm-ui.log" 2>&1
  python3 - "$evidence/test-edm-ui.log" <<'PY'
import re,sys
from pathlib import Path
expected = {
    'edm_menu_history_uses_the_canonical_log_and_preserves_native_recovery',
    'edm_canvas_cmd_z_replays_the_canonical_log_once_per_press',
    'edm_canvas_cmd_z_undoes_an_unlogged_native_edit_generically_before_the_log',
    'edm_cmd_z_in_a_panel_field_or_the_palette_leaves_the_log_alone',
    'edm_cmd_z_while_editing_canvas_text_ends_the_edit_and_undoes_the_typing_generically',
    'edm_panel_structural_targets_omit_absent_column_and_keep_column_zero',
    'edm_panel_structural_emission_matches_shared_targets_and_engine_admits_it',
    'edm_panel_field_commit_logs_only_a_changed_value',
}
matched = re.findall(r'^test (?:[A-Za-z0-9_]+::)*(edm_[A-Za-z0-9_]+) \.\.\. ok$', Path(sys.argv[1]).read_text(), re.M)
if len(matched) != len(expected) or set(matched) != expected:
    raise SystemExit(f'Expected exactly 8 passing EDM UI tests; matched {len(matched)}: {matched}')
PY
  cargo test --locked -p figcraft-engine --lib edm_ > "$evidence/test-edm.log" 2>&1
  python3 - "$evidence/test-edm.log" <<'PY'
import re,sys
from pathlib import Path
expected = {
    'edm_campaign_content_noop_preserves_exact_kind_and_baseline',
    'edm_campaign_content_edit_preserves_kind_metadata_and_locks',
    'edm_campaign_designer_noop_preserves_exact_kind_and_baseline',
    'edm_campaign_designer_edits_and_history_preserve_kind_metadata_and_locks',
    'edm_campaign_modes_reject_module_arbitrary_and_missing_kinds',
    'edm_campaign_content_retains_manifest_policy_and_native_change_refusals',
    'edm_campaign_designer_retains_lock_token_asset_and_capability_refusals',
    'edm_campaign_designer_retains_linked_module_pins_and_locks',
    'edm_content_roundtrip_preserves_canonical_identity_and_locked_fields',
    'edm_snapshot_rejects_native_additions_and_style_changes',
    'edm_snapshot_rejects_deletions_and_unexpected_metadata',
    'edm_image_url_change_requires_bytes_then_reopens_current_paint',
    'edm_policy_and_column_geometry_stay_bounded_and_non_overlapping',
    'edm_font_stacks_resolve_registered_families_and_heading_weights',
    'edm_rich_projection_runs_entities_and_bounds',
    'edm_rich_anchor_spacers_measured_and_protected',
    'edm_rich_fallback_heading_and_designer_preserve_source',
    'edm_modern_styled_import_is_visible_semantic_and_noop_lossless',
    'edm_content_edit_reflows_once_without_phantom_or_compound_edits',
    'edm_designer_context_maps_selection_without_saving_or_inventing_target',
    'edm_designer_context_rejects_unmapped_and_unlogged_selection',
    'edm_designer_noop_and_empty_image_preserve_exact_baseline',
    'edm_designer_combined_mobile_style_structure_and_reflow_stays_canonical',
    'edm_designer_duplicate_ids_remap_dfs_and_same_list_reordering',
    'edm_designer_locks_and_module_metadata_cannot_be_bypassed',
    'edm_designer_rejects_unlogged_canvas_text_and_geometry_changes',
    'edm_designer_image_reuse_and_empty_placeholder_survive_reopen',
    'edm_designer_brand_defaults_apply_only_to_new_blocks',
    'edm_designer_image_reuse_uses_immutable_baseline_for_aba_empty_and_snapshots',
    'edm_designer_legal_address_tokens_lock_capabilities_and_every_mutation_kind',
    'edm_designer_merge_tokens_match_nested_unmatched_and_multiple_shared_scanning',
    'edm_designer_safe_url_rejects_credentials_and_invalid_fragment_shorthand',
    'edm_designer_structural_children_require_exact_container_and_column_shapes',
    'edm_designer_undo_redo_replays_baseline_with_deterministic_ids_and_reorder',
    'edm_designer_history_restores_image_bytes_and_discards_redo_after_new_edit',
    'edm_designer_history_failures_are_atomic_for_native_and_invalid_log_changes',
    'edm_designer_legal_lock_follows_shared_regex_offsets_separators_and_js_whitespace',
    'edm_designer_shared_capability_vectors_import_and_tampering_is_refused',
    'edm_designer_shared_mutation_vectors_refuse_text_style_move_duplicate_and_remove',
    'edm_designer_shared_link_vectors_reject_authority_credentials_for_every_scheme',
    'edm_designer_native_match_tracks_unlogged_edits_and_their_generic_undo',
    'edm_snapshot_rebuild_keys_verified_image_bytes_by_block_and_drops_replaced_bytes',
    'edm_designer_style_locks_match_shared_desktop_mobile_and_inherited_paths',
    'edm_designer_structural_column_index_follows_shared_optional_integer_target',
}
matched = re.findall(r'^test (?:cmd::edm::tests::)?(edm_[A-Za-z0-9_]+) \.\.\. ok$', Path(sys.argv[1]).read_text(), re.M)
if len(matched) != len(expected) or set(matched) != expected:
    raise SystemExit(f'Expected exactly 44 passing EDM tests; matched {len(matched)}: {matched}')
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
