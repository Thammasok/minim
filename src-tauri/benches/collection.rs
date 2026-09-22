//! Performance benchmark harness — the machine-checkable halves of NFR-001 (open),
//! NFR-002 (get_node_detail) and NFR-004 (resident memory) over the T-003 fixture
//! `tests/fixtures/large/collection-2000-seed0.json` (2000 leaves, ~5 MB).
//!
//! Three budgets, asserted **inside** this harness (a violated budget panics → `cargo bench`
//! exits non-zero → CI fails the build):
//!   - TC-U-051  parse+index via the real `open_path` wiring   p95 < 800 ms
//!   - TC-U-052  `get_node_detail` on shallow `"0"` + a deep leaf  p95 < 5 ms
//!   - TC-U-053  peak resident memory with the fixture loaded      < 400 MB
//!
//! The render-side halves of those NFRs belong to the frontend tasks; this file is the
//! parse/index/memory side only. Criterion builds the trend report; the authoritative
//! acceptance check is the same wall-clock p95 / RSS asserted right here, so a regression
//! beyond the plan's thresholds fails even without a separate threshold tool.

use std::path::PathBuf;
use std::time::Instant;

use criterion::{criterion_group, criterion_main, Criterion};

use minim_lib::commands::collection::{node_detail_impl, open_path, AppState};
use minim_lib::index::{build_index, NodeKind};
use minim_lib::schema_gate::load;

/// TC-U-051 — parse+index core budget. NFR-001's 1.5 s p95 is for the whole open flow; the
/// plan allocates this machine-checkable half < 800 ms so render keeps headroom.
const PARSE_INDEX_P95_MS: f64 = 800.0;
/// TC-U-052 — node-detail lookup budget. NFR-002's 100 ms p95 belongs to the whole
/// render-on-select flow; the O(1) arena lookup gets < 5 ms of it.
const NODE_DETAIL_P95_MS: f64 = 5.0;
/// TC-U-053 — resident memory budget with the fixture loaded.
const RSS_KB: u64 = 400 * 1024;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/large")
}

/// Path of the 2000-leaf fixture. The file is gitignored by design (T-003), so on a fresh
/// checkout it is regenerated from the checked-in deterministic generator — `node` is a hard
/// requirement of this crate anyway (tauri-build reads `../dist`), and seed 0 is byte-stable.
fn ensure_fixture() -> PathBuf {
    let path = fixtures_dir().join("collection-2000-seed0.json");
    if path.exists() {
        return path;
    }
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/tools/generate-large.mjs");
    let status = std::process::Command::new("node")
        .arg(&script)
        .args(["--seed", "0", "--leaves", "2000", "--out"])
        .arg(&path)
        .status()
        .unwrap_or_else(|e| panic!("fixture missing and node generator could not run: {e}"));
    assert!(
        status.success(),
        "node fixture generator failed ({status:?})"
    );
    path
}

/// 95th percentile of a sample set (ms), ceil-indexed so the tail is counted.
fn p95_ms(mut samples: Vec<f64>) -> f64 {
    samples.sort_by(|a, b| a.partial_cmp(b).expect("NaN in a benchmark sample"));
    let idx = (((samples.len() - 1) as f64) * 0.95).ceil() as usize;
    samples[idx]
}

/// TC-U-051 — real `open_path` wiring (`app = None`, so recents are a no-op): size guard,
/// read, schema gate, deserialize, arena build, overview DTO. One warm open, then `n` samples.
fn measure_parse_index(path: &std::path::Path, state: &AppState, n: usize) -> Vec<f64> {
    let path_str = path.to_str().expect("fixture path is UTF-8");
    open_path(state, None, path_str).expect("fixture must open cleanly");
    let mut samples = Vec::with_capacity(n);
    for _ in 0..n {
        let t0 = Instant::now();
        open_path(state, None, path_str).expect("fixture must open cleanly");
        samples.push(t0.elapsed().as_secs_f64() * 1e3);
    }
    samples
}

/// TC-U-052 — one `get_node_detail` command impl call (O(1) arena lookup + DTO build).
fn measure_node_detail(state: &AppState, id: &str, n: usize) -> Vec<f64> {
    let mut samples = Vec::with_capacity(n);
    for _ in 0..n {
        let t0 = Instant::now();
        node_detail_impl(state, id.to_string()).expect("shallow and deep ids must resolve");
        samples.push(t0.elapsed().as_secs_f64() * 1e3);
    }
    samples
}

