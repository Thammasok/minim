//! view DTOs — รูปร่างข้อมูลที่ข้าม IPC ไปให้ frontend (design.md §View DTOs)
//!
//! ความต่างจาก wire model (T-004): พลอยมอร์ฟิกทุกรูปถูก normalize ให้เป็นรูปเดียว
//! ผ่าน normalizer ของ T-006 (`url_to_string` / `headers` / `script_source` /
//! `description`) — **ห้าม** DTO ตัวใดถือ field แบบ union ไว้ (acceptance ของ T-008)
//! เพราะจะพา polymorphic run ไปถึง React
//!
//! ทุกตัว `derive(Serialize, specta::Type)` เพื่อให้ฝั่ง Rust serialize ได้จริง และ
//! tauri-specta (T-008) export `src/bindings.ts` จากตัวนี้ — ถ้า DTO เปลี่ยน
//! bindings จะเปลี่ยนตาม แล้ว CI จะจับ drift (NFR-015)
//!
//! หมายเหตุ: `LoadWarningView` เป็นของคู่กับ `normalize::LoadWarning` แต่แยกตัวกัน
//! ตั้งใจ — `normalize::LoadWarning` ที่ T-007 สร้างไว้ถูกทดสอบแบบตรงๆ แล้ว (tests
//! ของ T-007 ประกอบค่าตั้งเอง) แต่ยังพกได้แค่ `MalformedRawHeaderLine` กับ
//! `DuplicateVariableKey` จึงไม่ serializable ครบทั้งห้าชนิด และไม่มี field
//! `node_id`/`detail` ตาม design.md

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::index::{AuthSource, Node, NodeId, NodeIndex, NodeKind};
use crate::normalize::{self, LoadWarning};
use crate::postman::model::{
    Auth, AuthAttribute, BodyMode, Cookie, Event, FormParameter, Header, Item, ItemRequest,
    PostmanCollection, QueryParam, RequestBody, Response, Url, Variable,
};
use crate::postman::polymorphic::{PathSegment, StringOr};

/// ภาพรวม collection — payload ของ `open_collection`/`reload_collection` หนึ่งครั้ง
///
/// ส่ง summary ทั้งหมดก่อน ([ADR-005](design.md#key-decisions)) แล้วให้ UI โหลด
/// detail ของ node ที่เลือกเข้ามาทีละตัวผ่าน `get_node_detail`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CollectionOverview {
    pub name: String,
    pub description: String,
    /// ค่าจาก `info.schema` ตามที่หน้า S4 แสดง
    pub schema: String,
    /// `info.version` ในรูป display string — object form ประกอบเป็น "major.minor.patch"
    /// เดิม `identifier` ต่อท้ายเป็น "-<identifier>" (TC-UNIT-048)
    pub version: Option<String>,
    pub source_path: String,
    /// ขนาดไฟล์เป็นไบต์ — `u32` เพราะ specta ห้าม bigint ออก wire (JS number
    /// เก็บได้แม่นสุด 2^53) ใช้เกิน 4 GiB คือเกินจริงสำหรับ collection จริง
    pub file_size_bytes: u32,
    pub request_count: u32,
    pub folder_count: u32,
    pub variables: Vec<VariableView>,
    pub auth: Option<AuthView>,
    pub events: Vec<ScriptView>,
    /// ต้นไม้ลำดับเอกสาร — ไม่รวม node รากของ collection (S4 ใช้ `collection_overview`
    /// เองเป็น data source, TC-CMD-019)
    pub tree: Vec<TreeNode>,
    pub warnings: Vec<LoadWarningView>,
}

/// node หนึ่งเส้นใน tree (เรียง document order, ซ้อนตาม folder)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub id: String,
    pub name: String,
    pub kind: NodeKindView,
    /// เส้น folder ราก → current folder ไม่รวมตัวเอง (FR-015)
    pub folder_path: Vec<String>,
    /// requests เท่านั้น; folders เป็น `None`
    pub method: Option<String>,
    /// requests เท่านั้น; หน้า S2 เอาไปเป็น url pill
    pub url_preview: Option<String>,
    pub children: Vec<TreeNode>,
    pub example_count: u32,
    pub has_scripts: bool,
}

/// kind ของ node ใน tree — ใช้เป็น serde tag ให้ TS switch ได้หมด (ตัว compile error
/// ถ้ามี node ชนิดใหม่โผล่)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum NodeKindView {
    Folder,
    Request,
}

/// detail ของ node ตัวเดียว — หน้าจอ S2 (request) / S3 (folder)
///
/// internally-tagged ตัวเป็น `kind` เพื่อให้ frontend switch ได้ exhaustive
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
/// DTO สำหรับหน้าจอ detail (S4) — ตัวคืนค่าจาก `get_node_detail` ผ่าน wire
/// (TC-CMD-019): Request เป็น Box เพื่อให้ enum มีขนาดสม่ำเสมอ
#[allow(clippy::large_enum_variant)]
pub enum NodeDetail {
    Folder(FolderDetail),
    Request(Box<RequestDetail>),
}

/// detail ของ folder node — หน้าจอ S3: script / auth / variable ของ folder เอง
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderDetail {
    pub id: String,
    pub name: String,
    pub folder_path: Vec<String>,
    pub description: String,
    pub auth: AuthView,
    pub events: Vec<ScriptView>,
    pub variable: Vec<VariableView>,
    /// ลูกตรงๆ กี่ตัว (ตาม arena)
    pub child_count: u32,
    /// ลูกหลานที่เป็น request ทั้งหมดกี่ตัว — ตัวเลขบนป้ายของ S3
    pub descendant_request_count: u32,
}

/// detail ของ request leaf — หน้าจอ S2 ครบทุก tab
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RequestDetail {
    pub id: String,
    pub name: String,
    pub folder_path: Vec<String>,
    pub description: String,
    pub method: String,
    pub url: UrlView,
    pub headers: Vec<HeaderView>,
    pub body: Option<BodyView>,
    pub auth: AuthView,
    pub events: Vec<ScriptView>,
    pub behavior: Vec<KeyValue>,
    pub examples: Vec<ExampleSummary>,
    pub variable_refs: Vec<VarRef>,
    pub extra: Vec<KeyValue>,
}

/// url หลัง normalize — `raw` คือ display string ที่ใช้ได้เลย (FR-010) ส่วน
/// protocol/host/port/path เป็นของแยกให้ UI render ได้ถ้าอยากได้
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UrlView {
    pub raw: String,
    pub protocol: Option<String>,
    pub host: Option<String>,
    pub port: Option<String>,
    pub path: Option<String>,
    pub query: Vec<ParamView>,
    pub path_variables: Vec<ParamView>,
}

