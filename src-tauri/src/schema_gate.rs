//! Schema gate — validates `info.schema` before anything walks the item tree (FR-004)
//! and, on rejection, names the version the file actually is (FR-005, FR-006).

use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

use crate::error::AppError;
use crate::postman::model::PostmanCollection;

/// The canonical v2.1 schema URL, used as the `expected` half of `UnsupportedSchema`.
pub const SCHEMA_URL_V2_1: &str =
    "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

/// The path tail every valid `info.schema` ends with. Compared as a suffix so real exports
/// keep passing whatever the scheme (`http://` vs `https://`) or host is, and a lookalike
/// like `…/v2.1.0h/collection.json` is still rejected.
const SCHEMA_TAIL_V2_1: &str = "/v2.1.0/collection.json";

/// Top-level keys that identify a genuine Collection Format v1 export — which has no `info`
/// block and no `schema` field at all, so the rejected version has to be sniffed (FR-005).
const V1_TOP_LEVEL_KEYS: [&str; 3] = ["order", "folders", "requests"];

/// Gate a single `info.schema` value. Pure and testable (TC-U-013, TC-U-014).
pub fn validate_schema_url(schema: &str) -> Result<(), AppError> {
    if schema.ends_with(SCHEMA_TAIL_V2_1) {
        Ok(())
    } else {
        Err(schema_rejected(schema))
    }
}

/// Gate a parsed JSON value: object shape → `info.schema` → `item` presence.
///
/// Runs before the item tree is ever deserialized, so a rejected non-v2.1 file with a broken
/// `item[]` never reaches the tree walk (TC-U-015, FR-004).
pub fn validate_value(value: &Value) -> Result<(), AppError> {
    let Value::Object(root) = value else {
        return Err(not_collection("info"));
    };

    let Some(info) = root.get("info") else {
        if is_v1(root) {
            return Err(schema_rejected("v1"));
        }
        return Err(not_collection("info"));
    };
    let Value::Object(info) = info else {
        return Err(not_collection("info"));
    };

    match info.get("schema") {
        Some(Value::String(schema)) => validate_schema_url(schema)?,
        _ => return Err(not_collection("schema")),
    }

    if !root.contains_key("item") {
        return Err(not_collection("item"));
    }
    Ok(())
}

/// JSON text → gate → wire model. Kept minimal (`from_str` + `from_value`); the full command
/// with its size guard and path checks is T-009's, which reuses this entry point.
pub fn parse_and_gate(text: &str) -> Result<PostmanCollection, AppError> {
    // Depth strategy (deliberate, see T-011): serde_json's default recursion limit of 128
    // containers is the *production* safety cap. `from_str` here runs at the default limit, so
    // the resulting `Value` — and therefore every downstream recursion (model deserialization,
    // drop, the index walk, view tree) — is bounded to ≤128 containers in depth. A chain of
    // ~60 folders is the deepest a valid collection can be; deeper hostile input fails fast as
    // `NotJson`. We deliberately do NOT enable `unbounded_depth` / serde_stacker in production:
    // an unbounded `Value` would let owned 10000-deep structures overflow the real OS stack in
    // `drop`/`Display` long before any business logic saw them. `serde_stacker` stays a test-only
    // tool for constructing deep fixtures.
    let value: Value = serde_json::from_str(text).map_err(|e| AppError::NotJson {
        line: e.line() as u32,
        column: e.column() as u32,
        message: e.to_string(),
    })?;
    validate_value(&value)?;
    // A gate-passing file still being unreadable here means its item tree did not deserialize;
    // there is no documented variant for it, so it is reported as the tree half it failed in.
    serde_json::from_value(value).map_err(|_| not_collection("item"))
}

