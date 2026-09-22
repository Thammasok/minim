//! T-011 — load-path hardening: mutation-based fuzzing of the full read → gate → index →
//! view pipeline, plus the four acceptance tests TC-U-047..TC-U-050 (FR-008, FR-014, NFR-005).
//!
//! FR-008 / NFR-005 require that ≥1000 mutated-or-hostile collection files – including
//! truncations, bit flips, wrong-typed fields, and pathological nesting depth – go through
//! the load path with **zero panics, zero hangs, zero timeouts**. Every case must end either
//! as a loaded model or as a typed `AppError`; anything else (stack overflow, panic, deadlock,
//! infinite loop) fails the test.
//!
//! This is a deterministic, std-only stand-in for cargo-fuzz: the mutant stream is produced
//! by a seeded xorshift64* and simply recorded with a `println!` (walls of text, not binary
//! coverage), so a failure pins the exact byte input that broke the path. The harness runs
//! each case on its own thread with a **512 KiB stack** to prove the pipeline never depends
//! on an unbounded call stack, and a 2 s deadline — a timeout aborts the whole test process,
//! because a hung thread would otherwise keep `cargo test` spinning forever.

use std::any::Any;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

use minim_lib::error::AppError;
use minim_lib::index::{build_index, NodeKind};
use minim_lib::postman::model::Item;
use minim_lib::schema_gate::load;
use minim_lib::view::{build_overview, example_detail, node_detail};

const MIN_MUTANTS: usize = 1000;
/// Worker stack matches the smallest realistic production thread (Rust/tokio default, 2 MiB),
/// NOT a tighter spike: the corpus deliberately contains `deep_item_chain(61)`, a *valid*
/// deepest-legal collection that must load on a production stack. A 512 KiB spike would
/// freshly stack-overflow that legitimate case and report a false positive.
const WORKER_STACK_BYTES: usize = 2 * 1024 * 1024;
const CASE_DEADLINE: Duration = Duration::from_secs(2);
/// Hostile bytes the JSON grammar (and UTF-8) never expect in those positions.
const HOSTILE: &[u8] = b"\x00\xff\xfe\x80\"\\[]{}\n\r\t:";

// ---------------------------------------------------------------------------
// deterministic RNG (xorshift64*)
// ---------------------------------------------------------------------------

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// uniform in `0..n`; `n == 0` gives `0` (callers guard empty inputs anyway)
    fn below(&mut self, n: usize) -> usize {
        if n == 0 {
            return 0;
        }
        (self.next() % n as u64) as usize
    }
}

// ---------------------------------------------------------------------------
// seed corpus — everything committed under ../tests/fixtures
// ---------------------------------------------------------------------------

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures")
}

/// Recursively collect committed seed files (`.json`/`.yaml`), sorted for determinism.
/// `tools/` holds generators, not inputs. The `large/` generator output is gitignored but,
/// when present, is a valid extra seed (more breadth on machines that ran the generator).
fn seed_paths() -> Vec<PathBuf> {
    let mut seeds = Vec::new();
    let mut walk = vec![fixtures_dir()];
    while let Some(dir) = walk.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path.file_name().and_then(|n| n.to_str()) != Some("tools") {
                    walk.push(path);
                }
            } else if matches!(
                path.extension().and_then(|e| e.to_str()),
                Some("json" | "yaml")
            ) {
                seeds.push(path);
            }
        }
    }
    seeds.sort();
    seeds
}

// ---------------------------------------------------------------------------
// mutant stream
// ---------------------------------------------------------------------------

