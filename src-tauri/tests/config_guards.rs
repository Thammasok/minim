//! Security-surface guards over the two JSON config files.
//!
//! These are deliberately config assertions rather than runtime tests. `capabilities/default.json`
//! and the `csp` block of `tauri.conf.json` *are* the enforcement of NFR-007 (no network/shell
//! capability) and NFR-008 (no directory-wide filesystem scope). A later task widening them
//! "just to try something" should break a test here rather than ship.
//!
//! Covers TC-U-003 and TC-U-004 from dev-plan.md §T-002.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;

/// Permission namespaces the webview must never be granted. `fs:` would hand the frontend a
/// directory read scope (ADR-008 puts file reading in our own command instead); `http:` and
/// `shell:` would let it reach the network or spawn a process, which NFR-007 forbids outright.
const FORBIDDEN_PERMISSION_PREFIXES: [&str; 3] = ["fs:", "http:", "shell:"];

/// The one non-`'self'` origin the CSP is allowed to name: Tauri's own IPC custom-protocol host.
const IPC_ORIGIN: &str = "http://ipc.localhost";

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read_json(relative: &str) -> Value {
    let path = manifest_dir().join(relative);
    let text =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("{} is not valid JSON: {e}", path.display()))
}

/// Flattens a capability `permissions` entry to its identifier.
///
/// An entry is either a bare string (`"dialog:allow-open"`) or an object carrying a scope
/// (`{ "identifier": "fs:allow-read", "allow": [...] }`). Both forms are scanned, so the object
/// form cannot be used to slip a forbidden namespace past this test.
fn permission_identifier(entry: &Value) -> String {
    match entry {
        Value::String(s) => s.clone(),
        Value::Object(map) => map
            .get("identifier")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        other => panic!("unexpected permission entry shape: {other}"),
    }
}

/// Collects a CSP directive's sources, which may be a single string or an array of strings.
fn directive_sources(value: &Value) -> Vec<String> {
    match value {
        Value::String(s) => vec![s.clone()],
        Value::Array(items) => items
            .iter()
            .map(|v| {
                v.as_str()
                    .unwrap_or_else(|| panic!("CSP source is not a string: {v}"))
                    .to_string()
            })
            .collect(),
        other => panic!("unexpected CSP directive shape: {other}"),
    }
}

/// Returns every `http://` / `https://` origin in a CSP map that is not the IPC host.
fn remote_origins(csp: &Value) -> Vec<String> {
    let map = csp
        .as_object()
        .expect("csp must be a directive object, not a raw policy string");

    let mut found = Vec::new();
    for (directive, value) in map {
        for source in directive_sources(value) {
            for token in source.split_whitespace() {
                let is_remote = token.starts_with("http://") || token.starts_with("https://");
                if is_remote && token != IPC_ORIGIN {
                    found.push(format!("{directive}: {token}"));
                }
            }
        }
    }
    found
}

/// TC-U-003 — the capability manifest grants no filesystem, network or shell permission.
#[test]
fn tc_u_003_capability_manifest_grants_no_forbidden_permission() {
    let capability = read_json("capabilities/default.json");

    let permissions = capability["permissions"]
        .as_array()
        .expect("capability must declare a permissions array");

    let forbidden_matches: Vec<String> = permissions
        .iter()
        .map(permission_identifier)
        .filter(|id| {
            FORBIDDEN_PERMISSION_PREFIXES
                .iter()
                .any(|prefix| id.starts_with(prefix))
        })
        .collect();

    assert!(
        forbidden_matches.is_empty(),
        "capabilities/default.json grants forbidden permissions: {forbidden_matches:?}"
    );
}

/// TC-U-003 (companion) — the grant is exactly the three identifiers design.md specifies.
///
/// The prefix scan above catches the known-bad namespaces; this pins the positive set, so a
/// permission from a namespace nobody has thought of yet is also caught.
#[test]
fn tc_u_003_capability_manifest_grants_exactly_the_designed_set() {
    let capability = read_json("capabilities/default.json");

    let granted: Vec<String> = capability["permissions"]
        .as_array()
        .expect("capability must declare a permissions array")
        .iter()
        .map(permission_identifier)
        .collect();

    assert_eq!(
        granted,
        vec!["core:default", "dialog:allow-open", "store:default"],
        "the capability set is the enforcement of NFR-007/NFR-008 — widening it needs a design change"
    );
    assert_eq!(
        capability["windows"].as_array().map(Vec::as_slice),
        Some(&[Value::from("main")][..]),
        "the capability must be scoped to the main window"
    );
}

/// TC-U-004 — the production CSP forbids remote origins.
#[test]
fn tc_u_004_csp_forbids_remote_origins() {
    let config = read_json("tauri.conf.json");
    let csp = &config["app"]["security"]["csp"];

    assert_eq!(
        csp["default-src"], "'self'",
        "default-src must be 'self' so anything not explicitly widened is same-origin only"
    );

    let remote = remote_origins(csp);
    assert!(
        remote.is_empty(),
        "tauri.conf.json csp names remote origins: {remote:?}"
    );
}