/// query / path variable / urlencoded parameter — ถ้วนหน้าใช้ตัวเดียว
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ParamView {
    /// key ที่หายไปเป็น `""` ไม่ panic
    pub key: String,
    pub value: Option<String>,
    pub disabled: Option<bool>,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HeaderView {
    pub key: String,
    pub value: String,
    pub disabled: Option<bool>,
    pub description: String,
}

/// body แบบ tagged union ครบทั้งห้า mode (FR-026) — mode ที่ไม่ได้ handle = compile
/// error ที่ frontend ไม่ใช่พาเนลว่างดำ
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum BodyView {
    Raw {
        /// จาก `options.raw.language`; ไม่ได้ประกาศเป็น `"text"` (FR-027)
        language: String,
        text: String,
    },
    Urlencoded {
        params: Vec<ParamView>,
    },
    Formdata {
        fields: Vec<FormFieldView>,
    },
    File {
        src: String,
    },
    Graphql {
        query: String,
        variables: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FormFieldView {
    pub key: String,
    pub kind: FormFieldKind,
    /// text field เท่านั้น
    pub value: Option<String>,
    /// file field เท่านั้น — src แบบ array (ท้ายสุดของ `type: "file"`) join ด้วย ", "
    pub src: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FormFieldKind {
    Text,
    File,
}

/// effective auth ที่จะแสดง (FR-030) — พร้อมแหล่งที่มาสำหรับป้าย "inherited from"
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AuthView {
    pub source: AuthSourceView,
    /// ผ่านมาอย่าง verbatim แม้เป็นชนิดที่ minim ไม่รู้จัก (FR-031)
    pub auth_type: String,
    pub attributes: Vec<AuthAttrView>,
}

/// ระดับที่ auth ที่แสดงได้มาจาก — ตัว `source` ของ auth ที่แสดงผล (FR-030)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AuthSourceView {
    /// auth ของ node ตัวเอง
    Own,
    /// สืบทอดจาก folder — พกชื่อ folder ตัวประกาศไว้ให้ label
    Folder { name: String },
    /// สืบทอดจาก collection
    Collection,
    /// ไม่มี auth ตรงไหนเลย (null/absent ตลอดสาย)
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AuthAttrView {
    pub key: String,
    pub value: Option<String>,
    /// จริงเมื่อ key เข้าข่าย credential (FR-032) — หน้า S2 ใช้ซ่อน/reveal
    pub sensitive: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScriptView {
    /// `"prerequest"` | `"test"` | อะไรก็ตามที่ schema อนุญาต — ผ่านตามเดิม
    pub listen: String,
    pub source: String,
    pub disabled: Option<bool>,
}

/// คู่ key/value แบบ display — ใช้กับ `behavior` และ `extra`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    pub key: String,
    pub value: String,
}

/// สรุป example หนึ่งตัวที่ติดไปกับ request — ตัว body มาแยกตอน `get_example`
/// (ADR-005 / FR-037)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExampleSummary {
    /// ตำแหน่งใน array `response` (document order) — key ของ `get_example`
    pub index: u32,
    pub name: String,
    pub status: Option<String>,
    pub code: Option<u32>,
}

/// ตัวแปรที่ request เอ่ยถึงใน `{{name}}` พร้อมบอกว่ามีนิยามไว้ใน collection หรือไม่
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VarRef {
    pub name: String,
    pub defined: bool,
}

/// saved response ทั้งตัว (S5) — payload ของ `get_example`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExampleDetail {
    pub name: String,
    pub status: Option<String>,
    pub code: Option<u32>,
    pub headers: Vec<HeaderView>,
    pub cookies: Vec<CookieView>,
    pub body: Option<String>,
    /// `_postman_previewlanguage` — ใช้เลือก syntax highlight
    pub preview_language: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CookieView {
    pub name: Option<String>,
    pub value: Option<String>,
    pub domain: String,
    pub path: String,
}

/// ตัวแปรระดับ collection (และ folder/node) — `type` เป็นชื่อฟิลด์ wire จริง
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VariableView {
    pub key: String,
    pub value: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub disabled: Option<bool>,
    pub description: String,
}

/// หนึ่งรายการใน recents (design.md §Persistence) — พฤติกรรม MRU/cap เป็นงาน T-010
///
/// `Deserialize` จำเป็นหลัง T-010 เพราะ recents ถูกอ่านกลับจาก store file
/// (`commands/session.rs`); รูปไฟล์เป็น camelCase เดียวกับ wire shape
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    /// unix seconds ของเวลาที่เปิดล่าสุด — `u32` ใช้ได้ถึงปี 2106 (specta ห้าม i64)
    pub opened_at: u32,
    pub request_count: u32,
}

/// preference ของผู้ใช้ที่เก็บใน `store.json` — ต้อง `Deserialize` เพราะเป็น
/// argument ของ `set_preferences` (T-009)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub theme: Theme,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

/// คำเตือนระหว่างโหลด — รูป serializable ที่ข้าม IPC ได้ (FR-009 / design.md §LoadWarning)
///
/// `normalize::LoadWarning` (T-007) มีแค่สอง variant และไม่พกเส้น node; ทุก variant
/// ที่ design กำหนดมีอยู่ที่นี่ และ mapping จะเติม `node_id` ให้เมื่อรู้
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum LoadWarningView {
    /// `auth.type` ที่ไม่ใช่ 11 ชนิดที่ schema กำหนด (FR-031 fallback)
    UnknownAuthType {
        node_id: Option<String>,
        detail: String,
    },
    /// `body.mode` ที่ไม่ใช่ห้า mode ที่รู้จัก
    UnknownBodyMode {
        node_id: Option<String>,
        detail: String,
    },
    /// raw header block มีบรรทัดที่ไม่มี `:` (ข้ามบรรทัดนั้นไปแล้ว)
    MalformedRawHeaderLine {
        node_id: Option<String>,
        detail: String,
    },
    /// item ที่ไม่มีทั้ง `item` และ `request`
    ItemNeitherGroupNorRequest {
        node_id: Option<String>,
        detail: String,
    },
    /// collection variable ประกาศ key ซ้ำ (ตัวแรกชนะ)
    DuplicateVariableKey {
        node_id: Option<String>,
        detail: String,
    },
}

/// 11 auth type ที่ schema v2.1 กำหนด (test-design §SUT) — `"noauth"` นับเป็นชนิดจริง
/// ไม่ใช่คำสั่งปิด silent
const KNOWN_AUTH_TYPES: [&str; 11] = [
    "apikey", "awsv4", "basic", "bearer", "digest", "edgegrid", "hawk", "ntlm", "oauth1", "oauth2",
    "noauth",
];

/// marker ของ credential key สำหรับ FR-032 — เทียบแบบไม่สนตัวพิมพ์-ใหญ่เล็ก กับ
/// substring ชื่อ key ทั้งสิบตัวตาม test-design (ส่วนท้ายซ้ำกับ token/secret/key
/// แต่เก็บไว้ตรงตามตาราง)
const SENSITIVE_KEY_MARKERS: [&str; 10] = [
    "password",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "clientsecret",
    "apikey",
    "key",
    "privatekey",
    "passphrase",
];

/// `auth.type` อยู่ในชุดที่รู้จักหรือไม่ — ถ้าไม่อยู่ ต้องเตือน แล้วแสดง attribute
/// ดิบแทน (FR-009 / FR-031)
pub fn is_known_auth_type(auth_type: &str) -> bool {
    KNOWN_AUTH_TYPES.contains(&auth_type)
}

/// key นี้เข้าข่าย credential ตาม FR-032 หรือไม่? — substring match, case-insensitive
pub fn is_sensitive_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    SENSITIVE_KEY_MARKERS
        .iter()
        .any(|marker| lower.contains(marker))
}

/// สร้าง `CollectionOverview` จาก collection ที่ index แล้ว — เรียกครั้งเดียวตอน
/// `open_collection`/`reload_collection` (T-009)
pub fn build_overview(
    collection: &PostmanCollection,
    idx: &NodeIndex,
    load_warnings: Vec<LoadWarning>,
    source_path: String,
    file_size_bytes: u32,
) -> CollectionOverview {
    // base warnings จากขั้น normalize/index ก่อน แล้วเก็บ unknown-auth ที่เจอตอน
    // เดิน tree ต่อท้ายด้วย (document order) — ผลรวมคือรายการที่ deterministic
    let mut warnings: Vec<LoadWarningView> = load_warnings
        .into_iter()
        .map(load_warning_to_view)
        .collect();

    let collection_auth = collection.auth.as_ref();
    let mut tree = Vec::new();
    let mut auth_warnings = Vec::new();
    if let Some(root) = idx.by_id(&NodeId::root()) {
        for child in &root.children {
            if let Some(node) = idx.by_id(child) {
                tree.push(tree_node(idx, node, &mut auth_warnings));
            }
        }
    }

    let auth =
        collection_auth.map(|a| auth_view_from(a, AuthSourceView::Own, None, &mut auth_warnings));
    warnings.extend(auth_warnings);

    CollectionOverview {
        name: collection.info.name.clone(),
        description: normalize::description(&collection.info.description),
        schema: collection.info.schema.clone(),
        version: version_string(&collection.info.version),
        source_path,
        file_size_bytes,
        request_count: idx.request_count as u32,
        folder_count: idx.folder_count as u32,
        variables: variable_views(&collection.variable),
        auth,
        events: script_views(&collection.event),
        tree,
        warnings,
    }
}

/// detail ของ node ตัวเดียว — โหลดแบบ O(1) จาก arena (ADR-005)
///
/// คืน `None` สำหรับ node ราก (collection) — ข้อมูล S4 อยู่ใน `CollectionOverview`
/// ไม่มี `NodeDetail` ชนิด Collection (TC-CMD-019)
pub fn node_detail(
    idx: &NodeIndex,
    collection_auth: Option<&Auth>,
    node_id: &NodeId,
) -> Option<NodeDetail> {
    let node = idx.by_id(node_id)?;
    match node.kind {
        NodeKind::Collection => None,
        NodeKind::Folder => Some(NodeDetail::Folder(folder_detail(
            idx,
            collection_auth,
            node,
        ))),
        NodeKind::Request => Some(NodeDetail::Request(Box::new(request_detail(
            idx,
            collection_auth,
            node,
        )))),
    }
}

/// detail ของ saved response (S5) — payload ของ `get_example`
pub fn example_detail(response: &Response) -> ExampleDetail {
    // header ของ example เป็น polymorphic เหมือน request header — ผ่าน normalizer เดียวกัน
    let (headers, _) = normalize::headers(&response.header);
    ExampleDetail {
        name: response.name.clone().unwrap_or_default(),
        status: response.status.clone(),
        code: response.code.map(|c| c as u32),
        headers: headers.iter().map(header_view).collect(),
        cookies: response.cookie.iter().flatten().map(cookie_view).collect(),
        body: response.body.clone(),
        preview_language: response._postman_previewlanguage.clone(),
    }
}

/// body → `BodyView` — mode เป็น enum ครบห้าแบบแล้ว (T-004) จึงไม่มีกรณี unknown
/// ที่นี่ ถ้า object body อยู่แต่ไม่มี mode กลับ `None` (ไม่มีอะไรจะแสดง)
pub fn body_to_view(body: &RequestBody) -> Option<BodyView> {
    match body.mode? {
        BodyMode::Raw => Some(BodyView::Raw {
            language: body
                .options
                .as_ref()
                .and_then(|o| o.raw.as_ref())
                .and_then(|r| r.language.clone())
                .filter(|l| !l.is_empty())
                .unwrap_or_else(|| "text".to_string()),
            text: body.raw.clone().unwrap_or_default(),
        }),
        BodyMode::UrlEncoded => Some(BodyView::Urlencoded {
            params: body
                .urlencoded
                .iter()
                .flatten()
                .map(url_encoded_param_view)
                .collect(),
        }),
        BodyMode::FormData => Some(BodyView::Formdata {
            fields: body
                .formdata
                .iter()
                .flatten()
                .map(form_field_view)
                .collect(),
        }),
        BodyMode::File => Some(BodyView::File {
            src: body
                .file
                .as_ref()
                .and_then(|f| f.src.clone())
                .unwrap_or_default(),
        }),
        BodyMode::GraphQl => Some(BodyView::Graphql {
            query: body
                .graphql
                .as_ref()
                .and_then(|g| g.query.clone())
                .unwrap_or_default(),
            variables: body
                .graphql
                .as_ref()
                .and_then(|g| g.variables.clone())
                .unwrap_or_default(),
        }),
    }
}

/// ตัว conversion ที่ใช้ซ้ำระหว่าง `request_detail` และจุดอื่น — request ที่เป็น
/// string URL เต็มๆ ได้ (ไม่มี object request)
fn request_parts(item: &ItemRequest) -> RequestParts<'_> {
    let mut parts = match &item.request {
        StringOr::Str(_) => RequestParts {
            method: "GET".to_string(),
            url: &NO_URL,
            headers: Vec::new(),
            body: None,
            behavior: Vec::new(),
            description: String::new(),
            events: Vec::new(),
            examples: Vec::new(),
            extra: Vec::new(),
        },
        StringOr::Structured(req) => RequestParts {
            method: req.method.clone().unwrap_or_else(|| "GET".to_string()),
            url: &req.url,
            headers: normalize::headers(&req.header).0,
            body: req.body.as_ref(),
            // `protocolProfileBehavior` ไม่ใช่ field ใน model (flatten เข้า `extra`)
            // — ดึงออกมาแปลงตามรุปจริง (ดูตรรกะใน test-design S2/S2.x)
            behavior: protocol_profile_behavior_views(&req.extra),
            description: normalize::description(&item.description),
            events: Vec::new(),
            examples: Vec::new(),
            // request object ที่ flatten — ตัด `protocolProfileBehavior` ออกแล้ว
            // (อยู่ที่ behavior แล้ว) ส่วน field unknown ตัวอื่นรอดมา (FR-009)
            extra: req
                .extra
                .iter()
                .filter(|(key, _)| key.as_str() != "protocolProfileBehavior")
                .map(|(key, value)| KeyValue {
                    key: key.clone(),
                    value: value_to_string(value),
                })
                .collect(),
        },
    };
    // events/examples/extra ของ item มีได้ทั้งสองรูป request (string URL ก็มี)
    parts.events = script_views(&item.event);
    parts.examples = example_summaries(&item.response);
    parts.extra.extend(extra_views(&item.extra));
    parts
}

