//! Schema-gate integration tests over the rejection corpus (T-005 acceptance):
//! every NON-v2.1 file in `tests/fixtures/reject/` is rejected with the documented
//! `AppError` variant, and the gate short-circuits before the item tree (FR-004).

use std::path::PathBuf;

use minim_lib::error::AppError;
use minim_lib::schema_gate::{load, parse_and_gate, SCHEMA_URL_V2_1};

fn reject_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/reject")
        .join(name)
        .canonicalize()
        .unwrap_or_else(|e| panic!("cannot resolve reject/{name}: {e}"))
}

fn load_reject(name: &str) -> AppError {
    load(&reject_path(name)).unwrap_err()
}

fn assert_unsupported_schema(err: AppError, found: &str) {
    match err {
        AppError::UnsupportedSchema {
            found: got,
            expected,
        } => {
            assert!(
                got.contains(found),
                "found must name the detected version {found:?}, got {got:?}"
            );
            assert_eq!(expected, SCHEMA_URL_V2_1);
        }
        other => panic!("expected UnsupportedSchema, got {other:?}"),
    }
}

/// TC-U-013 (fixture side) — a real Postman v2.1 export passes the gate and deserializes.
#[test]
fn tc_u_013_v21_export_passes_gate() {
    for name in [
        "real/postman-8.12.5-export.json",
        "real/postman-10.24.16-export.json",
        "real/postman-11.34.2-export.json",
    ] {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures")
            .join(name)
            .canonicalize()
            .unwrap_or_else(|e| panic!("cannot resolve fixtures/{name}: {e}"));
        let collection = load(&path)
            .unwrap_or_else(|e| panic!("fixtures/{name} must load through the gate, got {e}"));
        assert!(collection.info.schema.ends_with("/v2.1.0/collection.json"));
    }
}

/// TC-U-015 — the gate runs BEFORE the tree walk: a v2.0 file whose `item[]` is structurally
/// invalid yields UnsupportedSchema, never a deserialization error out of the tree.
#[test]
fn tc_u_015_gate_rejects_before_walking_the_tree() {
    let err = load_reject("v2.0-with-broken-item.json");
    assert_unsupported_schema(err, "v2.0.0");
}

/// TC-U-014 — a v2.0 schema is rejected naming the found version and the v2.1 expectation.
#[test]
fn tc_u_014_v20_schema_rejected() {
    let err = load_reject("v2.0-collection.json");
    assert_unsupported_schema(err, "v2.0.0");
}

/// FR-005 — a v1 collection (no `info`, no `schema`) is detected by shape and named "v1".
#[test]
fn v1_collection_is_detected_and_rejected() {
    let err = load_reject("v1-collection.json");
    assert_unsupported_schema(err, "v1");
}

/// TC-U-016 — a JSON syntax error carries its position. The fixture fails at line 5 column 3
/// (verified against serde_json; the file must not be reformatted).
#[test]
fn tc_u_016_json_syntax_error_carries_position() {
    let err = load_reject("trailing-comma.json");
    match err {
        AppError::NotJson { line, column, .. } => {
            assert_eq!(line, 5);
            assert_eq!(column, 3);
        }
        other => panic!("expected NotJson, got {other:?}"),
    }
}

/// FR-006 — valid JSON missing `item` is rejected naming the missing field.
#[test]
fn tc_u_017_missing_item_names_the_field() {
    let err = load_reject("missing-item.json");
    assert_eq!(
        err,
        AppError::NotACollection {
            missing_field: "item".to_owned(),
        }
    );
}

/// FR-006 — valid JSON missing `info` is rejected naming the missing field.
#[test]
fn missing_info_names_the_field() {
    let err = load_reject("missing-info.json");
    assert_eq!(
        err,
        AppError::NotACollection {
            missing_field: "info".to_owned(),
        }
    );
}

/// FR-006 — an OpenAPI document has a top-level `info` (title/version) but no `info.schema`;
/// the gate fails on the schema a collection requires.
#[test]
fn openapi_document_is_not_a_collection() {
    let err = load_reject("not-a-collection.json");
    assert!(matches!(
        err,
        AppError::NotACollection { missing_field } if missing_field == "schema"
    ));
}

/// FR-004 — a top-level array wrapping a good collection is not a collection object.
#[test]
fn array_root_is_not_a_collection() {
    let err = load_reject("not-json-object.json");
    assert!(matches!(
        err,
        AppError::NotACollection { missing_field } if missing_field == "info"
    ));
}

/// FR-007 — an empty file is a JSON parse error, not a panic.
#[test]
fn empty_file_is_not_json() {
    let err = load_reject("empty.json");
    assert!(matches!(err, AppError::NotJson { .. }));
}

/// FR-007 / FR-005 — an unterminated file is a JSON parse error, not a panic.
#[test]
fn malformed_file_is_not_json() {
    let err = load_reject("malformed.json");
    assert!(matches!(err, AppError::NotJson { .. }));
}

/// FR-005 — a v3 collection is YAML, so it is rejected at the JSON step with a position.
#[test]
fn v3_yaml_is_not_json() {
    let err = load_reject("v3-collection.yaml");
    match err {
        AppError::NotJson { line, .. } => assert_eq!(line, 1),
        other => panic!("expected NotJson at line 1, got {other:?}"),
    }
}

/// `load` maps a missing path to `FileNotFound`, not to a panic. The path must not be
/// canonicalized (canonicalize would fail on the missing file before `load` runs).
#[test]
fn missing_path_is_file_not_found() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/reject/does-not-exist.json");
    let err = load(&path).unwrap_err();
    match err {
        AppError::FileNotFound { path } => assert!(path.ends_with("does-not-exist.json")),
        other => panic!("expected FileNotFound, got {other:?}"),
    }
}

/// The reusable text entry point works without touching disk (TC-U-017 inline input).
#[test]
fn parse_and_gate_inline() {
    let err = parse_and_gate(
        r#"{"info":{"name":"x","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"}}"#,
    )
    .unwrap_err();
    assert_eq!(
        err,
        AppError::NotACollection {
            missing_field: "item".to_owned(),
        }
    );
}
