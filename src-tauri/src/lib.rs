//! minim's Tauri shell.
//!
//! This crate is deliberately thin: it builds the window, registers the two plugins the
//! webview is allowed to talk to, wires the IPC commands (T-009) and runs.

/// Postman Collection Format v2.1 wire model — the contract with both sides of the
/// product (what minim writes for Newman, and what it must tolerate reading back from
/// Postman exports). Added in T-004.
pub mod postman;

/// Structured, serializable, specta-typed error enum crossing the IPC seam. Added in T-005.
pub mod error;

/// `info.schema` gate that runs before the item tree is walked (FR-004). Added in T-005.
pub mod schema_gate;

/// The four normalizers (`url_to_string`, `headers`, `script_source`, `description`) plus
/// `LoadWarning` — the boundary from polymorphic wire types to canonical shapes. Added T-006.
pub mod normalize;

/// The node index — flattens the recursive `Item` tree into an arena, assigns positional
/// `NodeId`s, records ordered folder paths, resolves effective auth down the ancestor chain,
/// and builds the variable reference index. Added T-007.
pub mod index;

/// Normalized DTOs crossing the IPC boundary — one canonical shape per field, `specta::Type`
/// derives for `bindings.ts`. Added T-008.
pub mod view;

/// The nine IPC commands (stubs in T-009, bodies in T-010) plus the `tauri-specta` builder
/// that exports [`view`] DTOs to `src/bindings.ts` (NFR-015).
///
/// Public so the bench harness (T-012) can drive the REAL command wiring —
/// `open_path` with `app = None` and the node-detail impl — instead of re-measuring a
/// rebuilt copy of the same code path.
pub mod commands;

/// Builds the Tauri application without running it.
///
/// Kept separate from [`run`] so that later tasks can bolt on managed state, an
/// `invoke_handler`, and the debug-only `--open <path>` argument of ADR-017 in one place
/// without restructuring the entry point.
fn build() -> tauri::Builder<tauri::Wry> {
    let specta = commands::specta_builder();

    // NFR-015 — keep src/bindings.ts in lockstep with the command signatures. Debug-only
    // (any regenerated bindings are committed, never shipped); CI re-checks drift via the
    // ignored test instead.
    #[cfg(debug_assertions)]
    commands::export_bindings(&specta);

    let builder = tauri::Builder::default()
        // Native file picker. It returns a path and nothing else — the file itself is read by
        // the Rust core, so the webview never holds a filesystem capability (ADR-008).
        .plugin(tauri_plugin_dialog::init())
        // Recents and preferences, in the app config dir, outside the collection file (ADR-013).
        .plugin(tauri_plugin_store::Builder::new().build())
        // T-009: AppState — the collection currently open, shared by all five commands.
        .manage(commands::collection::AppState::default())
        .invoke_handler(specta.invoke_handler());

    // ADR-017 — a debug-only `--open <path>` CLI arg so the open flow is E2E-testable
    // without the native dialog. It reads the state via the same open path the command
    // uses, so it cannot drift. Compiled in under `debug_assertions` only: `std::env::args`
    // is no guarantee of a CLI on every platform, so release bundles must not contain it.
    #[cfg(debug_assertions)]
    {
        use tauri::Manager;

        builder.setup(|app| {
            let Some(path) = cli_open_arg() else {
                return Ok(());
            };
            let state = app.state::<commands::collection::AppState>();
            if let Err(err) = commands::collection::open_path(&state, Some(app.handle()), &path) {
                // Non-fatal: the shell opens anyway and the error state (S7) renders.
                eprintln!("minim: --open {path:?} failed: {err}");
            }
            Ok(())
        })
    }

    #[cfg(not(debug_assertions))]
    builder
}

/// Parse a debug-only `--open <path>` (or `--open=<path>`) argument from argv. First match
/// wins; anything else is ignored so extra CLI flags never break the dev shell.
#[cfg(debug_assertions)]
fn cli_open_arg() -> Option<String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--open" {
            return args.next();
        }
        if let Some(path) = arg.strip_prefix("--open=") {
            return Some(path.to_owned());
        }
    }
    None
}

/// Desktop and mobile entry point.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    build()
        .run(tauri::generate_context!())
        .expect("error while running minim");
}