/// `protocolProfileBehavior` ที่ flatten อยู่ใน `extra` → รายการ `KeyValue`
/// (design กำหนดเป็นชุด flag ที่ S2 แสดงทีละตัว) — ค่านอกเหนือจากกรณี object
/// เก็บเป็นคู่เดี่ยวแทน ไม่ทิ้งของ
fn protocol_profile_behavior_views(extra: &Map<String, Value>) -> Vec<KeyValue> {
    extra
        .get("protocolProfileBehavior")
        .map(|value| match value {
            Value::Object(obj) => values_to_key_values(obj),
            other => {
                let mut map = Map::new();
                map.insert("protocolProfileBehavior".to_string(), other.clone());
                values_to_key_values(&map)
            }
        })
        .unwrap_or_default()
}

/// url เปล่าแบบ static — กัน temp borrow ตายก่อน return (`&None` ใน arm อื่น)
/// request แบบ string URL ไม่มี object url ให้ expose
const NO_URL: Option<StringOr<Url>> = None;

/// ข้อมูล request ที่แยกจากรูป wire แล้ว — เพื่อไม่ให้ match จ่ายทุกครั้งที่มี
/// mapper ใหม่
struct RequestParts<'a> {
    method: String,
    url: &'a Option<StringOr<Url>>,
    headers: Vec<Header>,
    body: Option<&'a RequestBody>,
    behavior: Vec<KeyValue>,
    description: String,
    events: Vec<ScriptView>,
    examples: Vec<ExampleSummary>,
    extra: Vec<KeyValue>,
}

fn request_detail(idx: &NodeIndex, collection_auth: Option<&Auth>, node: &Node) -> RequestDetail {
    let Some(Item::Request(item)) = &node.wire else {
        // unreachable ในทางปฏิบัติ — node detail ถูกเรียกเฉพาะ node ที่เป็น request;
        // กันไว้เผื่อ arena ถูกแก้ให้ wire หลุดไปเอง
        return RequestDetail {
            id: node.node_id.to_string(),
            name: node.name.clone(),
            folder_path: node.folder_path.clone(),
            description: String::new(),
            method: "GET".to_string(),
            url: UrlView {
                raw: String::new(),
                protocol: None,
                host: None,
                port: None,
                path: None,
                query: Vec::new(),
                path_variables: Vec::new(),
            },
            headers: Vec::new(),
            body: None,
            auth: AuthView {
                source: AuthSourceView::None,
                auth_type: String::new(),
                attributes: Vec::new(),
            },
            events: Vec::new(),
            behavior: Vec::new(),
            examples: Vec::new(),
            variable_refs: Vec::new(),
            extra: Vec::new(),
        };
    };

    let parts = request_parts(item);
    // node_detail ไม่ได้มีช่องคำเตือนเป็นของตัวเอง — คำเตือนถูกเก็บตอน build_overview
    // แล้ว; ตรงนี้แค่ต้องได้ AuthView ที่ถูกต้อง
    let mut discarded_warnings = Vec::new();
    let auth = effective_auth_view(
        node,
        idx,
        collection_auth,
        node.node_id.to_string(),
        &mut discarded_warnings,
    );

    RequestDetail {
        id: node.node_id.to_string(),
        name: node.name.clone(),
        folder_path: node.folder_path.clone(),
        description: parts.description,
        method: parts.method,
        url: url_to_view(parts.url),
        headers: parts.headers.iter().map(header_view).collect(),
        body: parts.body.and_then(body_to_view),
        auth,
        events: parts.events,
        behavior: parts.behavior,
        examples: parts.examples,
        variable_refs: var_refs(node, idx),
        extra: parts.extra,
    }
}