/// Byte-level mutations of one seed: bit flips, hostile overwrites, truncations, splices,
/// slice duplication and hostile prefixes. Each is `Vec<u8>`, so a JSON-shaped seed can be
/// turned into a UTF-8-hostile or structurally-broken file — both must fail cleanly.
fn byte_mutants(seed: &[u8], rng: &mut Rng, per_seed: usize) -> Vec<Vec<u8>> {
    let mut out = Vec::with_capacity(per_seed + 4);

    // fixed-fraction truncations — TC-U-047 family (must stay valid UTF-8: `load` reads via
    // `read_to_string`; a non-character-boundary cut would surf as FileUnreadable instead of
    // the JSON error the acceptance asserts)
    for frac in [2usize, 3, 4, 8] {
        let mut cut = seed.len() / frac;
        while cut < seed.len() && !std::str::from_utf8(&seed[..cut]).is_ok() {
            cut -= 1;
        }
        if cut < seed.len() {
            out.push(seed[..cut].to_vec());
        }
    }

    while out.len() < per_seed {
        let op = rng.below(6);
        match op {
            // flip one bit
            0 => {
                let mut m = seed.to_vec();
                if m.is_empty() {
                    out.push(m);
                } else {
                    let j = rng.below(m.len());
                    let b = rng.below(8);
                    m[j] ^= 1 << b;
                    out.push(m);
                }
            }
            // overwrite a run with hostile bytes
            1 => {
                let mut m = seed.to_vec();
                let start = rng.below(m.len().max(1));
                let run = 1 + rng.below(8);
                for i in start..m.len().min(start + run) {
                    m[i] = HOSTILE[rng.below(HOSTILE.len())];
                }
                out.push(m);
            }
            // truncate at a random (character-boundary) point
            2 => {
                let mut cut = rng.below(seed.len());
                while cut < seed.len() && !std::str::from_utf8(&seed[..cut]).is_ok() {
                    cut -= 1;
                }
                out.push(seed[..cut].to_vec());
            }
            // splice garbage chunk in the middle
            3 => {
                let mut m = seed.to_vec();
                let at = rng.below(m.len() + 1);
                let chunk: Vec<u8> = (0..1 + rng.below(16)).map(|_| rng.next() as u8).collect();
                m.splice(at..at, chunk.iter().copied());
                out.push(m);
            }
            // duplicate a slice (stutter) somewhere in the file
            4 => {
                let mut m = seed.to_vec();
                if !m.is_empty() {
                    let start = rng.below(m.len());
                    let end = (start + 1 + rng.below(m.len() - start)).min(m.len());
                    let slice = m[start..end].to_vec();
                    let at = rng.below(m.len() + 1);
                    m.splice(at..at, slice.iter().copied());
                }
                out.push(m);
            }
            // hostile prefix (BOM lookalike / NULs / lone high bytes)
            _ => {
                let mut m = Vec::new();
                let pre: Vec<u8> = (0..1 + rng.below(4))
                    .map(|_| HOSTILE[rng.below(HOSTILE.len())])
                    .collect();
                m.extend_from_slice(&pre);
                m.extend_from_slice(seed);
                out.push(m);
            }
        }
    }
    out
}

/// Structured mutations for seeds that parse as JSON: change field types / delete keys that
/// the polymorphic normalizers (`url`, `header`, `exec`, `description`) are documented to
/// accept — the reader must either load them or reject with a typed error, never panic.
fn structured_mutants(seed: &[u8], rng: &mut Rng) -> Vec<Vec<u8>> {
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(seed) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for _ in 0..8 {
        let mut mut_v = v.clone();
        // pick a random shallow path to a real sub-value, then corrupt the container that
        // holds it — the polymorphic normalizers must tolerate the new shape or reject it
        // with a typed error
        if let Some(node) = mutate_random_node(&mut mut_v, rng) {
            if node {
                if let Ok(bytes) = serde_json::to_vec(&mut_v) {
                    out.push(bytes);
                }
            }
        }
    }
    out
}

