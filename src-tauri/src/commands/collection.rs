//! command ที่เกี่ยวกับ collection ที่เปิดอยู่ (design.md §commands::collection)
//!
//! ห้าคำสั่งของ T-009: `open_collection`, `reload_collection`, `close_collection`,
//! `get_node_detail`, `get_example` — ล้วนทำงานกับ [`AppState`] ซึ่งเป็น managed
//! state ตัวเดียวของแอป (design.md §Components: `Mutex<Option<LoadedCollection>>`).
//!
//! `open_collection` / `reload_collection` เป็นคำสั่งที่แตะดิสก์: ขนาด guard (metadata,
//! [ADR-015](design.md#key-decisions)) → อ่าน → schema gate → index → build overview →
//! เก็บ state → push recents (seam ให้ T-010 ต่อ) ส่วน `get_node_detail` / `get_example`
//! อ่านจาก arena ในความจำเท่านั้น ไม่ re-parse ไม่อ่านไฟล์ซ้ำ (ADR-005 / TC-CMD-022)

use std::fs;
use std::io;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::AppError;
use crate::index::{build_index, NodeId, NodeIndex, NodeKind};
use crate::postman::model::{Item, PostmanCollection};
use crate::view::{
    build_overview, example_detail, node_detail, CollectionOverview, ExampleDetail, NodeDetail,
};

/// ขนาดไฟล์สูงสุดที่ยอมเปิด (ADR-015) — 64 MiB ตรวจจาก metadata ก่อนอ่านเข้าความจำ
pub const MAX_COLLECTION_BYTES: u64 = 64 * 1024 * 1024;

/// เปิด collection ได้ทีละตัว — `None` = shell ว่าง ไม่มีอะไรเปิด (FR-008)
#[derive(Default)]
pub struct AppState {
    current: Mutex<Option<OpenCollection>>,
}

/// collection ที่เปิดอยู่ตัวเดียว — ของที่ `get_node_detail` / `get_example` อ่าน
pub(crate) struct OpenCollection {
    /// path ต้นทาง — `reload_collection` (FR-045) อ่านจากตรงนี้
    path: PathBuf,
    /// wire model ที่ผ่าน gate + normalize แล้ว
    collection: PostmanCollection,
    /// arena + index — แหล่งข้อมูลจริงของคำสั่งอ่าน (ADR-005)
    index: NodeIndex,
}

/// เปิด collection จาก path — ใช้ร่วมกันทุกเส้นทางเข้า (command + CLI `--open` + bench T-012)
///
/// ระเบียบ: ขนาด guard (metadata, ก่อนอ่าน) → read+gate+deserialize → build_index →
/// build_overview → เก็บ state → push recents ถ้าเจอ failure ระหว่างทาง state เดิม
/// อยู่ครบ ไม่ถูกทับ (TC-CMD-003 / TC-CMD-028)
///
/// `pub` เพราะ benchmark (T-012) วัดเส้นทางนี้จริง ๆ โดยส่ง `app = None` ไปให้
/// `push_to_recents` คือเป็น no-op ตรง ๆ — ไม่แตะ plugin store
pub fn open_path(
    state: &AppState,
    app: Option<&tauri::AppHandle>,
    path: &str,
) -> Result<CollectionOverview, AppError> {
    let path_buf = PathBuf::from(path);

    // ADR-015 — ปฏิเสธจาก metadata ก่อนอ่านไฟล์ 100 MB แล้วค่อยพบว่าใหญ่เกิน =
    // พ่ายตั้งแต่แรก (TC-CMD-005 / TC-U-038)
    let meta = match fs::metadata(&path_buf) {
        Ok(meta) => meta,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return Err(AppError::FileNotFound {
                path: path.to_string(),
            });
        }
        Err(e) => {
            return Err(AppError::FileUnreadable {
                path: path.to_string(),
                reason: e.to_string(),
            });
        }
    };
    let size_bytes = meta.len();
    if size_bytes > MAX_COLLECTION_BYTES {
        return Err(AppError::FileTooLarge {
            size_bytes: u32::try_from(size_bytes).unwrap_or(u32::MAX),
            limit_bytes: MAX_COLLECTION_BYTES as u32,
        });
    }

    // อ่าน + schema gate + deserialize — ขนาดผ่าน guard แล้วจึงได้อ่านจริง
    let mut collection = crate::schema_gate::load(&path_buf)?;

    // flatten item tree → arena + ทำ variable index (ADR-005 / ADR-006)
    let (index, warnings) = build_index(&mut collection);

    // DTO ฝั่ง frontend — warnings ทั้งหมด (จาก index) ไปกับ overview
    let overview = build_overview(
        &collection,
        &index,
        warnings.clone(),
        path.to_string(),
        u32::try_from(size_bytes).unwrap_or(u32::MAX),
    );

    // เก็บเป็น current — มาถึงตรงนี้ได้แล้วจึง swap ขึ้นมา (สำเร็จแล้วเท่านั้น)
    *state.current.lock().unwrap_or_else(|e| e.into_inner()) = Some(OpenCollection {
        path: path_buf,
        collection,
        index,
    });

    // seam → recents (T-010 ต่อ store เข้าตรงนี้)
    push_to_recents(app, path, &overview.name, overview.request_count);

    Ok(overview)
}