fn folder_detail(idx: &NodeIndex, collection_auth: Option<&Auth>, node: &Node) -> FolderDetail {
    let Some(Item::Group(group)) = &node.wire else {
        return FolderDetail {
            id: node.node_id.to_string(),
            name: node.name.clone(),
            folder_path: node.folder_path.clone(),
            description: String::new(),
            auth: AuthView {
                source: AuthSourceView::None,
                auth_type: String::new(),
                attributes: Vec::new(),
            },
            events: Vec::new(),
            variable: Vec::new(),
            child_count: node.children.len() as u32,
            descendant_request_count: descendant_request_count(idx, node) as u32,
        };
    };

    let mut discarded_warnings = Vec::new();
    FolderDetail {
        id: node.node_id.to_string(),
        name: node.name.clone(),
        folder_path: node.folder_path.clone(),
        description: normalize::description(&group.description),
        auth: effective_auth_view(
            node,
            idx,
            collection_auth,
            node.node_id.to_string(),
            &mut discarded_warnings,
        ),
        events: script_views(&group.event),
        variable: variable_views(&group.variable),
        child_count: node.children.len() as u32,
        descendant_request_count: descendant_request_count(idx, node) as u32,
    }
}

/// node → `TreeNode` เดินด้วย recursion — วนซ้ำตาม depth ของ arena ซึ่งถูกจำกัดแล้ว
///
/// recursion นี้ปลอดภัยจาก stack overflow เพราะ depth ของ arena ถูก capped ไว้ที่
/// ≤128 container โดย serde_json's recursion limit ใน `schema_gate::parse_and_gate`
/// (T-011): folder แต่ละชั้น = object + array = 2 container ดังนั้น depth ของ
/// `TreeNode` จึง ≤ ~63 เสมอ ไม่ว่าอินพุตจะดู hostile แค่ไหน (ชั้นที่เกิน 64 จึงไม่
/// ผ่าน gate เป็น `NotJson` ก่อนถึงจุดนี้)
fn tree_node(idx: &NodeIndex, node: &Node, warnings: &mut Vec<LoadWarningView>) -> TreeNode {
    // เตือน auth unknown ตรง node ที่เป็นเจ้าของ auth ตัวเอง — node ที่สืบทอดข้ามไป
    // (folder แม่/collection ที่ประกาศมัน จะเคย/จะถูกเตือนตอน node ของมันเอง)
    warn_unknown_own_auth(node, warnings);

    match node.kind {
        NodeKind::Folder => TreeNode {
            id: node.node_id.to_string(),
            name: node.name.clone(),
            kind: NodeKindView::Folder,
            folder_path: node.folder_path.clone(),
            method: None,
            url_preview: None,
            children: node
                .children
                .iter()
                .filter_map(|child| idx.by_id(child))
                .map(|child| tree_node(idx, child, warnings))
                .collect(),
            example_count: 0,
            has_scripts: folder_has_scripts(node),
        },
        NodeKind::Request => {
            let (method, url_preview, example_count, has_scripts) = request_summary(node);
            TreeNode {
                id: node.node_id.to_string(),
                name: node.name.clone(),
                kind: NodeKindView::Request,
                folder_path: node.folder_path.clone(),
                method: Some(method),
                url_preview: Some(url_preview),
                children: Vec::new(),
                example_count,
                has_scripts,
            }
        }
        NodeKind::Collection => {
            // รากถูกตัดออกจาก tree ตั้งแต่ build_overview — ไม่ควรมาถึง
            TreeNode {
                id: node.node_id.to_string(),
                name: node.name.clone(),
                kind: NodeKindView::Request,
                folder_path: Vec::new(),
                method: None,
                url_preview: None,
                children: Vec::new(),
                example_count: 0,
                has_scripts: false,
            }
        }
    }
}

/// สรุปของ request leaf สำหรับ tree — method/url ตัวอย่าง/จำนวน example/มี script
fn request_summary(node: &Node) -> (String, String, u32, bool) {
    match &node.wire {
        Some(Item::Request(item)) => {
            let (method, url_preview) = match &item.request {
                StringOr::Str(raw) => ("GET".to_string(), raw.clone()),
                StringOr::Structured(req) => (
                    req.method.clone().unwrap_or_else(|| "GET".to_string()),
                    normalize::url_to_string(&req.url),
                ),
            };
            let example_count = item.response.as_ref().map(Vec::len).unwrap_or(0) as u32;
            (method, url_preview, example_count, has_scripts(&item.event))
        }
        _ => ("GET".to_string(), String::new(), 0, false),
    }
}

/// auth ที่ node ประกาศเอง (มองผ่าน wire) — request แบบ string URL ไม่มี auth
fn node_own_auth(node: &Node) -> Option<&Auth> {
    match &node.wire {
        Some(Item::Request(item)) => match &item.request {
            StringOr::Structured(req) => req.auth.as_ref(),
            StringOr::Str(_) => None,
        },
        Some(Item::Group(group)) => group.auth.as_ref(),
        None => None,
    }
}

/// auth ที่แสดงผลจริง (effective, FR-030) — type มาจาก ResolvedAuth ของ index ส่วน
/// attributes ดึงจาก node ที่เป็นเจ้าของ (ตัวเอง → folder → collection)
fn effective_auth_view(
    node: &Node,
    idx: &NodeIndex,
    collection_auth: Option<&Auth>,
    node_id: String,
    warnings: &mut Vec<LoadWarningView>,
) -> AuthView {
    match &node.effective_auth.source {
        AuthSource::None => AuthView {
            source: AuthSourceView::None,
            auth_type: String::new(),
            attributes: Vec::new(),
        },
        AuthSource::Own => match node_own_auth(node) {
            Some(auth) => auth_view_from(auth, AuthSourceView::Own, Some(node_id), warnings),
            // ตาม index แล้ว source เป็น Own ต้องมี auth ตัวเอง — คานเฉยๆ
            None => AuthView {
                source: AuthSourceView::Own,
                auth_type: node.effective_auth.auth_type.clone().unwrap_or_default(),
                attributes: Vec::new(),
            },
        },
        AuthSource::Folder(folder_id) => {
            let name = idx
                .by_id(folder_id)
                .map(|n| n.name.clone())
                .unwrap_or_default();
            let auth_type = node.effective_auth.auth_type.clone().unwrap_or_default();
            let attributes = idx
                .by_id(folder_id)
                .and_then(node_own_auth)
                .map(|auth| auth_attributes(auth, &auth_type))
                .unwrap_or_default();
            AuthView {
                source: AuthSourceView::Folder { name },
                auth_type,
                attributes,
            }
        }
        AuthSource::Collection => {
            let auth_type = node.effective_auth.auth_type.clone().unwrap_or_default();
            let attributes = collection_auth
                .map(|auth| auth_attributes(auth, &auth_type))
                .unwrap_or_default();
            AuthView {
                source: AuthSourceView::Collection,
                auth_type,
                attributes,
            }
        }
    }
}

/// `auth` หนึ่งก้อนจาก wire → `AuthView` — source ถูกบังคับจากข้างนอก (overview
/// ใช้ Own, ประเภท unknown เตือนที่ `node_id` นั้น)
fn auth_view_from(
    auth: &Auth,
    source: AuthSourceView,
    node_id: Option<String>,
    warnings: &mut Vec<LoadWarningView>,
) -> AuthView {
    let auth_type = auth.type_.clone();
    if !is_known_auth_type(&auth_type) {
        warnings.push(LoadWarningView::UnknownAuthType {
            node_id,
            detail: auth_type.clone(),
        });
    }
    AuthView {
        source,
        attributes: auth_attributes(auth, &auth_type),
        auth_type,
    }
}

/// เตือนประเภท auth unknown ตรง node ที่ประกาศเอง (Own) — เรียกตอนเดิน tree
fn warn_unknown_own_auth(node: &Node, warnings: &mut Vec<LoadWarningView>) {
    if !matches!(node.effective_auth.source, AuthSource::Own) {
        return;
    }
    let Some(auth_type) = node.effective_auth.auth_type.as_deref() else {
        return;
    };
    if !is_known_auth_type(auth_type) {
        warnings.push(LoadWarningView::UnknownAuthType {
            node_id: Some(node.node_id.to_string()),
            detail: auth_type.to_string(),
        });
    }
}