/// Read a collection file off disk and run it through the gate. T-009 layers the size guard,
/// `FileNotFound`/`FileUnreadable` split and recents handling on top of this.
pub fn load(path: &Path) -> Result<PostmanCollection, AppError> {
    // `read_to_string` = read bytes → `String::from_utf8`. A file with invalid UTF-8 bytes
    // therefore becomes `FileUnreadable` here, structurally, before any JSON parse happens
    // (TC-U-049). No separate UTF-8 check is needed on the load path.
    let text = fs::read_to_string(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => AppError::FileNotFound {
            path: path.display().to_string(),
        },
        _ => AppError::FileUnreadable {
            path: path.display().to_string(),
            reason: e.to_string(),
        },
    })?;
    parse_and_gate(&text)
}

fn schema_rejected(found: &str) -> AppError {
    AppError::UnsupportedSchema {
        found: found.to_owned(),
        expected: SCHEMA_URL_V2_1.to_owned(),
    }
}

fn not_collection(missing_field: &str) -> AppError {
    AppError::NotACollection {
        missing_field: missing_field.to_owned(),
    }
}

fn is_v1(root: &Map<String, Value>) -> bool {
    V1_TOP_LEVEL_KEYS.iter().any(|key| root.contains_key(*key))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-U-013 — the canonical v2.1 schema URL passes the gate; the `http://` variant and the
    /// tail match pass too; a `v2.1.0h` lookalike does not.
    #[test]
    fn tc_u_013_v21_schema_passes() {
        assert_eq!(
            validate_schema_url(
                "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            ),
            Ok(())
        );
        assert_eq!(
            validate_schema_url(
                "http://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            ),
            Ok(())
        );
        assert!(validate_schema_url(
            "https://schema.getpostman.com/json/collection/v2.1.0h/collection.json"
        )
        .is_err());
    }

    /// TC-U-014 — a v2.0 schema is rejected and names both versions.
    #[test]
    fn tc_u_014_v20_schema_rejected() {
        let err = validate_schema_url(
            "https://schema.getpostman.com/json/collection/v2.0.0/collection.json",
        )
        .unwrap_err();
        match err {
            AppError::UnsupportedSchema { found, expected } => {
                assert!(found.contains("v2.0.0"));
                assert_eq!(expected, SCHEMA_URL_V2_1);
            }
            other => panic!("expected UnsupportedSchema, got {other:?}"),
        }
    }

    /// TC-U-017 — valid JSON without `item` is not a collection, naming the missing field.
    #[test]
    fn tc_u_017_json_without_item_is_not_a_collection() {
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

    /// FR-006 — valid JSON without `info` is not a collection either.
    #[test]
    fn json_without_info_is_not_a_collection() {
        let err = parse_and_gate(r#"{"item":[]}"#).unwrap_err();
        assert_eq!(
            err,
            AppError::NotACollection {
                missing_field: "info".to_owned(),
            }
        );
    }

    /// FR-005 — a v1 export (top-level `order`/`folders`/`requests`, no `info`) is detected
    /// by shape and rejected naming v1, not as a generic non-collection.
    #[test]
    fn v1_shape_is_detected_and_rejected() {
        let value = serde_json::json!({
            "id": "0ab1c2d3",
            "name": "Acme Billing (v1)",
            "order": ["11111111-1111-1111-1111-111111111111"],
            "folders": [],
            "requests": [{ "id": "11111111-1111-1111-1111-111111111111", "method": "POST" }]
        });
        let err = validate_value(&value).unwrap_err();
        match err {
            AppError::UnsupportedSchema { found, .. } => assert_eq!(found, "v1"),
            other => panic!("expected UnsupportedSchema with found v1, got {other:?}"),
        }
    }

    /// FR-004 — a valid v2.1 document passes the gate and deserializes.
    #[test]
    fn valid_v21_document_passes_gate_and_loads() {
        let collection = parse_and_gate(
            r#"{"info":{"name":"x","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},"item":[{"name":"Ping","request":{"method":"GET","url":"https://api.test/ping"}}]}"#,
        )
        .unwrap();
        assert_eq!(collection.info.schema, SCHEMA_URL_V2_1);
        assert_eq!(collection.item.len(), 1);
    }
}