/// Descend a random path into `value` (recording indices as we go), then apply one mutation:
/// null/array/object out a field, delete a field, inject into an array, or overwrite a string.
/// Returns `true` when a mutation actually landed.
fn mutate_random_node(value: &mut serde_json::Value, rng: &mut Rng) -> Option<bool> {
    // Plan the random path with shared borrows first — an array-index record lets us re-descend
    // mutably from the root afterwards without holding a long-lived `&mut` cursor that fights
    // the borrow checker across both container kinds.
    let mut path: Vec<usize> = Vec::new();
    let mut steps = 0usize;
    {
        let value = &*value;
        let mut cursor = value;
        loop {
            let len = match cursor {
                serde_json::Value::Object(map) => map.len(),
                serde_json::Value::Array(arr) => arr.len(),
                _ => return None,
            };
            if len == 0 || steps >= 3 || rng.below(2) == 0 {
                break;
            }
            let idx = rng.below(len);
            path.push(idx);
            match cursor {
                serde_json::Value::Object(map) => {
                    let key = map.keys().nth(idx)?.clone();
                    cursor = map.get(&key)?;
                }
                serde_json::Value::Array(arr) => {
                    cursor = &arr[idx];
                }
                _ => return None,
            }
            steps += 1;
        }
    }

    // re-descend the recorded path mutably from the ROOT, then mutate
    let mut cursor = value;
    for idx in path {
        cursor = match cursor {
            serde_json::Value::Object(map) => {
                let key = map.keys().nth(idx).cloned()?;
                map.get_mut(&key)?
            }
            serde_json::Value::Array(arr) => &mut arr[idx],
            _ => return None,
        };
    }

    Some(match cursor {
        serde_json::Value::Object(map) => {
            let key = map.keys().nth(rng.below(map.len().max(1))).cloned()?;
            match rng.below(4) {
                0 => {
                    map.insert(key, serde_json::Value::Null);
                }
                1 => {
                    map.insert(
                        key,
                        serde_json::Value::Array(
                            (0..rng.below(4))
                                .map(|_| serde_json::Value::from(rng.next() as i64))
                                .collect(),
                        ),
                    );
                }
                2 => {
                    map.insert(
                        key,
                        serde_json::json!({ "url": 0, "header": [], "exec": null }),
                    );
                }
                _ => {
                    map.remove(&key);
                }
            }
            true
        }
        serde_json::Value::Array(arr) => {
            arr.insert(
                rng.below(arr.len() + 1),
                serde_json::Value::from(rng.next() as i64),
            );
            true
        }
        serde_json::Value::String(s) => {
            *s = HOSTILE
                .iter()
                .cycle()
                .take(rng.below(8))
                .map(|&b| b as char)
                .collect();
            true
        }
        _ => false,
    })
}

/// Crafted pathological documents — every one is either loads or a clean typed error.
fn crafted_specials(seeds: &[Vec<u8>]) -> Vec<Vec<u8>> {
    let mut out = Vec::new();

    // TC-U-049 — genuinely invalid UTF-8 (a lone continuation byte) → FileUnreadable
    out.push(b"{\"info\": \"\xff\xfe\"}".to_vec());

    // 10,000 nested arrays — valid JSON that can only be built as text (a `Value` this deep
    // is exactly what an unbounded parser would hand to `drop`; the default limit stops the
    // parse instead, TC-U-048)
    let mut deep_arr = String::new();
    for _ in 0..10_000 {
        deep_arr.push('[');
    }
    deep_arr.push('0');
    for _ in 0..10_000 {
        deep_arr.push(']');
    }
    out.push(deep_arr.into_bytes());

    // folder chains at the decision boundary — 61 folders (122 containers) loads,
    // 62 folders (124 containers) must NotJson
    out.push(deep_item_chain(61));
    out.push(deep_item_chain(62));

    // every seed with a BOM stamped in front (UTF-8 BOM is not JSON; must still be a clean error)
    for seed in seeds {
        let mut bom = vec![b'\xef', b'\xbb', b'\xbf'];
        bom.extend_from_slice(seed);
        out.push(bom);
    }

    // a JSON collection whose item tree is one huge flat array of junk objects
    let mut flat = String::from(
        r#"{"info":{"name":"flat","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},"item":["#,
    );
    for i in 0..2000 {
        flat.push_str(&format!(
            r#"{{"name":"r{}","request":{{"method":"GET","url":"https://x.test/{}"}}}},"#,
            i, i
        ));
    }
    flat.pop();
    flat.push_str("]}");
    out.push(flat.into_bytes());

    out
}