/// re-read แหล่งที่เปิดอยู่จากดิสก์ แล้ว preserve `NodeId` เดิม (FR-045)
///
/// เรียก reload ผ่าน [`open_path`] กับ path เดิม — ตัวนั้นจัดการ guard + state-retention
/// ให้เอง (เปิดไม่สำเร็จ state เดิมยังอยู่ TC-CMD-028)
pub(crate) fn reload_path(
    state: &AppState,
    app: Option<&tauri::AppHandle>,
) -> Result<CollectionOverview, AppError> {
    let path = {
        let guard = state.current.lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_ref() {
            Some(open) => open.path.display().to_string(),
            None => return Err(AppError::NoCollectionOpen),
        }
    };
    open_path(state, app, &path)
}

/// ปิด collection กลับสู่ shell — idempotent: ไม่ error เมื่อเรียกซ้ำ (TC-CMD-030)
pub(crate) fn close_path(state: &AppState) -> Result<(), AppError> {
    *state.current.lock().unwrap_or_else(|e| e.into_inner()) = None;
    Ok(())
}

/// detail ของ node ตัวเดียว — O(1) arena lookup (ADR-005) ไม่แตะไฟล์ ไม่ re-parse
///
/// root (`""`) และ id ที่ไม่มีใน arena → `UnknownNode` (TC-CMD-020)
/// — `view::node_detail` คืน `None` สำหรับ node ราก/หาย จึงแมปเป็น errorเดียวกัน
/// `pub` สำหรับ benchmark (T-012) ที่วัด lookup จริงจาก `AppState`
pub fn node_detail_impl(state: &AppState, node_id_s: String) -> Result<NodeDetail, AppError> {
    let guard = state.current.lock().unwrap_or_else(|e| e.into_inner());
    let Some(open) = guard.as_ref() else {
        return Err(AppError::NoCollectionOpen);
    };
    let node_id: NodeId = node_id_s
        .parse()
        .unwrap_or_else(|never: std::convert::Infallible| match never {});
    node_detail(&open.index, open.collection.auth.as_ref(), &node_id)
        .ok_or(AppError::UnknownNode { node_id: node_id_s })
}