/// attributes ตามชนิด auth — แต่ละ `auth.type` เก็บของที่ field ชื่อเดียวกับ type
/// (model ของ T-004 มี field ครบสิบเอ็ด) ชนิดที่ไม่อยู่ในชุดไม่มี field → ว่าง
fn attributes_for<'a>(auth: &'a Auth, auth_type: &str) -> &'a [AuthAttribute] {
    match auth_type {
        "apikey" => auth.apikey.as_deref().unwrap_or(&[]),
        "awsv4" => auth.awsv4.as_deref().unwrap_or(&[]),
        "basic" => auth.basic.as_deref().unwrap_or(&[]),
        "bearer" => auth.bearer.as_deref().unwrap_or(&[]),
        "digest" => auth.digest.as_deref().unwrap_or(&[]),
        "edgegrid" => auth.edgegrid.as_deref().unwrap_or(&[]),
        "hawk" => auth.hawk.as_deref().unwrap_or(&[]),
        "ntlm" => auth.ntlm.as_deref().unwrap_or(&[]),
        "oauth1" => auth.oauth1.as_deref().unwrap_or(&[]),
        "oauth2" => auth.oauth2.as_deref().unwrap_or(&[]),
        "noauth" => auth.noauth.as_deref().unwrap_or(&[]),
        // ชนิด unknown ไม่มี field ใน model — attribute ไปอยู่ `extra` แล้ว (FR-009)
        _ => &[],
    }
}

/// attributes เป็น Vec ที่เป็นเจ้าของ — ชนิด known อ่านจาก field typed ของ model
/// ส่วนชนิด unknown (FR-009) ดึงจาก `extra` ที่ flatten ไว้: array ของ object
/// ที่มี key/value กลายเป็นหลาย attribute, ค่าอื่นเก็บเป็นคู่เดี่ยว ชื่อเหมือน type
fn auth_attributes(auth: &Auth, auth_type: &str) -> Vec<AuthAttrView> {
    if is_known_auth_type(auth_type) {
        return attributes_for(auth, auth_type)
            .iter()
            .map(auth_attr_view)
            .collect();
    }
    let Some(value) = auth.extra.get(auth_type) else {
        return Vec::new();
    };
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| match item {
                Value::Object(obj) => {
                    let key = obj
                        .get("key")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    Some(AuthAttrView {
                        sensitive: is_sensitive_key(&key),
                        key,
                        value: obj.get("value").map(value_to_string),
                    })
                }
                _ => None,
            })
            .collect(),
        _ => vec![AuthAttrView {
            sensitive: is_sensitive_key(auth_type),
            key: auth_type.to_string(),
            value: Some(value_to_string(value)),
        }],
    }
}

fn auth_attr_view(attr: &AuthAttribute) -> AuthAttrView {
    AuthAttrView {
        key: attr.key.clone(),
        value: attr.value.as_ref().map(value_to_string),
        sensitive: is_sensitive_key(&attr.key),
    }
}

/// เก็บ url ที่แสดง ตรวจสอบจาก wire URL (object หรือ string)
fn url_to_view(url: &Option<StringOr<Url>>) -> UrlView {
    let raw = normalize::url_to_string(url);
    let mut view = UrlView {
        raw,
        protocol: None,
        host: None,
        port: None,
        path: None,
        query: Vec::new(),
        path_variables: Vec::new(),
    };
    // ถ้าเป็น string-only จะได้แค่ raw — part ระดับลึกไม่มี
    if let Some(StringOr::Structured(u)) = url {
        view.protocol = u.protocol.clone();
        view.host = host_string(&u.host);
        view.port = u.port.clone();
        view.path = path_string(&u.path);
        view.query = u.query.iter().flatten().map(query_param_view).collect();
        view.path_variables = u
            .variable
            .iter()
            .flatten()
            .map(variable_param_view)
            .collect();
    }
    view
}

fn host_string(host: &Option<StringOr<Vec<String>>>) -> Option<String> {
    match host {
        Some(StringOr::Str(s)) => Some(s.clone()),
        Some(StringOr::Structured(parts)) => Some(parts.join(".")),
        None => None,
    }
}

fn path_string(path: &Option<StringOr<Vec<PathSegment>>>) -> Option<String> {
    match path {
        Some(StringOr::Str(s)) => Some(s.clone()),
        Some(StringOr::Structured(segments)) => Some(
            segments
                .iter()
                .map(|segment| match segment {
                    PathSegment::Str(s) => s.clone(),
                    PathSegment::Segment(variable) => variable.value.clone().unwrap_or_default(),
                })
                .collect::<Vec<_>>()
                .join("/"),
        ),
        None => None,
    }
}

fn query_param_view(param: &QueryParam) -> ParamView {
    ParamView {
        key: param.key.clone().unwrap_or_default(),
        value: param.value.clone(),
        disabled: param.disabled,
        description: normalize::description(&param.description),
    }
}

fn url_encoded_param_view(param: &crate::postman::model::UrlEncodedParameter) -> ParamView {
    ParamView {
        key: param.key.clone(),
        value: param.value.clone(),
        disabled: param.disabled,
        description: normalize::description(&param.description),
    }
}

fn variable_param_view(variable: &Variable) -> ParamView {
    ParamView {
        key: variable.key.clone().unwrap_or_default(),
        value: variable.value.as_ref().map(value_to_string),
        disabled: variable.disabled,
        description: normalize::description(&variable.description),
    }
}

fn header_view(header: &Header) -> HeaderView {
    HeaderView {
        key: header.key.clone(),
        value: header.value.clone(),
        disabled: header.disabled,
        description: normalize::description(&header.description),
    }
}

fn form_field_view(field: &FormParameter) -> FormFieldView {
    match field.type_.as_deref() {
        Some("file") => FormFieldView {
            key: field.key.clone(),
            kind: FormFieldKind::File,
            value: None,
            // file ปกติ src เป็น string; array (หลาย path) join ด้วย ", " ตาม test-design
            src: field.src.as_ref().map(form_src_string),
            content_type: field.content_type.clone(),
        },
        _ => FormFieldView {
            key: field.key.clone(),
            kind: FormFieldKind::Text,
            value: field.value.clone(),
            src: None,
            content_type: field.content_type.clone(),
        },
    }
}

fn form_src_string(src: &StringOr<Vec<String>>) -> String {
    match src {
        StringOr::Str(s) => s.clone(),
        StringOr::Structured(paths) => paths.join(", "),
    }
}

fn variable_views(variables: &Option<Vec<Variable>>) -> Vec<VariableView> {
    variables
        .iter()
        .flatten()
        .map(|v| VariableView {
            key: v.key.clone().unwrap_or_default(),
            value: v.value.as_ref().map(value_to_string),
            type_: v.type_.clone(),
            disabled: v.disabled,
            description: normalize::description(&v.description),
        })
        .collect()
}

fn script_views(events: &Option<Vec<Event>>) -> Vec<ScriptView> {
    events
        .iter()
        .flatten()
        .map(|event| ScriptView {
            listen: event.listen.clone(),
            source: event
                .script
                .as_ref()
                .map(normalize::script_source)
                .unwrap_or_default(),
            disabled: event.disabled,
        })
        .collect()
}

fn has_scripts(events: &Option<Vec<Event>>) -> bool {
    events
        .as_deref()
        .map(|events| events.iter().any(|event| event.script.is_some()))
        .unwrap_or(false)
}

fn folder_has_scripts(node: &Node) -> bool {
    match &node.wire {
        Some(Item::Group(group)) => has_scripts(&group.event),
        _ => false,
    }
}

fn example_summaries(responses: &Option<Vec<Response>>) -> Vec<ExampleSummary> {
    responses
        .iter()
        .flatten()
        .enumerate()
        .map(|(index, response)| ExampleSummary {
            index: index as u32,
            name: response.name.clone().unwrap_or_default(),
            status: response.status.clone(),
            code: response.code.map(|c| c as u32),
        })
        .collect()
}

fn var_refs(node: &Node, idx: &NodeIndex) -> Vec<VarRef> {
    node.variable_refs
        .iter()
        .map(|name| VarRef {
            name: name.clone(),
            defined: idx
                .collection_var_names
                .iter()
                .any(|defined| defined == name),
        })
        .collect()
}

