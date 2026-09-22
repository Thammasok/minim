//! IPC commands — รายการทุกรายการที่ frontend เรียกได้ (design.md §API Contracts)
//!
//! `collection` ครบทั้งห้าตัวแล้วใน T-009 (open/close/detail/example — body จริง
//! อยู่ที่ [`collection`]) ส่วน `session` (recents + preferences) ยังเป็น stubs
//! คืน [`AppError::NotImplemented`] ให้ T-010 ได้: sign-off ของ T-009 คือ
//! "bindings ตรงกับ design + CI จับ drift ได้"
//!
//! เคล็ดลับของการปักเสา: param ตั้งชื่อตามคำสั่งใน design เป๊ะ (ไม่ใส่ `_` นำหน้า)
//! เพราะชื่อนั้นไปเป็นทั้ง key ของ invoke payload และชื่อ argument ใน bindings —
//! ถ้าตอน stub ใช้ `_path` แล้ว NS ที่ฝั่ง JS ส่ง `{ path }` จะงัดค่าไม่ตรงกัน
//! ตัว unused จึงจัดการด้วย `let _ = …;` ใน body แทน

pub mod collection;
pub mod session;

/// tauri-specta builder ที่มีคำสั่งครบทั้งเก้า — แหล่งเดียวของ truth สำหรับ
/// `bindings.ts` ทั้ง `lib.rs` และเทสต์ `regenerate_bindings` ใช้จากตัวนี้
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        collection::open_collection,
        collection::reload_collection,
        collection::close_collection,
        collection::get_node_detail,
        collection::get_example,
        session::list_recents,
        session::forget_recent,
        session::get_preferences,
        session::set_preferences,
    ])
}

/// ที่อยู่ของไฟล์ bindings ที่จะเขียน — อยู่ `src/bindings.ts` ของ repo (นอก
/// crate) อ้างจาก `CARGO_MANIFEST_DIR` แทน relative path เพื่อให้ CWD ไม่มีผล
fn bindings_path() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("src")
        .join("bindings.ts")
}

/// เขียน `src/bindings.ts` จาก builder — เรียกใน `build()` (debug build เท่านั้น,
/// NFR-013 กัน payload ออกจาก release) และจากเทสต์ที่ CI เรียกเพื่อจับ drift
///
/// หมายเหตุ: ยังไม่ใส่ header พิเศษ — bindings ที่ generate มา pass strict
/// typecheck ของ frontend อยู่แล้ว (ตรวจแล้วตอน T-008) ถ้าจะเปิดใช้ `@ts-nocheck`
/// ไว้ที่นี่ตัวเดียวเท่านั้น
pub fn export_bindings(builder: &tauri_specta::Builder<tauri::Wry>) {
    builder
        .export(specta_typescript::Typescript::default(), bindings_path())
        .expect("failed to export TypeScript bindings");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// NFR-015 — เขียน bindings ขึ้นมาใหม่ทุกครั้ง แล้ว CI ตรวจว่าไม่มี diff
    /// (`.github/workflows/ci.yml`) — ถ้า signature/DTO ตัวใดเปลี่ยนแล้วลืม
    /// regenerate ตรงนี้จะจับได้
    #[test]
    #[ignore]
    fn regenerate_bindings() {
        export_bindings(&specta_builder());
    }
}