/// saved response ตัวเต็ม (S5) — เฉพาะ request leaf ที่มีตัวอย่าง
///
/// - ไม่มี collection เปิด → `NoCollectionOpen`
/// - id ไม่มีใน arena, หรือ node เป็น folder/collection → `UnknownNode`
///   (folder ไม่มี example — TC-CMD-025 ระบุว่า error ต้องชื่อ node ไม่ใช่ index)
/// - index เกินจำนวน examples → `UnknownExample { node_id, index }` (TC-CMD-024)
pub(crate) fn example_impl(
    state: &AppState,
    node_id_s: String,
    index: u32,
) -> Result<ExampleDetail, AppError> {
    let guard = state.current.lock().unwrap_or_else(|e| e.into_inner());
    let Some(open) = guard.as_ref() else {
        return Err(AppError::NoCollectionOpen);
    };
    let node_id: NodeId = node_id_s
        .parse()
        .unwrap_or_else(|never: std::convert::Infallible| match never {});

    let node = open
        .index
        .by_id(&node_id)
        .ok_or_else(|| AppError::UnknownNode {
            node_id: node_id_s.clone(),
        })?;

    // มี example เฉพาะ request leaf เท่านั้น
    if node.kind != NodeKind::Request {
        return Err(AppError::UnknownNode { node_id: node_id_s });
    }
    let Some(Item::Request(item)) = &node.wire else {
        return Err(AppError::UnknownNode { node_id: node_id_s });
    };
    let response = item
        .response
        .as_ref()
        .and_then(|responses| responses.get(index as usize))
        .ok_or(AppError::UnknownExample {
            node_id: node_id_s,
            index,
        })?;
    Ok(example_detail(response))
}

/// seam ไป recents store — เรียก [`crate::commands::session::record_opened`] ให้บันทึก
/// `session.json` ใน app config dir (MRU, cap 20, FR-041..042)
///
/// ตั้งใจให้ล้มเงียบ (ADR-013 — store พัง ≠ collection เปิดไม่ได้): ถ้าเขียนไม่สำเร็จ
/// ต้องปล่อยผ่านไม่ error ออกไปให้ open_collection ตัวรับผิดชอบ
fn push_to_recents(app: Option<&tauri::AppHandle>, path: &str, name: &str, request_count: u32) {
    if let Some(app) = app {
        if let Err(err) = crate::commands::session::record_opened(app, path, name, request_count) {
            eprintln!("recents store degraded (open still succeeds): {err}");
        }
    }
}

// ============================================================================
// IPC commands — thin wrappers รอบ impl ข้างบน (param ที่ tauri ฉีดให้ จะถูก
// specta ก็อปไป bindings.ts ไม่ได้ — State/AppHandle มี FunctionArg = None)
// ============================================================================