fn cookie_view(cookie: &Cookie) -> CookieView {
    CookieView {
        name: cookie.name.clone(),
        value: cookie.value.clone(),
        domain: cookie.domain.clone(),
        path: cookie.path.clone(),
    }
}

/// extra `Map<String, Value>` → รายการ `KeyValue` ที่แสดงได้ (FR-009: ไม่ทิ้งของไม่รู้จัก)
fn extra_views(extra: &Map<String, Value>) -> Vec<KeyValue> {
    values_to_key_values(extra)
}

fn values_to_key_values(extra: &Map<String, Value>) -> Vec<KeyValue> {
    extra
        .iter()
        .map(|(key, value)| KeyValue {
            key: key.clone(),
            value: value_to_string(value),
        })
        .collect()
}

/// `serde_json::Value` → string สำหรับแสดง — string ตรงๆ, null เป็น "", ที่เหลือเป็น
/// JSON ขนาดเล็ก (ตัวเลข/bool) หรือ compact JSON (object/array)
fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// `info.version` → display string — object form ประกอบ "major.minor.patch[-identifier]"
fn version_string(
    version: &Option<StringOr<crate::postman::model::CollectionVersion>>,
) -> Option<String> {
    match version {
        None => None,
        Some(StringOr::Str(s)) => Some(s.clone()),
        Some(StringOr::Structured(version)) => {
            let mut out = format!("{}.{}.{}", version.major, version.minor, version.patch);
            if let Some(identifier) = version.identifier.as_deref().filter(|i| !i.is_empty()) {
                out.push('-');
                out.push_str(identifier);
            }
            Some(out)
        }
    }
}

/// `normalize::LoadWarning` (T-007, ยังไม่มี node_id ในตัวมัน) → `LoadWarningView`
fn load_warning_to_view(warning: LoadWarning) -> LoadWarningView {
    match warning {
        LoadWarning::MalformedRawHeaderLine => LoadWarningView::MalformedRawHeaderLine {
            node_id: None,
            detail: "raw header block has a line without \":\"".to_string(),
        },
        LoadWarning::DuplicateVariableKey { key } => LoadWarningView::DuplicateVariableKey {
            node_id: None,
            detail: key,
        },
    }
}

