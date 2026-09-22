//! Fixture-level integration tests for the node index (T-007 acceptance):
//! `build_index` on the real `torture.json` collection is deterministic (same tree in
//! → same arena out) and grounds every `NodeId`/`AuthSource`/variable-count rule in a
//! document that Postman itself would have to accept.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use minim_lib::index::{build_index, AuthSource, NodeId, NodeIndex};
use minim_lib::postman::model::PostmanCollection;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn parse_torture() -> PostmanCollection {
    let path = manifest_dir()
        .join("../tests/fixtures/torture.json")
        .canonicalize()
        .unwrap_or_else(|e| panic!("cannot resolve fixtures/torture.json: {e}"));
    let text =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("fixtures/torture.json failed to deserialize: {e}"))
}

/// Who a request shows its auth from — name lookup for readable assertions.
fn source_of(idx: &NodeIndex, name: &str) -> (String, String) {
    let node = idx
        .nodes
        .iter()
        .find(|n| n.name == name)
        .unwrap_or_else(|| panic!("no node named {name:?}"));
    let source = match &node.effective_auth.source {
        AuthSource::Own => "own".to_string(),
        AuthSource::Collection => "collection".to_string(),
        AuthSource::Folder(id) => format!("folder:{id}"),
        AuthSource::None => "none".to_string(),
    };
    (
        node.effective_auth.auth_type.clone().unwrap_or_default(),
        source,
    )
}

/// TC-U-030 — parsing the same file twice yields byte-identical indexes: same arena
/// order, same `NodeId`s, same name↔id mapping. Deterministic by construction but the
/// fixture guards against regressions (e.g. sort order or id derivation changes).
#[test]
fn tc_u_030_same_fixture_produces_identical_indexes() {
    let mut a = parse_torture();
    let mut b = parse_torture();
    let (idx_a, _) = build_index(&mut a);
    let (idx_b, _) = build_index(&mut b);

    assert_eq!(idx_a.nodes.len(), idx_b.nodes.len());
    for (na, nb) in idx_a.nodes.iter().zip(&idx_b.nodes) {
        assert_eq!(na.node_id, nb.node_id, "arena order must not drift");
        assert_eq!(na.name, nb.name);
        assert_eq!(na.kind, nb.kind);
    }
    assert_eq!(idx_a.by_id, idx_b.by_id);
}

/// The root folders get plain positional ids: "06 Auth types" is the 6th root item.
#[test]
fn tc_u_030_root_folder_ids_are_positional() {
    let mut collection = parse_torture();
    let (idx, _) = build_index(&mut collection);

    let auth_folder = idx
        .nodes
        .iter()
        .find(|n| n.name == "06 Auth types")
        .unwrap();
    assert_eq!(auth_folder.node_id, "5".parse().unwrap());
    assert_eq!(auth_folder.kind, minim_lib::index::NodeKind::Folder);
    assert_eq!(auth_folder.children.len(), 14);
}

/// Requests inside the bearer folder with `auth: null` or no `auth` inherit the folder
/// bearer with source `Folder("5")`; explicit `noauth` stays `Own`.
#[test]
fn tc_u_030_folder_auth_inheritance_is_grounded() {
    let mut collection = parse_torture();
    let (idx, _) = build_index(&mut collection);

    let (ty, src) = source_of(
        &idx,
        "auth explicitly null - falls back to the folder bearer",
    );
    assert_eq!(ty, "bearer");
    assert_eq!(src, "folder:5");

    let (ty, src) = source_of(&idx, "auth absent - inherits the folder bearer");
    assert_eq!(ty, "bearer");
    assert_eq!(src, "folder:5");

    let (ty, src) = source_of(&idx, "auth noauth (explicit opt-out of the folder bearer)");
    assert_eq!(ty, "noauth");
    assert_eq!(src, "own");

    let (ty, src) = source_of(&idx, "auth apikey");
    assert_eq!(ty, "apikey");
    assert_eq!(src, "own");
}

/// Collection-level auth (basic) reaches a request whose folder chain has no auth —
/// here the bare-URL-string request's collection is the only auth above it.
#[test]
fn tc_u_030_collection_auth_survives_deep_folders() {
    let mut collection = parse_torture();
    let (idx, _) = build_index(&mut collection);

    let leaf = idx
        .nodes
        .iter()
        .find(|n| n.name == "leaf at depth 7")
        .unwrap();
    assert_eq!(leaf.folder_path.len(), 6);
    assert_eq!(leaf.folder_path[0], "07 Deep nesting");
    assert_eq!(leaf.folder_path[5], "depth 6");
    assert_eq!(leaf.depth, 7);
    assert!(matches!(leaf.effective_auth.source, AuthSource::Collection));
    assert_eq!(leaf.effective_auth.auth_type.as_deref(), Some("basic"));
}

/// The variable index agrees with a manual scan of the fixture: only `{{base_url}}` is
/// referenced (45 times) and every declared variable is named in document order.
#[test]
fn tc_u_030_variable_index_matches_manual_scan() {
    let mut collection = parse_torture();
    let (idx, _) = build_index(&mut collection);

    assert_eq!(
        idx.collection_var_names,
        ["base_url", "basic_user", "basic_pass", "documented"]
    );
    assert_eq!(idx.collection_var_counts.get("base_url").copied(), Some(45));
    let only_base_url: HashMap<&str, usize> = idx
        .collection_var_counts
        .iter()
        .map(|(k, v)| (k.as_str(), *v))
        .collect();
    assert_eq!(only_base_url, HashMap::from([("base_url", 45)]));
}

/// `by_id` resolves every arena node back to itself — the id index is total.
#[test]
fn tc_u_030_by_id_is_total_over_the_arena() {
    let mut collection = parse_torture();
    let (idx, _) = build_index(&mut collection);

    assert_eq!(idx.by_id.len(), idx.nodes.len());
    for node in &idx.nodes {
        let id: NodeId = node.node_id.clone();
        assert_eq!(idx.by_id(&id).unwrap().name, node.name);
        assert!(idx.by_id(&id.child(999)).is_none());
    }
}

/// `build_index` moves the tree into the arena — the collection's own `item` is emptied.
#[test]
fn tc_u_030_collection_item_is_consumed_by_the_index() {
    let mut collection = parse_torture();
    assert!(!collection.item.is_empty());
    let (_, _) = build_index(&mut collection);
    assert!(collection.item.is_empty());
}
