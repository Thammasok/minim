//! Fixture-level integration tests for the v2.1 wire model (T-004 acceptance):
//! every fixture under `tests/fixtures/real/` and `torture.json` must deserialize
//! without error through `minim_lib::postman::model::PostmanCollection`.

use std::fs;
use std::path::PathBuf;

use minim_lib::postman::model::PostmanCollection;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// Reads a fixture relative to the repo-root `tests/fixtures/` dir and parses it.
fn parse_fixture(relative: &str) -> PostmanCollection {
    let path = manifest_dir()
        .join("../tests/fixtures")
        .join(relative)
        .canonicalize()
        .unwrap_or_else(|e| panic!("cannot resolve fixtures/{relative}: {e}"));
    let text =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("fixtures/{relative} failed to deserialize: {e}"))
}

/// Every real Postman export (v8, v10, v11 vintages) parses through the model.
#[test]
fn real_postman_exports_deserialize() {
    for name in [
        "real/postman-8.12.5-export.json",
        "real/postman-10.24.16-export.json",
        "real/postman-11.34.2-export.json",
    ] {
        parse_fixture(name);
    }
}

/// The hand-authored torture fixture exercises every polymorphic shape, all five body
/// modes, all auth types, six-deep folders and unknown fields at every level.
#[test]
fn torture_fixture_deserializes() {
    let collection = parse_fixture("torture.json");
    assert!(!collection.item.is_empty());
}
