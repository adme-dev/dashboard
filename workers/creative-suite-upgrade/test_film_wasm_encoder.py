#!/usr/bin/env python3
"""Run the real default-feature H264 encoder in thread-free WASM (requires pinned tools).
Usage: python3 test_film_wasm_encoder.py SOURCE NEW_FIXTURE_DIR TARGET_DIR
The caller supplies PATH/CARGO_HOME/RUSTUP_HOME; this makes no tool installations.
"""
import json
import subprocess
import sys
from pathlib import Path

RUST = r'''
use filmcraft_h264enc::{Encoder, EncoderConfig, YuvFrame};
// Default-feature browser encoder: exercise lookahead, AQ, multiple slices,
// B-frame buffering and flush, with no Web Workers or thread imports.
#[unsafe(no_mangle)]
pub extern "C" fn encode_four_frames() -> u32 {
    let mut cfg = EncoderConfig::new(64, 80, 24, 1);
    cfg.slices = 2;
    let mut enc = match Encoder::new(cfg) { Ok(e) => e, Err(_) => return 100 };
    let mut y = vec![96; 64 * 80];
    let uv = vec![128; 32 * 40];
    let mut count = 0;
    for i in 0..4 {
        y[i * 64] = 160;
        let frame = YuvFrame { y: &y, u: &uv, v: &uv, y_stride: 64, uv_stride: 32 };
        match enc.encode(&frame, i as i64) {
            Ok(packets) => { for p in packets { if p.data.is_empty() { return 102; } count += 1; } },
            Err(_) => return 101,
        }
    }
    for p in enc.flush() { if p.data.is_empty() { return 103; } count += 1; }
    count
}
'''
JAVASCRIPT = r'''
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const module = await WebAssembly.compile(readFileSync(process.argv[2]));
assert.deepEqual(WebAssembly.Module.imports(module), [], 'fixture must not require host threads');
const instance = await WebAssembly.instantiate(module, {});
const count = instance.exports.encode_four_frames();
console.log(JSON.stringify({frames: count, expected: 4}));
assert.equal(count, 4, 'default-feature WASM H264 must encode and flush four frames (100 = constructor error)');
'''

def main():
    source, fixture, target = (Path(p).resolve() for p in sys.argv[1:])
    fixture.mkdir(exist_ok=False)
    (fixture / 'src').mkdir()
    dependency = json.dumps(str(source / 'crates/h264enc'))
    (fixture / 'Cargo.toml').write_text('[package]\nname="filmflow-wasm-h264-regression"\nversion="0.0.0"\nedition="2024"\n[lib]\ncrate-type=["cdylib"]\n[dependencies]\nfilmcraft-h264enc={path=' + dependency + '}\n[workspace]\n')
    (fixture / 'src/lib.rs').write_text(RUST)
    (fixture / 'run.mjs').write_text(JAVASCRIPT)
    # Seed resolution from the candidate lock; do not mutate the source lock.
    (fixture / 'Cargo.lock').write_bytes((source / 'Cargo.lock').read_bytes())
    subprocess.run(['cargo', '+1.95.0', 'build', '--offline', '--release', '--target', 'wasm32-unknown-unknown', '--target-dir', str(target), '--manifest-path', str(fixture / 'Cargo.toml')], check=True)
    subprocess.run(['node', str(fixture / 'run.mjs'), str(target / 'wasm32-unknown-unknown/release/filmflow_wasm_h264_regression.wasm')], check=True)

if __name__ == '__main__':
    main()