/// เปิด collection ที่ path — ขนาด guard → read → JSON → schema gate →
/// normalize → index → เก็บ recents (TC-CMD-001..015)
#[tauri::command]
#[specta::specta]
pub fn open_collection(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<CollectionOverview, AppError> {
    open_path(&state, Some(&app), &path)
}

/// re-read แหล่งที่เปิดอยู่จากดิสก์ แล้ว preserve `NodeId` เดิม (FR-045)
#[tauri::command]
#[specta::specta]
pub fn reload_collection(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<CollectionOverview, AppError> {
    reload_path(&state, Some(&app))
}

/// ปิด collection กลับสู่ shell — idempotent ไม่ error เมื่อเรียกซ้ำ (TC-CMD-030)
#[tauri::command]
#[specta::specta]
pub fn close_collection(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    close_path(&state)
}

/// detail ของ node ตัวเดียว — O(1) arena lookup, ไม่ re-parse ไม่แตะไฟล์
/// (ADR-005 / TC-CMD-017..022); root (`""`) ให้ `UnknownNode` เพราะ detail ของ
/// collection อยู่ที่ overview อยู่แล้ว (TC-CMD-019/020)
#[tauri::command]
#[specta::specta]
pub fn get_node_detail(
    state: tauri::State<'_, AppState>,
    node_id: String,
) -> Result<NodeDetail, AppError> {
    node_detail_impl(&state, node_id)
}

/// saved response ตัวเต็ม (S5) — body เป็น pieces แยกมาเฉพาะตัวที่ขอ (FR-037)
#[tauri::command]
#[specta::specta]
pub fn get_example(
    state: tauri::State<'_, AppState>,
    node_id: String,
    index: u32,
) -> Result<ExampleDetail, AppError> {
    example_impl(&state, node_id, index)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::schema_gate::SCHEMA_URL_V2_1;

    // ------------------------------------------------------------------------
    // helpers สำหรับเทสต์ — hermetic: เขียนไฟล์ชั่วคราวไว้ใน temp dir ทีละเคส
    // ไม่พึ่ง fixtures ที่ยังไม่มา (tests/fixtures/real/small.json = T-003)
    // ------------------------------------------------------------------------

    /// 12 requests ใน 3 folders (folder ละ 4) — ไฟล์ตรงโครงสร้าง small.json
    /// โดย request ตัวแรกขึ้นไปของทุก folder มี example 1 ตัว
    fn small_collection() -> serde_json::Value {
        let folders: Vec<_> = (0..3)
            .map(|f| {
                let items: Vec<_> = (0..4)
                    .map(|r| {
                        json!({
                            "name": format!("Req {f}.{r}"),
                            "request": {
                                "method": "GET",
                                "url": format!("https://api.example/{f}/{r}")
                            },
                            "response": [
                                {
                                    "name": format!("200 ok {f}.{r}"),
                                    "status": "OK",
                                    "code": 200,
                                    "header": [ { "key": "Content-Type", "value": "application/json" } ],
                                    "body": "{\"ok\":true}"
                                }
                            ]
                        })
                    })
                    .collect();
                json!({ "name": format!("Folder {f}"), "item": items })
            })
            .collect();
        json!({
            "info": { "name": "Small", "schema": SCHEMA_URL_V2_1 },
            "item": folders
        })
    }

    /// collection ใบเดียว request นิดเดียว — ใช้แทน "ไฟล์ที่สอง" ในการ test swap
    fn single_request_collection() -> serde_json::Value {
        json!({
            "info": { "name": "Lone", "schema": SCHEMA_URL_V2_1 },
            "item": [
                { "name": "Only", "request": {
                    "method": "GET", "url": "https://lone.test/" } }
            ]
        })
    }

    /// สร้าง temp dir เฉพาะเคส พร้อม drop เองตอนจบเทสต์
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("minim-t009-{}-{tag}", std::process::id()));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        /// เขียนค่าลงไฟล์ชั่วคราวแล้วคืน path
        fn write(&self, name: &str, value: &serde_json::Value) -> PathBuf {
            let path = self.0.join(name);
            fs::write(&path, serde_json::to_string_pretty(value).unwrap()).unwrap();
            path
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// ids ทั้งหมดใน arena เรียง document order — ใช้เปรียบ reload (TC-U-041)
    fn arena_ids(state: &AppState) -> Vec<String> {
        let guard = state.current.lock().unwrap();
        guard
            .as_ref()
            .unwrap()
            .index
            .nodes
            .iter()
            .map(|n| n.node_id.to_string())
            .collect()
    }

    // ------------------------------------------------------------------------

    /// TC-U-037 — เปิด collection ถูกต้อง คืน overview ที่นับถูก (12/3) + tree เต็ม
    #[test]
    fn tc_u_037_opening_valid_collection_reports_counts() {
        let tmp = TempDir::new("tc-u-037");
        let path = tmp.write("small.json", &small_collection());
        let state = AppState::default();

        let overview = open_path(&state, None, path.to_str().unwrap()).unwrap();

        assert_eq!(overview.request_count, 12);
        assert_eq!(overview.folder_count, 3);
        assert_eq!(overview.schema, SCHEMA_URL_V2_1);
        assert!(overview.file_size_bytes > 0);
        assert!(
            overview.warnings.is_empty(),
            "warnings={:?}",
            overview.warnings
        );
        assert_eq!(overview.tree.len(), 3, "3 folders ที่ root");
        assert!(overview
            .tree
            .iter()
            .all(|f| f.kind == crate::view::NodeKindView::Folder));
        let request_leaves: usize = overview.tree.iter().map(|f| f.children.len()).sum();
        assert_eq!(request_leaves, 12, "folder ละ 4 requests");
    }

    /// TC-U-038 — ไฟล์เกิน 64 MB ถูกปฏิเสธด้วย FileTooLarge ก่อนอ่าน
    /// (sparse file: metadata บอกขนาด 100 MB แต่ไม่มี data จริงอ่านอยู่)
    #[test]
    fn tc_u_038_oversized_file_rejected_before_read() {
        let tmp = TempDir::new("tc-u-038");
        let big = tmp.path("huge.json");
        fs::File::create(&big)
            .unwrap()
            .set_len(100 * 1024 * 1024)
            .unwrap();
        let state = AppState::default();

        let err = open_path(&state, None, big.to_str().unwrap()).unwrap_err();
        assert_eq!(
            err,
            AppError::FileTooLarge {
                size_bytes: 104_857_600,
                limit_bytes: 67_108_864,
            }
        );
        // ไม่มีอะไรถูก load เข้า state
        assert!(state.current.lock().unwrap().is_none());

        // ขอบพอดีที่ 64 MiB ยังผ่าน guard (แต่ไฟล์ sparse เป็น non-JSON → แยก error)
        fs::File::create(tmp.path("at-limit.json"))
            .unwrap()
            .set_len(64 * 1024 * 1024)
            .unwrap();
        let err = open_path(&state, None, tmp.path("at-limit.json").to_str().unwrap()).unwrap_err();
        assert!(
            !matches!(err, AppError::FileTooLarge { .. }),
            "64 MiB ต้องไม่โดน size guard, ได้ {err:?}"
        );
    }

    /// TC-U-039 — detail ของ id ที่ไม่มี → UnknownNode ไม่ panic
    #[test]
    fn tc_u_039_unknown_node_id_is_an_error() {
        let tmp = TempDir::new("tc-u-039");
        let path = tmp.write("small.json", &small_collection());
        let state = AppState::default();
        open_path(&state, None, path.to_str().unwrap()).unwrap();

        assert_eq!(
            node_detail_impl(&state, "99.99".to_string()).unwrap_err(),
            AppError::UnknownNode {
                node_id: "99.99".to_string()
            }
        );
        // root "" ก็เข้า error ตัวเดียวกัน (TC-CMD-020)
        assert_eq!(
            node_detail_impl(&state, String::new()).unwrap_err(),
            AppError::UnknownNode {
                node_id: String::new()
            }
        );
    }

    /// TC-U-040 — ยังไม่มี collection เปิด: ทุกคำสั่งคืน NoCollectionOpen ไม่ panic
    #[test]
    fn tc_u_040_commands_fail_cleanly_with_no_collection() {
        let state = AppState::default();

        assert_eq!(
            node_detail_impl(&state, "0".to_string()).unwrap_err(),
            AppError::NoCollectionOpen
        );
        assert_eq!(
            example_impl(&state, "0".to_string(), 0).unwrap_err(),
            AppError::NoCollectionOpen
        );
        assert_eq!(
            reload_path(&state, None).unwrap_err(),
            AppError::NoCollectionOpen
        );
    }

    /// TC-U-041 — reload ไฟล์เดิม: NodeId ทุกตัวคงเดิม (positional ids)
    #[test]
    fn tc_u_041_reload_preserves_node_ids() {
        let tmp = TempDir::new("tc-u-041");
        let path = tmp.write("small.json", &small_collection());
        let state = AppState::default();

        open_path(&state, None, path.to_str().unwrap()).unwrap();
        let before = arena_ids(&state);
        assert_eq!(before.len(), 1 + 3 + 12, "root + 3 folders + 12 requests");

        let overview = reload_path(&state, None).unwrap();
        let after = arena_ids(&state);

        assert_eq!(before, after, "reload ไม่เปลี่ยน NodeId");
        assert_eq!(overview.request_count, 12);
    }

    /// TC-U-042 — เปิดไฟล์ที่สองแทนที่ไฟล์แรก: id ของ A กลายเป็น UnknownNode
    #[test]
    fn tc_u_042_opening_second_collection_replaces_first() {
        let tmp = TempDir::new("tc-u-042");
        let a = tmp.write("a.json", &small_collection());
        let b = tmp.write("b.json", &single_request_collection());
        let state = AppState::default();

        open_path(&state, None, a.to_str().unwrap()).unwrap();
        assert!(node_detail_impl(&state, "0.1".to_string()).is_ok());

        let overview_b = open_path(&state, None, b.to_str().unwrap()).unwrap();
        assert_eq!(overview_b.request_count, 1);
        assert_eq!(overview_b.name, "Lone");

        // "0.1" มีใน A เท่านั้น — หลัง swap ต้อง UnknownNode
        assert_eq!(
            node_detail_impl(&state, "0.1".to_string()).unwrap_err(),
            AppError::UnknownNode {
                node_id: "0.1".to_string()
            }
        );
        // แต่ id ของ B ยังทำงาน
        assert!(node_detail_impl(&state, "0".to_string()).is_ok());
    }

    /// get_example: happy path + ขอบ index + folder/unknown node (TC-CMD-023..026)
    #[test]
    fn get_example_bounds_folder_and_unknown() {
        let tmp = TempDir::new("get-example");
        let path = tmp.write("small.json", &small_collection());
        let state = AppState::default();
        open_path(&state, None, path.to_str().unwrap()).unwrap();

        // happy path — "0.0" มี 1 example (index 0)
        let detail = example_impl(&state, "0.0".to_string(), 0).unwrap();
        assert_eq!(detail.code, Some(200));
        assert_eq!(detail.name, "200 ok 0.0");

        // index เกิน → UnknownExample ชื่อ node + index
        assert_eq!(
            example_impl(&state, "0.0".to_string(), 1).unwrap_err(),
            AppError::UnknownExample {
                node_id: "0.0".to_string(),
                index: 1,
            }
        );

        // folder → UnknownNode ไม่ใช่ UnknownExample (TC-CMD-025)
        assert_eq!(
            example_impl(&state, "0".to_string(), 0).unwrap_err(),
            AppError::UnknownNode {
                node_id: "0".to_string()
            }
        );

        // id ไม่มีใน arena → UnknownNode
        assert_eq!(
            example_impl(&state, "99.99".to_string(), 0).unwrap_err(),
            AppError::UnknownNode {
                node_id: "99.99".to_string()
            }
        );
    }

    /// request ที่ไม่มี examples เลย → index 0 เป็น UnknownExample (TC-CMD-024)
    #[test]
    fn get_example_on_request_without_examples() {
        let tmp = TempDir::new("get-example-none");
        let path = tmp.write("lone.json", &single_request_collection());
        let state = AppState::default();
        open_path(&state, None, path.to_str().unwrap()).unwrap();

        assert_eq!(
            example_impl(&state, "0".to_string(), 0).unwrap_err(),
            AppError::UnknownExample {
                node_id: "0".to_string(),
                index: 0,
            }
        );
    }

    /// open บนไฟล์ที่ไม่อยู่แล้ว / เป็น directory → error พิมพ์ถูก ไม่ panic
    #[test]
    fn open_missing_path_and_directory() {
        let tmp = TempDir::new("open-errors");
        let state = AppState::default();

        let missing = tmp.path("nope.json");
        assert_eq!(
            open_path(&state, None, missing.to_str().unwrap()).unwrap_err(),
            AppError::FileNotFound {
                path: missing.display().to_string()
            }
        );

        // directory: metadata ผ่าน (ขนาดเล็ก) แต่ read เป็น fail → FileUnreadable
        fs::create_dir_all(tmp.path("adir")).unwrap();
        assert!(matches!(
            open_path(&state, None, tmp.path("adir").to_str().unwrap()),
            Err(AppError::FileUnreadable { .. })
        ));
    }

    /// close idempotent + หลัง close คำสั่งอ่านต้อง NoCollectionOpen (TC-CMD-030)
    #[test]
    fn close_is_idempotent_and_reads_fail_after() {
        let tmp = TempDir::new("close");
        let path = tmp.write("small.json", &small_collection());
        let state = AppState::default();
        open_path(&state, None, path.to_str().unwrap()).unwrap();

        close_path(&state).unwrap();
        close_path(&state).unwrap(); // ครั้งที่สอง = no-op ไม่ error

        assert_eq!(
            node_detail_impl(&state, "0".to_string()).unwrap_err(),
            AppError::NoCollectionOpen
        );
    }
}
