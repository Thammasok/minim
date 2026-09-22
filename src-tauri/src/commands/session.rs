//! command เกี่ยวกับ session: recents กับ preferences (design.md §commands::session)
//!
//! ทั้งคู่อยู่ใน `tauri-plugin-store` ที่ app config directory (`session.json`) —
//! นอก collection file เสมอ (FR-017 / FR-041) จึงไม่มี field ส่วนตัวของ minim
//! หลุดเข้า collection tree
//!
//! ตรรกะ MRU (`push_recent`, `remove_recent`, cap 20) เป็น pure function — เทสต์
//! ตรงๆ ที่ TC-U-043..045 โดยไม่ต้องเปิด app: plugin `Store` ต้องใช้ `AppHandle`
//! กับ plugin state จึงเทสต์แบบ unit ไม่ได้ (ตามแผน T-010 "PREFER the
//! pure-function split"); serialization ของ entry/prefs ที่ plugin เขียนลงดิสก์
//! ถูกเทสต์ผ่านรูป `JsonValue` เดียวกันกับที่ `Store` เก็บ (TC-U-046)
//!
//! I/O ของ plugin จึงเหลือแค่บางๆ (`SessionStore`): ทุกผลลัพธ์ map เป็น
//! [`AppError::StoreUnavailable`] ไม่ panic ไม่เงียบ (ADR-013) — เปิด collection
//! ถ้าอยากได้ต้องไม่ล้มแม้ store เสีย แต่ permission ที่ล้มเหลวต้องถูก surface ขึ้นมา

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::{AppError, StoreOperation};
use crate::view::{Preferences, RecentEntry, Theme};

/// ชื่อไฟล์ store ใน app config directory (design.md §Persistence)
const STORE_FILE: &str = "session.json";
/// ชื่อ key ของ recents ใน store
const KEY_RECENTS: &str = "recents";
/// ชื่อ key ของ preferences ใน store
const KEY_PREFS: &str = "prefs";
/// จำนวนสูงสุดของ recents (FR-041 / TC-U-044)
pub const RECENTS_CAP: usize = 20;

/// ค่า preference เมื่อยังไม่เคยเซฟ — `system` ตาม OS ไม่ใช่ light (FR-043,
/// ตาม note ใน dev-plan.md §T-010)
pub fn default_preferences() -> Preferences {
    Preferences {
        theme: Theme::System,
    }
}

/// MRU push เข้าหน้า list — ลบรายการที่ path ซ้ำออกก่อน (ไม่มี duplicate, TC-U-043),
/// แทรก entry ใหม่ที่ index 0 แล้วตัดทิ้งที่เกิน cap (TC-U-044)
pub fn push_recent(list: &[RecentEntry], entry: RecentEntry) -> Vec<RecentEntry> {
    let mut out: Vec<RecentEntry> = list
        .iter()
        .filter(|existing| existing.path != entry.path)
        .cloned()
        .collect();
    out.insert(0, entry);
    out.truncate(RECENTS_CAP);
    out
}

/// ลบ recent ตาม path — ลบได้ครั้งละรายการเดียว (invariant: path ไม่ซ้ำ), path
/// ที่ไม่อยู่ใน list เป็น no-op (TC-CMD-032)
pub fn remove_recent(list: &[RecentEntry], path: &str) -> Vec<RecentEntry> {
    list.iter()
        .filter(|entry| entry.path != path)
        .cloned()
        .collect()
}

/// `opened_at` ของ entry — unix seconds; `u32` ใช้ได้ถึงปี 2106 (specta ห้าม i64)
fn now_secs() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as u32)
        .unwrap_or(0)
}

/// ความล้มเหลวของ store ทุกชนิด → [`AppError::StoreUnavailable`] — ข้างนอกสุด
/// (command) จะกลายเป็น wire error ที่ frontend แยกได้ ไม่ panic ไม่ฝังกลบ
fn to_store_error(operation: StoreOperation, reason: impl std::fmt::Display) -> AppError {
    AppError::StoreUnavailable {
        operation,
        reason: reason.to_string(),
    }
}