/// จำนวน request ลูกหลานทั้งหมดของ folder — เดิน arena ด้วย queue (no recursion)
fn descendant_request_count(idx: &NodeIndex, node: &Node) -> usize {
    let mut count = 0;
    let mut queue: Vec<NodeId> = node.children.clone();
    while let Some(id) = queue.pop() {
        let Some(child) = idx.by_id(&id) else {
            continue;
        };
        match child.kind {
            NodeKind::Request => count += 1,
            NodeKind::Folder => queue.extend(child.children.iter().cloned()),
            NodeKind::Collection => {}
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::build_index;
    use crate::postman::model::{PostmanCollection, RequestBody};
    use serde_json::json;

    const SCHEMA: &str = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

    /// parse + index — เก็บ warnings ไว้ส่งต่อให้ `build_overview` ต่อได้
    fn load(value: serde_json::Value) -> (PostmanCollection, NodeIndex, Vec<LoadWarning>) {
        let mut collection: PostmanCollection = serde_json::from_value(value).unwrap();
        let (idx, warnings) = build_index(&mut collection);
        (collection, idx, warnings)
    }

    fn request_detail_of(
        collection: &PostmanCollection,
        idx: &NodeIndex,
        id: &str,
    ) -> RequestDetail {
        match node_detail(idx, collection.auth.as_ref(), &id.parse().unwrap()) {
            Some(NodeDetail::Request(detail)) => *detail,
            other => panic!("expected request detail for {id:?}, got {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // TC-U-032..036 — TDD contract ของงานนี้
    // ------------------------------------------------------------------

    /// TC-U-032 — raw body รักษาภาษาที่ประกาศใน options.raw.language
    #[test]
    fn tc_u_032_raw_body_keeps_declared_language() {
        let body: RequestBody = serde_json::from_value(json!({
            "mode": "raw",
            "raw": "{}",
            "options": { "raw": { "language": "json" } }
        }))
        .unwrap();
        assert_eq!(
            body_to_view(&body),
            Some(BodyView::Raw {
                language: "json".to_string(),
                text: "{}".to_string()
            })
        );
    }

    /// TC-U-033 — raw body ไม่ได้ประกาศภาษา → default "text" (FR-027)
    #[test]
    fn tc_u_033_raw_body_without_language_defaults_to_text() {
        let body: RequestBody = serde_json::from_value(json!({
            "mode": "raw",
            "raw": "hello {{who}}"
        }))
        .unwrap();
        assert_eq!(
            body_to_view(&body),
            Some(BodyView::Raw {
                language: "text".to_string(),
                text: "hello {{who}}".to_string()
            })
        );
        // options มีแต่ไม่ระบุ language ก็ไม่ panic + ได้ text
        let body: RequestBody = serde_json::from_value(json!({
            "mode": "raw",
            "raw": "x",
            "options": { "raw": {} }
        }))
        .unwrap();
        assert_eq!(
            body_to_view(&body),
            Some(BodyView::Raw {
                language: "text".to_string(),
                text: "x".to_string()
            })
        );
    }

    /// TC-U-034 — formdata แยก text field กับ file field (FR-029)
    #[test]
    fn tc_u_034_formdata_distinguishes_text_and_file_fields() {
        let body: RequestBody = serde_json::from_value(json!({
            "mode": "formdata",
            "formdata": [
                { "key": "note", "value": "x" },
                { "key": "doc", "type": "file", "src": "./a.pdf" }
            ]
        }))
        .unwrap();
        let fields = match body_to_view(&body) {
            Some(BodyView::Formdata { fields }) => fields,
            other => panic!("expected BodyView::Formdata, got {other:?}"),
        };
        assert_eq!(fields.len(), 2);
        assert_eq!(fields[0].kind, FormFieldKind::Text);
        assert_eq!(fields[0].value.as_deref(), Some("x"));
        assert_eq!(fields[0].src, None);
        assert_eq!(fields[1].kind, FormFieldKind::File);
        assert_eq!(fields[1].value, None);
        assert_eq!(fields[1].src.as_deref(), Some("./a.pdf"));
    }

    /// TC-U-035 — attribute ที่เข้าข่าย credential มี sensitive = true (FR-032)
    #[test]
    fn tc_u_035_credential_auth_attributes_are_flagged_sensitive() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Req", "request": {
                    "method": "GET",
                    "url": "https://a.test",
                    "auth": { "type": "bearer", "bearer": [
                        { "key": "token", "value": "ey…" },
                        { "key": "in", "value": "header" }
                    ] }
                } }
            ]
        }));
        let detail = request_detail_of(&collection, &idx, "0");
        assert_eq!(detail.auth.auth_type, "bearer");
        assert_eq!(detail.auth.source, AuthSourceView::Own);
        assert_eq!(detail.auth.attributes.len(), 2);
        assert!(detail.auth.attributes[0].sensitive);
        assert!(!detail.auth.attributes[1].sensitive);
    }

    /// TC-U-036 — auth type ที่ minim ไม่รู้จัก: เปิดได้, แสดง verbatim, มีคำเตือน
    /// ชี้ node (FR-009 / FR-031)
    ///
    /// หมายเหตุ: ใช้ `"quantum"` เป็นตัว unknown (ตรง TC-UNIT-040 ของ test-design)
    /// — ตัว `"hawk"` ที่ dev-plan เขียนไว้จริงๆ เป็น 1 ใน 11 ชนิดที่ schema กำหนดแล้ว
    #[test]
    fn tc_u_036_unknown_auth_type_passes_through_with_warning() {
        let (collection, idx, load_warnings) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Req", "request": {
                    "method": "GET",
                    "url": "https://a.test",
                    "auth": { "type": "quantum", "quantum": [{ "key": "k", "value": "v" }] }
                } }
            ]
        }));
        let overview = build_overview(
            &collection,
            &idx,
            load_warnings,
            "/tmp/x.json".to_string(),
            42,
        );

        // connection เปิดได้ + auth ผ่านมา verbatim
        assert_eq!(overview.tree.len(), 1);
        let detail = request_detail_of(&collection, &idx, "0");
        assert_eq!(detail.auth.auth_type, "quantum");
        assert_eq!(
            detail.auth.attributes.first().map(|a| a.key.as_str()),
            Some("k")
        );

        // และมี UnknownAuthType หนึ่งตัวชื่อ node นั้น
        let unknown: Vec<&LoadWarningView> = overview
            .warnings
            .iter()
            .filter(|w| matches!(w, LoadWarningView::UnknownAuthType { .. }))
            .collect();
        assert_eq!(unknown.len(), 1, "warnings={:?}", overview.warnings);
        match unknown[0] {
            LoadWarningView::UnknownAuthType { node_id, detail } => {
                assert_eq!(node_id.as_deref(), Some("0"));
                assert_eq!(detail, "quantum");
            }
            _ => unreachable!(),
        }
    }

    // ------------------------------------------------------------------
    // ตัวทดสอบเสริม — ยึด design.md / test-design ที่เหลือ
    // ------------------------------------------------------------------

    /// collection auth ที่มีชนิด unknown → overview.auth ผ่าน verbatim + เตือน
    #[test]
    fn collection_auth_unknown_type_is_verbatim_and_warns() {
        let (collection, idx, load_warnings) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "auth": { "type": "quantum", "quantum": [{ "key": "k", "value": "v" }] },
            "item": []
        }));
        let overview = build_overview(
            &collection,
            &idx,
            load_warnings,
            "/tmp/x.json".to_string(),
            42,
        );
        assert_eq!(overview.auth.as_ref().unwrap().auth_type, "quantum");
        assert_eq!(overview.auth.as_ref().unwrap().source, AuthSourceView::Own);
        assert!(overview
            .warnings
            .iter()
            .any(|w| matches!(w, LoadWarningView::UnknownAuthType { node_id: None, .. })));
    }

    /// 11 ชนิดที่ schema กำหนดผ่านโดยไม่มีคำเตือน — attribute คัดจาก field ที่ตรง type
    #[test]
    fn all_known_auth_types_map_without_warning() {
        assert!(KNOWN_AUTH_TYPES.iter().all(|t| is_known_auth_type(t)));
        assert!(!is_known_auth_type("quantum"));
        assert!(!is_known_auth_type(""));
    }

    /// auth ที่สืบทอดจาก folder → source Folder{name} และ attributes มาจาก folder
    /// (กลางของ FR-030)
    #[test]
    fn inherited_folder_auth_carries_folder_name_and_attributes() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Auth", "auth": {
                    "type": "basic",
                    "basic": [{ "key": "username", "value": "u" }]
                }, "item": [
                    { "name": "Req", "request": { "method": "GET", "url": "https://a.test" } }
                ] }
            ]
        }));
        let detail = request_detail_of(&collection, &idx, "0.0");
        assert_eq!(
            detail.auth.source,
            AuthSourceView::Folder {
                name: "Auth".to_string()
            }
        );
        assert_eq!(detail.auth.auth_type, "basic");
        assert_eq!(
            detail.auth.attributes.first().map(|a| a.value.as_deref()),
            Some(Some("u"))
        );
    }

    /// `noauth` คือชนิดจริง (Own ชัดเจน) ไม่ใช่ "ไม่มี auth" — ตาม test-design 3.1 row 5
    #[test]
    fn noauth_is_own_not_none() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "auth": { "type": "apikey", "apikey": [] },
            "item": [
                { "name": "Req", "request": {
                    "method": "GET", "url": "https://a.test",
                    "auth": { "type": "noauth", "noauth": [] }
                } }
            ]
        }));
        let detail = request_detail_of(&collection, &idx, "0");
        assert_eq!(detail.auth.source, AuthSourceView::Own);
        assert_eq!(detail.auth.auth_type, "noauth");
    }

    /// ไม่มี auth ที่ไหนเลย → source None และ attributes ว่าง — ใช้ UI ตัดสินได้
    #[test]
    fn no_auth_anywhere_is_source_none() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Req", "request": { "method": "GET", "url": "https://a.test" } }
            ]
        }));
        let detail = request_detail_of(&collection, &idx, "0");
        assert_eq!(detail.auth.source, AuthSourceView::None);
        assert_eq!(detail.auth.auth_type, "");
        assert!(detail.auth.attributes.is_empty());
    }

    /// url object → UrlView แยก part ได้; url string → แค่ raw
    #[test]
    fn url_view_extracts_structured_parts() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Obj", "request": {
                    "method": "GET",
                    "url": {
                        "protocol": "https",
                        "host": ["api", "example", "com"],
                        "port": "8443",
                        "path": ["v1", "users", { "value": "tenants" }],
                        "query": [{ "key": "expand", "value": "all" }],
                        "variable": [{ "key": "tenant_id", "value": "acme" }]
                    }
                } },
                { "name": "Str", "request": { "method": "GET", "url": "https://b.test/x" } }
            ]
        }));

        let obj = request_detail_of(&collection, &idx, "0");
        assert_eq!(obj.url.raw, "https://api.example.com:8443/v1/users/tenants");
        assert_eq!(obj.url.protocol.as_deref(), Some("https"));
        assert_eq!(obj.url.host.as_deref(), Some("api.example.com"));
        assert_eq!(obj.url.port.as_deref(), Some("8443"));
        assert_eq!(obj.url.path.as_deref(), Some("v1/users/tenants"));
        assert_eq!(
            obj.url.query.first().map(|q| q.key.as_str()),
            Some("expand")
        );
        assert_eq!(
            obj.url.path_variables.first().map(|v| v.value.as_deref()),
            Some(Some("acme"))
        );

        let str_req = request_detail_of(&collection, &idx, "1");
        assert_eq!(str_req.url.raw, "https://b.test/x");
        assert_eq!(str_req.url.host, None);
        assert!(str_req.url.query.is_empty());
    }

    /// header หลัง normalize ผ่าน header_view (disabled/description รอดมา)
    #[test]
    fn headers_and_behavior_and_extra_map_into_detail() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Req", "request": {
                    "method": "POST",
                    "url": "https://a.test",
                    "header": [
                        { "key": "X-A", "value": "1", "disabled": true,
                          "description": "why disabled" }
                    ],
                    "protocolProfileBehavior": { "disableBodyPruning": true },
                    "x_future_extra": { "nested": true }
                } }
            ]
        }));
        let detail = request_detail_of(&collection, &idx, "0");
        assert_eq!(detail.headers.len(), 1);
        assert_eq!(detail.headers[0].key, "X-A");
        assert_eq!(detail.headers[0].value, "1");
        assert_eq!(detail.headers[0].disabled, Some(true));
        assert_eq!(detail.headers[0].description, "why disabled");

        assert_eq!(
            detail.behavior,
            vec![KeyValue {
                key: "disableBodyPruning".to_string(),
                value: "true".to_string()
            }]
        );

        // unknown field ที่ flatten อยู่ `extra` — ต้องถูกพามาด้วย (FR-009)
        assert!(detail
            .extra
            .iter()
            .any(|kv| kv.key == "x_future_extra" && kv.value == "{\"nested\":true}"));
    }

    /// tree สร้างตาม document order ซ้อนตาม folder; request leaf มี method/url/
    /// example_count/has_scripts
    #[test]
    fn overview_tree_follows_document_order_and_nests() {
        let (collection, idx, warnings) = load(json!({
            "info": { "name": "Acme", "schema": SCHEMA, "version": "1.2.3" },
            "item": [
                { "name": "Folder", "item": [
                    { "name": "Inner",
                      "request": { "method": "GET", "url": "{{base_url}}/a" },
                      "response": [ { "name": "ok", "status": "OK", "code": 200 } ],
                      "event": [ { "listen": "test", "script": { "exec": "pm.test('x');" } } ] }
                ] },
                { "name": "Plain", "request": { "method": "DELETE", "url": "https://b.test" } }
            ]
        }));
        let overview = build_overview(&collection, &idx, warnings, "/tmp/a.json".to_string(), 7);
        assert_eq!(overview.name, "Acme");
        assert_eq!(overview.version.as_deref(), Some("1.2.3"));
        assert_eq!(overview.request_count, 2);
        assert_eq!(overview.folder_count, 1);

        assert_eq!(overview.tree.len(), 2);
        let folder = &overview.tree[0];
        assert_eq!(folder.kind, NodeKindView::Folder);
        assert_eq!(folder.method, None);
        assert_eq!(folder.children.len(), 1);
        let inner = &folder.children[0];
        assert_eq!(inner.kind, NodeKindView::Request);
        assert_eq!(inner.method.as_deref(), Some("GET"));
        assert_eq!(inner.url_preview.as_deref(), Some("{{base_url}}/a"));
        assert_eq!(inner.folder_path, vec!["Folder"]);
        assert_eq!(inner.example_count, 1);
        assert!(inner.has_scripts);

        let plain = &overview.tree[1];
        assert_eq!(plain.method.as_deref(), Some("DELETE"));
        assert!(!plain.has_scripts);
    }

    /// version object form ประกอบเป็น "major.minor.patch[-identifier]" (TC-UNIT-048)
    #[test]
    fn overview_version_object_form_is_rendered() {
        let (collection, idx, warnings) = load(json!({
            "info": { "name": "C", "schema": SCHEMA, "version": {
                "major": 2, "minor": 4, "patch": 0, "identifier": "beta"
            } },
            "item": []
        }));
        let overview = build_overview(&collection, &idx, warnings, "/tmp/a.json".to_string(), 0);
        assert_eq!(overview.version.as_deref(), Some("2.4.0-beta"));

        let (collection, idx, warnings) = load(json!({
            "info": { "name": "C", "schema": SCHEMA, "version": "2.4.0" },
            "item": []
        }));
        let overview = build_overview(&collection, &idx, warnings, "/tmp/a.json".to_string(), 0);
        assert_eq!(overview.version.as_deref(), Some("2.4.0"));

        let (collection, idx, warnings) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": []
        }));
        let overview = build_overview(&collection, &idx, warnings, "/tmp/a.json".to_string(), 0);
        assert_eq!(overview.version, None);
    }

    /// ตัวแปรใน overview เป็น raw (รวม key ซ้ำ ไม่ collapse) + ใช้หน้าครั้งละตัวบนคำเตือน
    /// duplicate — พฤติกรรมตาม TC-UNIT-044 ของ test-design
    #[test]
    fn duplicate_variable_key_warns_and_both_rows_survive() {
        let (collection, idx, warnings) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "variable": [
                { "key": "baseUrl", "value": "https://a.test" },
                { "key": "baseUrl", "value": "https://b.test" }
            ],
            "item": []
        }));
        let overview = build_overview(&collection, &idx, warnings, "/tmp/a.json".to_string(), 0);
        assert_eq!(overview.variables.len(), 2);
        assert_eq!(overview.variables[0].key, "baseUrl");
        assert_eq!(overview.variables[1].key, "baseUrl");
        let dup = overview
            .warnings
            .iter()
            .find(|w| matches!(w, LoadWarningView::DuplicateVariableKey { .. }))
            .expect("duplicate key must warn");
        match dup {
            LoadWarningView::DuplicateVariableKey { node_id, detail } => {
                assert_eq!(node_id, &None);
                assert_eq!(detail, "baseUrl");
            }
            _ => unreachable!(),
        }
    }

    /// variable_refs บอก defined ตามรายชื่อ collection variable
    #[test]
    fn var_refs_are_flagged_defined() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "variable": [ { "key": "base_url", "value": "https://a.test" } ],
            "item": [
                { "name": "Req", "request": {
                    "method": "GET",
                    "url": "{{base_url}}/a?q={{missing}}"
                } }
            ]
        }));
        let detail = request_detail_of(&collection, &idx, "0");
        assert_eq!(
            detail.variable_refs,
            vec![
                VarRef {
                    name: "base_url".to_string(),
                    defined: true
                },
                VarRef {
                    name: "missing".to_string(),
                    defined: false
                },
            ]
        );
    }

    /// example detail ผ่าน normalizer ของ header เหมือน request (TC-UNIT-049) และ
    /// เก็บ preview language ไว้ (S5)
    #[test]
    fn example_detail_normalizes_headers_and_cookies() {
        let response: Response = serde_json::from_value(json!({
            "name": "ok", "status": "OK", "code": 200,
            "header": "Content-Type: application/json\r\nX-Req-Id: 7",
            "cookie": [ { "domain": "a.test", "path": "/", "name": "sid", "value": "x" } ],
            "body": "{\"ok\":true}",
            "_postman_previewlanguage": "json"
        }))
        .unwrap();
        let detail = example_detail(&response);
        assert_eq!(detail.name, "ok");
        assert_eq!(detail.status.as_deref(), Some("OK"));
        assert_eq!(detail.code, Some(200));
        assert_eq!(detail.headers.len(), 2);
        assert_eq!(detail.headers[0].key, "Content-Type");
        assert_eq!(detail.headers[1].key, "X-Req-Id");
        assert_eq!(detail.cookies.len(), 1);
        assert_eq!(detail.cookies[0].name.as_deref(), Some("sid"));
        assert_eq!(detail.body.as_deref(), Some("{\"ok\":true}"));
        assert_eq!(detail.preview_language.as_deref(), Some("json"));
    }

    /// node_detail บน folder node → FolderDetail และ root node → None (ข้อมูลอยู่
    /// ใน overview — TC-CMD-019/TC-CMD-018)
    #[test]
    fn node_detail_covers_folder_and_rejects_root() {
        let (collection, idx, _) = load(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Auth", "auth": { "type": "bearer", "bearer": [] },
                  "event": [ { "listen": "prerequest", "script": { "exec": "foo()" } } ],
                  "item": [
                    { "name": "A", "request": { "method": "GET", "url": "https://a.test" } },
                    { "name": "B", "request": { "method": "GET", "url": "https://b.test" } }
                  ] }
            ]
        }));
        match node_detail(&idx, collection.auth.as_ref(), &"0".parse().unwrap()) {
            Some(NodeDetail::Folder(folder)) => {
                assert_eq!(folder.name, "Auth");
                assert_eq!(folder.child_count, 2);
                assert_eq!(folder.descendant_request_count, 2);
                assert_eq!(folder.events.len(), 1);
                assert_eq!(folder.events[0].listen, "prerequest");
                assert_eq!(folder.auth.auth_type, "bearer");
            }
            other => panic!("expected folder detail, got {other:?}"),
        }

        // root ("") ไม่มี NodeDetail
        assert_eq!(
            node_detail(&idx, collection.auth.as_ref(), &"".parse().unwrap()),
            None
        );
        // id ที่ไม่มี node
        assert_eq!(
            node_detail(&idx, collection.auth.as_ref(), &"99.99".parse().unwrap()),
            None
        );
    }

    /// body ทั้งห้า mode map ได้ครบ ไม่มีตัวใดหาย (FR-026)
    #[test]
    fn all_five_body_modes_map() {
        let urlencoded: RequestBody = serde_json::from_value(json!({
            "mode": "urlencoded",
            "urlencoded": [{ "key": "a", "value": "1" }]
        }))
        .unwrap();
        assert!(matches!(
            body_to_view(&urlencoded),
            Some(BodyView::Urlencoded { ref params }) if params.len() == 1
        ));

        let formdata: RequestBody = serde_json::from_value(json!({
            "mode": "formdata", "formdata": [{ "key": "a", "value": "1" }]
        }))
        .unwrap();
        assert!(matches!(
            body_to_view(&formdata),
            Some(BodyView::Formdata { .. })
        ));

        let file: RequestBody = serde_json::from_value(json!({
            "mode": "file", "file": { "src": "/tmp/x.bin" }
        }))
        .unwrap();
        assert_eq!(
            body_to_view(&file),
            Some(BodyView::File {
                src: "/tmp/x.bin".to_string()
            })
        );

        let graphql: RequestBody = serde_json::from_value(json!({
            "mode": "graphql",
            "graphql": { "query": "query { a }", "variables": "{}" }
        }))
        .unwrap();
        assert_eq!(
            body_to_view(&graphql),
            Some(BodyView::Graphql {
                query: "query { a }".to_string(),
                variables: "{}".to_string()
            })
        );

        // body อยู่แต่ไม่มี mode → None (ไม่มีอะไรจะแสดง)
        let empty: RequestBody = serde_json::from_value(json!({
            "raw": "orphan raw"
        }))
        .unwrap();
        assert_eq!(body_to_view(&empty), None);
    }
}