/// The deepest request id in the fixture. Selected from the index (not hardcoded) so a
/// regenerated fixture with the same seed — the only legal producer — always yields the same
/// tree shape: 4 folder levels under the root, every leaf at depth 5 (e.g. `1.2.4.4.9`).
fn deepest_request_id(path: &std::path::Path) -> String {
    let mut collection = load(path).expect("fixture must load");
    let (idx, warnings) = build_index(&mut collection);
    assert!(
        warnings.is_empty(),
        "fixture loads warning-free, got {warnings:?}"
    );
    assert_eq!(
        idx.request_count, 2000,
        "fixture must keep its 2000-leaf contract"
    );
    let deep = idx
        .nodes
        .iter()
        .filter(|n| n.kind == NodeKind::Request)
        .max_by_key(|n| n.depth)
        .expect("a 2000-leaf fixture has request leaves");
    assert!(
        deep.depth >= 4,
        "generated tree must nest >= 4 folder levels, got depth {}",
        deep.depth
    );
    deep.node_id.to_string()
}

/// Peak resident set size of this process so far, in KiB (TC-U-053, max over the run).
///
/// `getrusage` works on both Linux and macOS; the only difference is the `ru_maxrss` unit —
/// KiB on Linux, bytes on macOS/BSD.
#[cfg(unix)]
fn peak_rss_kb() -> u64 {
    // SAFETY: getrusage writes into `usage`, and `ru_maxrss` is read immediately after.
    unsafe {
        let mut usage: libc::rusage = std::mem::zeroed();
        assert_eq!(
            libc::getrusage(libc::RUSAGE_SELF, &mut usage),
            0,
            "getrusage(RUSAGE_SELF) failed"
        );
        let raw = usage.ru_maxrss as u64;
        if cfg!(target_os = "linux") {
            raw
        } else {
            raw / 1024
        }
    }
}

fn bench_collection(c: &mut Criterion) {
    let path = ensure_fixture();
    let path_str = path.to_str().expect("fixture path is UTF-8").to_string();
    let state = AppState::default();

    // First open doubles as the warm-up and as the "collection loaded" state TC-U-053
    // describes — measured immediately, before the repeated open/parse churn below inflates
    // the RSS high-water mark (freed-but-not-returned heap would otherwise dominate).
    open_path(&state, None, &path_str).expect("fixture must open cleanly");

    // TC-U-053 — resident memory with the fixture loaded. Sampled right after that single
    // load: rusage's ru_maxrss is monotonic, so this is the low-water baseline a user sees.
    #[cfg(unix)]
    {
        let rss_mb = peak_rss_kb() as f64 / 1024.0;
        assert!(
            peak_rss_kb() < RSS_KB,
            "NFR-004 exceeded: resident memory {rss_mb:.1} MB >= {} MB budget",
            RSS_KB / 1024
        );
        eprintln!("TC-U-053 resident memory (fixture loaded): {rss_mb:.1} MB");
    }

    // TC-U-051 — parse+index is the authoritative assertion; criterion re-samples the same
    // path below for its trend report.
    let parse_p95 = p95_ms(measure_parse_index(&path, &state, 25));
    assert!(
        parse_p95 < PARSE_INDEX_P95_MS,
        "NFR-001 exceeded: parse+index p95 {parse_p95:.1} ms >= {PARSE_INDEX_P95_MS} ms budget"
    );
    eprintln!("TC-U-051 parse+index (open_path): p95 = {parse_p95:.1} ms");

    // TC-U-052 — shallow is a root folder (`"0"`), deep is the deepest request leaf.
    let deep_id = deepest_request_id(&path);
    node_detail_impl(&state, "0".to_string()).expect("shallow id must resolve");
    node_detail_impl(&state, deep_id.clone()).expect("deep id must resolve");

    let shallow_p95 = p95_ms(measure_node_detail(&state, "0", 100));
    let deep_p95 = p95_ms(measure_node_detail(&state, &deep_id, 100));
    assert!(
        shallow_p95 < NODE_DETAIL_P95_MS,
        "NFR-002 exceeded: shallow get_node_detail p95 {shallow_p95:.3} ms >= {NODE_DETAIL_P95_MS} ms"
    );
    assert!(
        deep_p95 < NODE_DETAIL_P95_MS,
        "NFR-002 exceeded: deep get_node_detail p95 {deep_p95:.3} ms >= {NODE_DETAIL_P95_MS} ms"
    );
    eprintln!(
        "TC-U-052 get_node_detail: shallow(\"0\") p95 = {shallow_p95:.3} ms, deep({deep_id}) p95 = {deep_p95:.3} ms"
    );

    c.bench_function("parse_index_2000_open_path", |b| {
        b.iter(|| std::hint::black_box(open_path(&state, None, &path_str)).unwrap())
    });
    c.bench_function("get_node_detail_shallow", |b| {
        b.iter(|| std::hint::black_box(node_detail_impl(&state, "0".to_string())).unwrap())
    });
    c.bench_function("get_node_detail_deep", |b| {
        b.iter(|| std::hint::black_box(node_detail_impl(&state, deep_id.clone())).unwrap())
    });
}

criterion_group!(collection, bench_collection);
criterion_main!(collection);