/// ที่อยู่ของ `session.json` ใน app config directory (design.md §Persistence)
///
/// เป็น absolute path — plugin `resolve_store_path` เทียบ `BaseDirectory::AppData`
/// ตาม default แต่ `PathBuf::push` แทนที่ base ทั้งก้อนเมื่อ path absolute ได้
/// จึงได้ app config directory จริงตาม design ไม่ใช่ AppData
fn store_file_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(STORE_FILE))
        .map_err(|err| to_store_error(StoreOperation::Read, err))
}

/// อะแดปเตอร์บางๆ เหนือ tauri-plugin-store — เปิดครั้งเดียวต่อ command, อ่าน/เขียน
/// ทีละ key, save ทันที; ไม่มี cache กางไว้ข้าม command (plan T-010: "don't cache
/// the whole store in a Mutex you re-render")
struct SessionStore<R: Runtime> {
    store: Arc<tauri_plugin_store::Store<R>>,
}

impl<R: Runtime> SessionStore<R> {
    fn open(app: &AppHandle<R>) -> Result<Self, AppError> {
        let store = tauri_plugin_store::StoreBuilder::new(app, store_file_path(app)?)
            .build()
            .map_err(|err| to_store_error(StoreOperation::Read, err))?;
        Ok(Self { store })
    }

    /// อ่าน key recents — ยังไม่เคยมี key (first run) = รายการว่าง
    fn recents(&self) -> Result<Vec<RecentEntry>, AppError> {
        match self.store.get(KEY_RECENTS) {
            None => Ok(Vec::new()),
            Some(value) => decode(value),
        }
    }

    fn set_recents(&self, recents: &[RecentEntry]) -> Result<(), AppError> {
        let value = encode(&recents, StoreOperation::Write)?;
        self.store.set(KEY_RECENTS, value);
        self.save()
    }

    /// อ่าน key prefs — ยังไม่เคยตั้ง (first run / store ว่าง) = default theme
    fn preferences(&self) -> Result<Preferences, AppError> {
        match self.store.get(KEY_PREFS) {
            None => Ok(default_preferences()),
            Some(value) => decode(value),
        }
    }

    fn set_preferences(&self, prefs: &Preferences) -> Result<(), AppError> {
        let value = encode(prefs, StoreOperation::Write)?;
        self.store.set(KEY_PREFS, value);
        self.save()
    }

    /// flush ลงดิสก์ทันที — plugin มี auto-save แบบ debounce ไว้เป็นกันชน แต่ที่นี่
    /// ต้องการรับประกันว่าผลลัพธ์อยู่รอดแน่นอนแม้ app ตายทันทีหลัง command
    fn save(&self) -> Result<(), AppError> {
        self.store
            .save()
            .map_err(|err| to_store_error(StoreOperation::Write, err))
    }
}

/// `serde_json::Value` (รูปที่ plugin เก็บลง cache/file) → type ที่เราต้องการ
fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, AppError> {
    serde_json::from_value(value).map_err(|err| to_store_error(StoreOperation::Read, err))
}

fn encode<T: serde::Serialize>(value: &T, operation: StoreOperation) -> Result<Value, AppError> {
    serde_json::to_value(value).map_err(|err| to_store_error(operation, err))
}

/// รายการ recents เรียง MRU (ใหม่สุดก่อน) ตั้งแต่ 10 ขึ้นไป (FR-041 / TC-CMD-031),
/// cap ที่ 20 (TC-U-044)
///
/// store อ่านไม่ได้ → [`AppError::StoreUnavailable`] (ADR-013: ไม่ panic ไม่เงียบ)
/// — frontend ตัดสินใจเองว่าจะแสดง list ว่าง + คำเตือน (acceptance ของ T-010),
/// ส่วน open_collection เองต้องยังเปิดสำเร็จเสมอแม้ store เสีย (TC-CMD-034)
#[tauri::command]
#[specta::specta]
pub fn list_recents(app: AppHandle) -> Result<Vec<RecentEntry>, AppError> {
    SessionStore::open(&app)?.recents()
}