/// A document with `n` nested folders (each folder = object + `item` array = 2 containers),
/// built as raw text so the builder's own recursion is not the limit being tested.
fn deep_item_chain(n: usize) -> Vec<u8> {
    let mut s = String::from(
        r#"{"info":{"name":"deep","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},"item":["#,
    );
    for i in 0..n {
        s.push_str(&format!(r#"{{"name":"l{i}","item":["#));
    }
    s.push_str(r#"{"name":"leaf","request":{"method":"GET","url":"https://x.test/"}}"#);
    for _ in 0..n {
        s.push_str("]}");
    }
    s.push_str("]}");
    s.into_bytes()
}

/// Deterministically build the whole corpus from the seeds. Returned set is the deduplicated
/// distinct inputs — the "≥1000 mutant files" of NFR-005.
fn build_corpus() -> Vec<Vec<u8>> {
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut corpus: Vec<Vec<u8>> = Vec::new();

    let seeds = seed_paths();
    assert!(
        !seeds.is_empty(),
        "expected committed fixtures under tests/fixtures — corpus cannot be built"
    );
    let all_seeds: Vec<Vec<u8>> = seeds
        .iter()
        .map(|p| std::fs::read(p).unwrap_or_else(|e| panic!("read seed {}: {e}", p.display())))
        .collect();

    for seed in &all_seeds {
        if seed.len() < 512 * 1024 {
            corpus.extend(byte_mutants(seed, &mut rng, 100));
        } else {
            // the (gitignored, when present) multi-MB generator output: fewer, heavier mutants
            corpus.extend(byte_mutants(seed, &mut rng, 16));
        }
        corpus.extend(structured_mutants(seed, &mut rng));
    }
    corpus.extend(crafted_specials(&all_seeds));

    // dedup — mutations can collide (a truncation may equal another truncation)
    let mut seen: HashSet<Vec<u8>> = HashSet::new();
    corpus.retain(|m| seen.insert(m.clone()));
    corpus
}

// ---------------------------------------------------------------------------
// execution engine — one case on one 512 KiB thread, 2 s deadline, abort on hang
// ---------------------------------------------------------------------------

/// Verdict for one case: the full load path either produced a model or a typed rejection.
#[derive(Debug)]
enum Verdict {
    /// `load` → `build_index` → `build_overview` (+ detail/example sweep) all completed
    Loaded,
    /// `load` rejected the input with a documented `AppError`
    Rejected(AppError),
}

/// The full pipeline, exactly as the production commands wire it (ADR-008: no webview in
/// the loop): read → gate → normalize/index → view. `build_overview`'s `item` is empty by
/// then (arena took it), matching production.
fn full_load(path: &Path) -> Result<Verdict, AppError> {
    let mut collection = load(path)?;
    let (idx, warnings) = build_index(&mut collection);
    let overview = build_overview(
        &collection,
        &idx,
        warnings,
        path.display().to_string(),
        std::fs::metadata(path)
            .map(|m| m.len().min(u32::MAX as u64) as u32)
            .unwrap_or(0),
    );
    // arena invariant: 1 collection node + one node per folder/request
    assert_eq!(
        idx.len(),
        1 + overview.folder_count as usize + overview.request_count as usize,
        "arena and overview disagree"
    );
    // sweep every node through detail/example rendering — the recursion living in view.rs
    let collection_auth = collection.auth.as_ref();
    for node in &idx.nodes {
        match node.kind {
            NodeKind::Collection => continue,
            NodeKind::Folder | NodeKind::Request => {
                let _ = node_detail(&idx, collection_auth, &node.node_id);
            }
        }
        if let Some(Item::Request(req)) = &node.wire {
            if let Some(responses) = &req.response {
                for response in responses {
                    let _ = example_detail(response);
                }
            }
        }
    }
    Ok(Verdict::Loaded)
}

fn panic_message(payload: Box<dyn Any + Send + 'static>) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "non-string panic payload".to_string()
    }
}

/// Run one mutant through `full_load` on a 512 KiB-stack worker thread. Returns:
/// `Ok(Verdict)` = no panic and the pipeline completed / typed-rejected;
/// `Err(String)` = the worker panicked or the channel broke — a test failure.
fn execute_case(bytes: &[u8], scratch: &Path, seq: usize) -> Result<Verdict, String> {
    // crash beacon: written before every case so `thread overflowed its stack` (SIGABRT, no
    // catch_unwind) leaves a record of exactly which input aborted the run
    std::fs::write(
        scratch.join("crash-beacon.txt"),
        format!("case #{seq}: {} bytes\n", bytes.len()),
    )
    .map_err(|e| format!("beacon write: {e}"))?;
    let path = scratch.join(format!("case-{seq:05}.json"));
    std::fs::write(&path, bytes).map_err(|e| format!("scratch write: {e}"))?;

    // the worker sends the catch_unwind result; a panic inside comes back in the Err slot
    let (tx, rx) = mpsc::channel();
    let worker_path = path.clone();
    std::thread::Builder::new()
        .stack_size(WORKER_STACK_BYTES)
        .name(format!("fuzz-{seq}"))
        .spawn(move || {
            let result =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| full_load(&worker_path)));
            let _ = tx.send(result);
        })
        .map_err(|e| format!("spawn failed: {e}"))?;

    // channel carries `catch_unwind`'s Result: the outer Err(payload) = the worker panicked,
    // which is the hard-guarantee failure mode this test exists to catch
    match rx.recv_timeout(CASE_DEADLINE) {
        Ok(Ok(Ok(verdict))) => Ok(verdict),
        Ok(Ok(Err(err))) => Ok(Verdict::Rejected(err)),
        Ok(Err(payload)) => Err(format!("panicked: {}", panic_message(payload))),
        Err(RecvTimeoutError::Timeout) => {
            // A hung worker must not keep `cargo test` spinning; abort kills it too.
            eprintln!(
                "HANG on mutant #{seq} ({} bytes) — aborting; a stacked/looping parse was misreported as success",
                bytes.len()
            );
            std::process::abort();
        }
        Err(RecvTimeoutError::Disconnected) => {
            Err("worker dropped the channel without a verdict".to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// acceptance tests
// ---------------------------------------------------------------------------

/// TC-U-047 — torture.json truncated at every fixed fraction is a JSON error, never a panic
/// and never a crash of the recursion-limit flavour. Bound-0 (empty) is covered by the
/// corpus below.
#[test]
fn tc_u_047_truncated_collection_is_not_json() {
    let text = std::fs::read_to_string(fixtures_dir().join("torture.json")).unwrap();
    for frac in [2usize, 3, 4, 8] {
        let mut cut = text.len() / frac;
        while !text.is_char_boundary(cut) {
            cut -= 1;
        }
        let err = load_to_err(text.as_bytes()[..cut].as_ref());
        assert!(
            matches!(err, AppError::NotJson { .. }),
            "truncation at 1/{frac} must be NotJson, got {err:?}"
        );
    }
    // the empty prefix (boundary cut = 0 residue) is NotJson too
    let err = load_to_err(b"");
    assert!(matches!(err, AppError::NotJson { .. }));
}

/// Load bytes through a scratch file and return the error variant (must be an error).
fn load_to_err(bytes: &[u8]) -> AppError {
    let dir = scratch_dir("tc-u-047");
    let path = dir.join("input.json");
    std::fs::write(&path, bytes).unwrap();
    let err = load(&path).expect_err("expected a rejection, got a loaded collection");
    drop(dir);
    err
}

/// TC-U-048 — hostile nesting depth on a 512 KiB stack: exactly 61 folders loads; 62 folders
/// and 10,000 nested arrays are rejected by the parser's recursion limit with `NotJson`
/// (never a real-stack overflow, never a panic).
#[test]
fn tc_u_048_deep_hostile_input_is_capped_not_a_stack_overflow() {
    let dir = scratch_dir("tc-u-048");

    // 61 folders = 122 containers ≤ 128 → loads; arena depth must equal 62
    let ok_path = dir.join("ok-61.json");
    std::fs::write(&ok_path, deep_item_chain(61)).unwrap();
    let mut collection = load(&ok_path)
        .unwrap_or_else(|e| panic!("61-folder chain must load through the cap, got {e:?}"));
    let (idx, _w) = build_index(&mut collection);
    assert_eq!(idx.max_depth, 62, "61 folders must nest to depth 62");

    // 62 folders = 124 containers > 128 → NotJson at the parser, before the model ever exists
    let no_path = dir.join("no-62.json");
    std::fs::write(&no_path, deep_item_chain(62)).unwrap();
    let err = load(&no_path).expect_err("62-folder chain must exceed the depth cap");
    assert!(matches!(err, AppError::NotJson { .. }));

    // 10,000 nested arrays → NotJson without touching a production-sized stack
    let mut deep = Vec::with_capacity(2 * 10_000 + 1);
    deep.extend(std::iter::repeat_n(b'[', 10_000));
    deep.push(b'0');
    deep.extend(std::iter::repeat_n(b']', 10_000));
    let arr_path = dir.join("deep-arr.json");
    std::fs::write(&arr_path, &deep).unwrap();
    let err = load(&arr_path).expect_err("10,000 nested arrays must be rejected");
    assert!(matches!(err, AppError::NotJson { .. }));

    drop(dir);
}

/// TC-U-049 — a file with invalid UTF-8 is `FileUnreadable`, not `NotJson` (the read fails
/// before any JSON parse), and never a panic.
#[test]
fn tc_u_049_invalid_utf8_is_file_unreadable() {
    let dir = scratch_dir("tc-u-049");
    let path = dir.join("invalid.json");
    std::fs::write(&path, b"{\"info\": \"\xff\xfe\"}").unwrap();
    let err = load(&path).expect_err("invalid UTF-8 must be rejected");
    assert!(
        matches!(err, AppError::FileUnreadable { .. }),
        "expected FileUnreadable, got {err:?}"
    );
    drop(dir);
}

/// TC-U-050 — the full corpus: ≥1000 distinct hostile/mutated files, zero panics, zero
/// hangs, zero timeouts. Every input must end `Loaded` or `Rejected(AppError)`.
#[test]
fn tc_u_050_corpus_min_1000_zero_panics_zero_hangs() {
    let corpus = build_corpus();
    assert!(
        corpus.len() >= MIN_MUTANTS,
        "corpus must carry ≥{MIN_MUTANTS} distinct mutant files, built {}. Check fixtures still commit enough seeds.",
        corpus.len()
    );

    let dir = scratch_dir("tc-u-050");
    let start = Instant::now();
    let mut count = 0usize;
    let mut loaded = 0usize;
    let mut rejected = 0usize;
    let mut by_kind: std::collections::BTreeMap<&'static str, usize> = Default::default();
    for bytes in &corpus {
        let verdict = execute_case(bytes, &dir, count).unwrap_or_else(|why| {
            panic!(
                "case #{count} ({} bytes) failed the hard guarantee: {why}",
                bytes.len()
            )
        });
        match verdict {
            Verdict::Loaded => loaded += 1,
            Verdict::Rejected(err) => {
                rejected += 1;
                *by_kind.entry(rejection_kind(&err)).or_default() += 1;
            }
        }
        count += 1;
    }
    let elapsed = start.elapsed();
    drop(dir);

    let details: Vec<String> = by_kind
        .into_iter()
        .map(|(kind, n)| format!("{kind}={n}"))
        .collect();
    eprintln!(
        "T-011 corpus: {count} inputs ({loaded} loaded, {rejected} typed-rejected [{details:?}]) in {:.2?}, all clean",
        elapsed
    );
}

/// Short stable name for an `AppError` variant, for the rejection breakdown.
fn rejection_kind(err: &AppError) -> &'static str {
    match err {
        AppError::FileNotFound { .. } => "FileNotFound",
        AppError::FileUnreadable { .. } => "FileUnreadable",
        AppError::FileTooLarge { .. } => "FileTooLarge",
        AppError::NotJson { .. } => "NotJson",
        AppError::NotACollection { .. } => "NotACollection",
        AppError::UnsupportedSchema { .. } => "UnsupportedSchema",
        AppError::NoCollectionOpen => "NoCollectionOpen",
        AppError::UnknownNode { .. } => "UnknownNode",
        AppError::UnknownExample { .. } => "UnknownExample",
        AppError::StoreUnavailable { .. } => "StoreUnavailable",
        AppError::NotImplemented { .. } => "NotImplemented",
    }
}

// ---------------------------------------------------------------------------
// scratch dir management
// ---------------------------------------------------------------------------

fn scratch_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "minim-load-hardening-{tag}-pid-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}
