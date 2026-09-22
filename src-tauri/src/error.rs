//! minim's structured error type.
//!
//! `AppError` is the single error enum crossing the IPC seam. Every failure the UI must
//! distinguish is its own variant (design.md §AppError wire shape); serialization is
//! adjacently tagged `{ "kind", "detail" }` with camelCase names, so the frontend renders
//! from typed fields and never parses prose.

use serde::Serialize;

/// Every distinct failure the UI must distinguish.
///
/// Tagged `{ kind, detail }` on the wire (design.md §AppError wire shape). The `specta::Type`
/// derive keeps `bindings.ts` in lockstep with this shape once T-008 wires `tauri-specta`.
#[derive(Debug, Clone, PartialEq, Serialize, thiserror::Error, specta::Type)]
#[serde(
    tag = "kind",
    content = "detail",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AppError {
    /// The picked path does not exist.
    #[error("file not found: {path}")]
    FileNotFound { path: String },

    /// The path exists but cannot be read (permission, a directory, invalid UTF-8, …).
    #[error("file unreadable: {path}: {reason}")]
    FileUnreadable { path: String, reason: String },

    /// Over the 64 MiB size guard of ADR-015, decided from metadata before any read.
    #[error("file too large: {size_bytes} bytes, limit {limit_bytes}")]
    FileTooLarge { size_bytes: u32, limit_bytes: u32 },

    /// Not valid JSON; `line`/`column` come straight from serde_json (FR-007).
    #[error("file is not valid JSON: {message}")]
    NotJson {
        line: u32,
        column: u32,
        message: String,
    },

    /// Valid JSON that is missing a field a collection requires (FR-006).
    #[error("not a Postman collection: missing field {missing_field}")]
    NotACollection { missing_field: String },

    /// `info.schema` is not the v2.1 URL minim reads (FR-005).
    #[error("unsupported collection schema: found {found}, expected {expected}")]
    UnsupportedSchema { found: String, expected: String },

    /// A command was invoked with no collection open.
    #[error("no collection is open")]
    NoCollectionOpen,

    /// `get_node_detail` / `get_example` hit an unknown node id.
    #[error("unknown node: {node_id}")]
    UnknownNode { node_id: String },

    /// `get_example` hit an out-of-range example index.
    #[error("unknown example: node {node_id}, index {index}")]
    UnknownExample { node_id: String, index: u32 },

    /// A store read/write failed. Non-fatal — the collection still opens, only persistence
    /// is degraded — but surfaced per ADR-013 (reported by T-010).
    #[error("collection store unavailable ({operation}): {reason}")]
    StoreUnavailable {
        operation: StoreOperation,
        reason: String,
    },

    /// A command whose signature is exported to `bindings.ts` but whose body a later task
    /// implements (T-009/T-010). Unreachable in the shipped app — any invoke returns this
    /// only until the real implementation lands.
    #[error("not implemented: {command}")]
    NotImplemented { command: &'static str },
}

/// Which side of the persistence layer failed — the `"read" | "write"` union of the wire shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum StoreOperation {
    Read,
    Write,
}

impl std::fmt::Display for StoreOperation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreOperation::Read => f.write_str("read"),
            StoreOperation::Write => f.write_str("write"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-CMD-014 (wire contract) — every variant serializes to the `{kind, detail}` envelope
    /// with camelCase kind and detail field names.
    fn wire(err: AppError) -> serde_json::Value {
        serde_json::to_value(err).unwrap()
    }

    #[test]
    fn serializes_to_kind_detail_envelope() {
        let v = wire(AppError::UnsupportedSchema {
            found: "https://schema.getpostman.com/json/collection/v2.0.0/collection.json".into(),
            expected: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json".into(),
        });
        assert_eq!(v["kind"], "unsupportedSchema");
        assert_eq!(
            v["detail"]["found"],
            "https://schema.getpostman.com/json/collection/v2.0.0/collection.json"
        );
        assert_eq!(
            v["detail"]["expected"],
            "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        );

        let v = wire(AppError::FileTooLarge {
            size_bytes: 67_108_865,
            limit_bytes: 67_108_864,
        });
        assert_eq!(v["kind"], "fileTooLarge");
        assert_eq!(v["detail"]["sizeBytes"], 67_108_865);
        assert_eq!(v["detail"]["limitBytes"], 67_108_864);

        let v = wire(AppError::NotJson {
            line: 418,
            column: 12,
            message: "trailing comma".into(),
        });
        assert_eq!(v["kind"], "notJson");
        assert_eq!(v["detail"]["line"], 418);
        assert_eq!(v["detail"]["column"], 12);

        let v = wire(AppError::NotACollection {
            missing_field: "item".into(),
        });
        assert_eq!(v["kind"], "notACollection");
        assert_eq!(v["detail"]["missingField"], "item");

        let v = wire(AppError::FileNotFound {
            path: "/gone.json".into(),
        });
        assert_eq!(v["kind"], "fileNotFound");
        assert_eq!(v["detail"]["path"], "/gone.json");

        let v = wire(AppError::FileUnreadable {
            path: "/locked.json".into(),
            reason: "permission denied".into(),
        });
        assert_eq!(v["kind"], "fileUnreadable");
        assert_eq!(v["detail"]["reason"], "permission denied");

        let v = wire(AppError::NoCollectionOpen);
        assert_eq!(v["kind"], "noCollectionOpen");

        let v = wire(AppError::UnknownNode {
            node_id: "99.99".into(),
        });
        assert_eq!(v["kind"], "unknownNode");
        assert_eq!(v["detail"]["nodeId"], "99.99");

        let v = wire(AppError::UnknownExample {
            node_id: "0.0".into(),
            index: 3,
        });
        assert_eq!(v["kind"], "unknownExample");
        assert_eq!(v["detail"]["nodeId"], "0.0");
        assert_eq!(v["detail"]["index"], 3);

        let v = wire(AppError::StoreUnavailable {
            operation: StoreOperation::Write,
            reason: "store.json is locked".into(),
        });
        assert_eq!(v["kind"], "storeUnavailable");
        assert_eq!(v["detail"]["operation"], "write");
        assert_eq!(v["detail"]["reason"], "store.json is locked");

        let v = wire(AppError::NotImplemented {
            command: "open_collection",
        });
        assert_eq!(v["kind"], "notImplemented");
        assert_eq!(v["detail"]["command"], "open_collection");
    }
}