/// TC-U-004 (companion) — the dev-only CSP widens no further than the local Vite server.
///
/// `devCsp` applies only when `tauri::is_dev()`, never in a release bundle, but it is still
/// security surface in every developer's window and is held to the same no-remote-origin rule.
#[test]
fn tc_u_004_dev_csp_widens_only_to_localhost() {
    let config = read_json("tauri.conf.json");
    let dev_csp = &config["app"]["security"]["devCsp"];

    if dev_csp.is_null() {
        return; // devCsp is optional; if absent, the production CSP applies in dev too.
    }

    assert_eq!(dev_csp["default-src"], "'self'");

    let offending: Vec<String> = remote_origins(dev_csp)
        .into_iter()
        .filter(|entry| !entry.contains("//localhost:1420"))
        .collect();

    assert!(
        offending.is_empty(),
        "devCsp names origins beyond the local dev server: {offending:?}"
    );

    // ws:// is not matched by the http(s) scan above, so check the websocket sources too.
    let ws_offending: Vec<String> = dev_csp
        .as_object()
        .expect("devCsp must be a directive object")
        .iter()
        .flat_map(|(directive, value)| {
            directive_sources(value)
                .into_iter()
                .flat_map(|s| {
                    s.split_whitespace()
                        .map(str::to_string)
                        .collect::<Vec<String>>()
                })
                .map(move |token| (directive.clone(), token))
        })
        .filter(|(_, token)| token.starts_with("ws://") || token.starts_with("wss://"))
        .filter(|(_, token)| token != "ws://localhost:1420")
        .map(|(directive, token)| format!("{directive}: {token}"))
        .collect();

    assert!(
        ws_offending.is_empty(),
        "devCsp names websocket origins beyond the local dev server: {ws_offending:?}"
    );
}

/// The capability file only constrains what is actually loaded if `tauri.conf.json` either names
/// it or names nothing at all. Pinning the reference stops a stray second capability file from
/// silently joining the security boundary.
#[test]
fn tauri_config_loads_only_the_main_capability() {
    let config = read_json("tauri.conf.json");
    let capabilities = &config["app"]["security"]["capabilities"];

    assert_eq!(
        capabilities.as_array().map(Vec::as_slice),
        Some(&[Value::from("main-capability")][..]),
        "exactly one capability must be enabled"
    );

    let mut files: Vec<String> = fs::read_dir(manifest_dir().join("capabilities"))
        .expect("capabilities/ must exist")
        .map(|entry| entry.expect("readable dir entry").file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.starts_with('.')) // ignore .DS_Store and friends
        .collect();
    files.sort();

    assert_eq!(
        files,
        vec!["default.json"],
        "an unreviewed capability file was added alongside default.json"
    );
}

/// Guards on the guards.
///
/// `tauri-build` refuses to compile an unknown permission identifier, so `fs:`/`http:`/`shell:`
/// cannot be planted in `capabilities/default.json` to prove the scanner above catches them —
/// the crate would not build far enough to run a test. These exercise the scanning helpers
/// against synthetic input instead, so a scanner that silently matched nothing would be caught.
mod scanner_logic {
    use super::*;

    fn forbidden(permissions: &[Value]) -> Vec<String> {
        permissions
            .iter()
            .map(permission_identifier)
            .filter(|id| {
                FORBIDDEN_PERMISSION_PREFIXES
                    .iter()
                    .any(|prefix| id.starts_with(prefix))
            })
            .collect()
    }

    #[test]
    fn scanner_flags_a_bare_string_permission() {
        let permissions = vec![
            Value::from("core:default"),
            Value::from("shell:allow-execute"),
        ];
        assert_eq!(forbidden(&permissions), vec!["shell:allow-execute"]);
    }

    /// The object form carries a scope; the scanner must look through it to the identifier,
    /// otherwise a scoped `fs:allow-read` would read as "not a string, therefore fine".
    #[test]
    fn scanner_flags_a_scoped_object_permission() {
        let permissions = vec![serde_json::json!({
            "identifier": "fs:allow-read",
            "allow": [{ "path": "$HOME/**" }]
        })];
        assert_eq!(forbidden(&permissions), vec!["fs:allow-read"]);
    }

    #[test]
    fn scanner_passes_the_designed_set() {
        let permissions = vec![
            Value::from("core:default"),
            Value::from("dialog:allow-open"),
            Value::from("store:default"),
        ];
        assert!(forbidden(&permissions).is_empty());
    }

    #[test]
    fn remote_origin_scan_reads_array_valued_directives() {
        let csp = serde_json::json!({
            "default-src": "'self'",
            "connect-src": ["ipc:", "http://ipc.localhost", "https://telemetry.example.com"]
        });
        assert_eq!(
            remote_origins(&csp),
            vec!["connect-src: https://telemetry.example.com"]
        );
    }

    #[test]
    fn remote_origin_scan_allows_only_the_ipc_host() {
        let csp = serde_json::json!({
            "default-src": "'self'",
            "connect-src": "ipc: http://ipc.localhost"
        });
        assert!(remote_origins(&csp).is_empty());
    }
}