/// ลบ recent หนึ่งรายการตาม path — repair path เมื่อไฟล์หาย (FR-042); path ที่
/// ไม่อยู่ใน list เป็น no-op ไม่ error (TC-CMD-032)
#[tauri::command]
#[specta::specta]
pub fn forget_recent(app: AppHandle, path: String) -> Result<(), AppError> {
    let store = SessionStore::open(&app)?;
    let recents = remove_recent(&store.recents()?, &path);
    store.set_recents(&recents)
}

/// theme ปัจจุบัน — ยังไม่เคยตั้ง = `system` (FR-043, default ไม่ใช่ light)
#[tauri::command]
#[specta::specta]
pub fn get_preferences(app: AppHandle) -> Result<Preferences, AppError> {
    SessionStore::open(&app)?.preferences()
}

/// ตั้ง theme — persist ข้าม restart (FR-043 / TC-U-046)
#[tauri::command]
#[specta::specta]
pub fn set_preferences(app: AppHandle, prefs: Preferences) -> Result<(), AppError> {
    let store = SessionStore::open(&app)?;
    store.set_preferences(&prefs)
}

/// **T-009 seam** — เรียกจาก `open_collection` หลังเปิดสำเร็จเท่านั้น (TC-CMD-015:
/// ไฟล์ที่เปิดไม่ได้ต้องไม่เข้า recents) เพื่อ push MRU ไปหน้า list
///
/// ความล้มเหลวของ store เป็น non-fatal (ADR-013 / TC-CMD-034): caller ต้องยัง
/// `return Ok(collection)` แม้บันทึก recent ไม่ได้ — error ที่คืนมาคือสัญญาณ
/// "persistence เสีย" ฝั่งเดียว ห้ามทำให้ open ล้มเหลว และห้าม store ลงใน
/// collection file (FR-017; entry ไปอยู่ `session.json` ใน app config dir เท่านั้น)
///
/// ผู้บริโภคคือ `open_collection` (commands/collection.rs) — เรียกหลังเปิดสำเร็จเท่านั้น
pub fn record_opened(
    app: &AppHandle,
    path: &str,
    name: &str,
    request_count: u32,
) -> Result<(), AppError> {
    let store = SessionStore::open(app)?;
    let recents = push_recent(
        &store.recents()?,
        RecentEntry {
            path: path.to_owned(),
            name: name.to_owned(),
            opened_at: now_secs(),
            request_count,
        },
    );
    store.set_recents(&recents)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// สร้าง recent แบบกำหนดเอง — `opened_at`/`request_count` ไม่สำคัญต่อตรรกะ MRU
    fn entry(path: &str) -> RecentEntry {
        RecentEntry {
            path: path.to_owned(),
            name: "collection".to_owned(),
            opened_at: 0,
            request_count: 0,
        }
    }

    /// TC-U-043 — opening a collection already in recents moves it to front, no duplicate
    #[test]
    fn tc_u_043_reopening_moves_to_front_without_duplicate() {
        let a = entry("/path/A.json");
        let b = entry("/path/B.json");
        let list = vec![b.clone(), a.clone()]; // MRU: [B, A]

        let out = push_recent(&list, a.clone());

        assert_eq!(out.len(), 2, "reopening must not duplicate the entry");
        assert_eq!(out, vec![a, b], "A moves to front, B follows, no duplicate");
    }

    /// TC-U-044 — recents capped at 20: a 21st open keeps len 20, oldest gone, new first
    #[test]
    fn tc_u_044_recents_capped_at_20() {
        let twenty: Vec<RecentEntry> = (0..RECENTS_CAP)
            .map(|i| entry(&format!("/path/c{i}.json")))
            .collect();
        let newest = entry("/path/new.json");

        let out = push_recent(&twenty, newest.clone());

        assert_eq!(out.len(), RECENTS_CAP, "the list never exceeds the cap");
        assert_eq!(out[0], newest, "the just-opened collection is first");
        assert!(
            !out.iter().any(|e| e.path == "/path/c19.json"),
            "the oldest entry is evicted"
        );
        assert!(
            out.iter().any(|e| e.path == "/path/c0.json"),
            "the rest of the list survives"
        );
    }

    /// TC-U-045 — forget_recent removes only the named entry
    #[test]
    fn tc_u_045_forget_removes_only_the_named_entry() {
        let list = vec![
            entry("/path/A.json"),
            entry("/path/B.json"),
            entry("/path/C.json"),
        ];

        let out = remove_recent(&list, "/path/B.json");

        assert_eq!(out.len(), 2, "exactly one entry is removed");
        assert_eq!(
            out.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
            vec!["/path/A.json", "/path/C.json"],
            "A and C survive, in MRU order"
        );
    }

    /// TC-U-045 (companion) — forgetting a path that is not in the list is a no-op
    /// (TC-CMD-032: idempotent removal, the UI may call it on a stale row)
    #[test]
    fn tc_u_045_forgetting_an_unknown_path_is_a_noop() {
        let list = vec![entry("/path/A.json"), entry("/path/B.json")];

        let out = remove_recent(&list, "/not/in/list.json");

        assert_eq!(out, list);
    }

    /// TC-U-046 — theme preference round-trips through the persisted store value
    ///
    /// `set_preferences` เก็บ `{"theme": "dark"}` ใต้ key `prefs` (ผ่าน
    /// `serde_json::to_value`); `get_preferences` อ่านกลับด้วย `from_value` —
    /// เทสต์นี้วนผ่านรูป `JsonValue` ตัวเดียวกับที่ plugin เขียนลงดิสก์
    #[test]
    fn tc_u_046_theme_preference_round_trips() {
        let prefs = Preferences { theme: Theme::Dark };

        // รูปที่ `SessionStore::set_preferences` ใส่เข้า store
        let persisted = encode(&prefs, StoreOperation::Write).unwrap();
        assert_eq!(persisted, serde_json::json!({ "theme": "dark" }));

        // รูปที่ `SessionStore::preferences` อ่านกลับ
        let decoded: Preferences = decode(persisted).unwrap();
        assert_eq!(decoded, prefs, "dark survives the store round-trip");
        assert_eq!(decoded.theme, Theme::Dark);
    }

    /// FR-043 (companion) — default theme is system, not light (dev-plan.md §T-010 notes)
    #[test]
    fn tc_u_046_default_preferences_is_system_not_light() {
        assert_eq!(
            default_preferences(),
            Preferences {
                theme: Theme::System
            }
        );
    }

    /// FR-041 (companion) — recents ≥ 10 survive the persisted-value round-trip
    ///
    /// 12 entries วนผ่านรูปที่ `set_recents` เก็บ / `list_recents` อ่าน — ยังครบ
    /// 12, เรียง MRU (acceptance "Recents persist across restart, holding ≥ 10")
    #[test]
    fn tc_u_041_recents_round_trip_holds_12_entries() {
        let recents: Vec<RecentEntry> = (0..12)
            .map(|i| entry(&format!("/path/open-{i}.json")))
            .collect();

        let persisted = encode(&recents, StoreOperation::Write).unwrap();
        let decoded: Vec<RecentEntry> = decode(persisted).unwrap();

        assert_eq!(decoded.len(), 12);
        assert_eq!(decoded, recents, "order and content survive the round-trip");
    }

    /// FR-017 / TC-CMD-035 (unit companion) — a recents entry persists exactly the
    /// four designed fields; nothing app-private rides along. The collection file
    /// is never written by session commands (I/O goes to session.json only).
    #[test]
    fn tc_u_017_recents_entry_serializes_to_designed_fields_only() {
        let value = encode(&entry("/path/A.json"), StoreOperation::Write).unwrap();
        let object = value
            .as_object()
            .expect("a recents entry must serialize to an object");

        assert_eq!(object.len(), 4, "exactly the designed field set");
        for field in ["path", "name", "openedAt", "requestCount"] {
            assert!(object.contains_key(field), "missing designed field {field}");
        }
        // เก็บเป็นคีย์ที่ออกแบบเท่านั้น — คีย์นอกเหนือนี้คือ app-private field leak
        assert_eq!(
            force_sort_keys(object.keys()),
            vec![
                "name".to_owned(),
                "openedAt".to_owned(),
                "path".to_owned(),
                "requestCount".to_owned()
            ]
        );
    }

    fn force_sort_keys<'a>(keys: impl Iterator<Item = &'a String>) -> Vec<String> {
        let mut sorted: Vec<String> = keys.cloned().collect();
        sorted.sort();
        sorted
    }
}
