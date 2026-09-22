//! โมเดลข้อมูล Postman Collection Format v2.1 (wire model)
//!
//! จำลอง schema v2.1 ตรงๆ ตาม `.claude/docs/postman-collection.ts` ซึ่งเป็น
//! specification ตัวจริง — ฟิลด์ทุกตัวที่เป็น polymorphic (url / header /
//! description / exec / host / path ฯลฯ) ครอบด้วย `StringOr<T>` จาก
//! `polymorphic.rs` ฟิลด์ที่ schema มีได้แต่ real export ไม่มี เก็บเป็น
//! `Option<T>` ทั้งหมด (ไม่ใส่ default ปลอม) เพื่อกลืนทั้งที่หายไปและ `null`
//! ฟิลด์ที่ไม่รู้จักทุกตัวถูก `#[serde(flatten)]` เข้า `extra` เพื่อให้
//! round-trip ผ่าน JSON ดั้งเดิมได้ (ADR-004) — ห้ามใส่ `deny_unknown_fields`
//!
//! หมายเหตุ: ไฟล์นี้เป็นแค่ data model — normalizer อย่าง `getUrlString`
//! / `getHeaders` / `getScriptSource` / `getDescription` / `walkRequests`
//! อยู่ที่ T-006

use serde::de::{Deserializer, Error};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::polymorphic::{
    deserialize_optional_string_or, deserialize_string_or, PathSegment, StringOr,
};

/// Collection ระดับบนสุด — ไฟล์ JSON ที่ Postman/Newman ใช้
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PostmanCollection {
    pub info: CollectionInfo,
    /// tree ของ request/folder ที่ซ้อนกันได้ไม่จำกัดชั้น
    pub item: Vec<Item>,
    /// auth ระดับ collection (request ที่ไม่มี auth ของตัวเองจะ inherit อันนี้)
    #[serde(default)]
    pub auth: Option<Auth>,
    /// script ระดับ collection (prerequest / test ที่รันทุก request)
    #[serde(default)]
    pub event: Option<Vec<Event>>,
    /// ตัวแปรระดับ collection
    #[serde(default)]
    pub variable: Option<Vec<Variable>>,
    #[serde(default, rename = "protocolProfileBehavior")]
    pub protocol_profile_behavior: Option<ProtocolProfileBehavior>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ส่วน `info` ของ collection
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollectionInfo {
    pub name: String,
    /// UUID ของ collection
    #[serde(default, rename = "_postman_id")]
    pub _postman_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(default, deserialize_with = "deserialize_version")]
    pub version: Option<StringOr<CollectionVersion>>,
    /// ควรลงท้ายด้วย .../v2.1.0/collection.json — ใช้เช็ค version ก่อน parse
    pub schema: String,
    #[serde(default, rename = "_exporter_id")]
    pub _exporter_id: Option<String>,
    #[serde(default, rename = "_collection_link")]
    pub _collection_link: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// เวอร์ชันของ collection — เป็น object โครงสร้าง
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollectionVersion {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    #[serde(default)]
    pub identifier: Option<String>,
    #[serde(default)]
    pub meta: Option<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// item หนึ่งตัวเป็นได้ 2 แบบแยกด้วยโครงสร้าง ไม่ใช่ type tag:
///   - `Group(ItemGroup)` : มี property `item`
///   - `Request(ItemRequest)` : มี property `request`
///
/// `Deserialize` เขียนด้วยมือเพื่อแยกตาม key ที่มีจริงๆ (เสถียรกว่า
/// `#[serde(untagged)]` และ error อ่านรู้เรื่องกว่า) ส่วน `Serialize` ใช้
/// untagged ตามธรรมชาติ เพราะ Rust enum ตัวเดียวต้องออกมาเป็น object ตัวเดียว
///
/// คง `ItemRequest` ไว้แบบตรงๆ (ไม่ box) เพื่อคนอ่านโค้ด T-006 จะได้เข้าถึง
/// ฟิลด์ได้ทันที — ขนาด enum ที่ต่างกันไม่เป็นปัญหาเพราะในหน่วยความจำเก็บแค่
/// กรณีเดียวต่อค่า ไม่ได้เก็บทั้งสอง struct พร้อมกัน
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Item {
    /// Folder — มี item array ของตัวเอง
    Group(ItemGroup),
    /// Request — leaf node จริงๆ ที่ยิงได้
    Request(ItemRequest),
}

impl<'de> Deserialize<'de> for Item {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let Value::Object(map) = value else {
            return Err(Error::custom(
                "expected an item to be an object — a folder (has \"item\") or a request (has \"request\")",
            ));
        };
        if map.contains_key("item") {
            ItemGroup::deserialize(Value::Object(map))
                .map(Item::Group)
                .map_err(Error::custom)
        } else if map.contains_key("request") {
            ItemRequest::deserialize(Value::Object(map))
                .map(Item::Request)
                .map_err(Error::custom)
        } else {
            Err(Error::custom(
                "item is neither a folder (missing \"item\") nor a request (missing \"request\")",
            ))
        }
    }
}

/// Folder — มี item array ของตัวเอง
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ItemGroup {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    /// ลูกๆ ข้างใน folder
    pub item: Vec<Item>,
    /// auth ระดับ folder
    #[serde(default)]
    pub auth: Option<Auth>,
    #[serde(default)]
    pub event: Option<Vec<Event>>,
    #[serde(default)]
    pub variable: Option<Vec<Variable>>,
    #[serde(default, rename = "protocolProfileBehavior")]
    pub protocol_profile_behavior: Option<ProtocolProfileBehavior>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Request — leaf node จริงๆ ที่ยิงได้
///
/// `request` เป็นได้ทั้ง object `Request` และ string (URL เต็มๆ) — รูปแบบ
/// string` นี้มีอยู่ในไฟล์ export จริงของ Postman แม้ว่าจะไม่ได้ระบุใน
/// `.claude/docs/postman-collection.ts`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ItemRequest {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(deserialize_with = "deserialize_request")]
    pub request: StringOr<Request>,
    /// saved examples / responses ที่บันทึกไว้
    #[serde(default)]
    pub response: Option<Vec<Response>>,
    #[serde(default)]
    pub event: Option<Vec<Event>>,
    #[serde(default)]
    pub variable: Option<Vec<Variable>>,
    #[serde(default, rename = "protocolProfileBehavior")]
    pub protocol_profile_behavior: Option<ProtocolProfileBehavior>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Request จริงๆ — นิยามการยิง request หนึ่งครั้ง
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Request {
    /// url เป็นได้ทั้ง object และ string — ต้อง handle ทั้งสองแบบ
    #[serde(default, deserialize_with = "deserialize_url")]
    pub url: Option<StringOr<Url>>,
    #[serde(default)]
    pub method: Option<String>,
    /// header เป็นได้ทั้ง array และ string (raw header block)
    #[serde(default, deserialize_with = "deserialize_header")]
    pub header: Option<StringOr<Vec<Header>>>,
    #[serde(default)]
    pub body: Option<RequestBody>,
    #[serde(default)]
    pub auth: Option<Auth>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(default)]
    pub proxy: Option<ProxyConfig>,
    #[serde(default)]
    pub certificate: Option<Certificate>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// URL — ทั้งแบบมี raw และแบบประกอบจาก part ทีละตัว
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Url {
    /// URL แบบเต็มเป็น string — ใช้แสดงผลได้เลยง่ายสุด
    #[serde(default)]
    pub raw: Option<String>,
    #[serde(default)]
    pub protocol: Option<String>,
    /// host เป็นได้ทั้ง string หรือ array ของ segment เช่น ["api","example","com"]
    #[serde(default, deserialize_with = "deserialize_host")]
    pub host: Option<StringOr<Vec<String>>>,
    /// path segment เช่น ["users",":id"] — element ที่ขึ้นต้น : คือ path variable
    #[serde(default, deserialize_with = "deserialize_path")]
    pub path: Option<StringOr<Vec<PathSegment>>>,
    #[serde(default)]
    pub port: Option<String>,
    #[serde(default)]
    pub query: Option<Vec<QueryParam>>,
    #[serde(default)]
    pub hash: Option<String>,
    /// ค่าของ path variable เช่น :id
    #[serde(default)]
    pub variable: Option<Vec<Variable>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Query parameter — key/value เป็น optional และเป็น null ได้
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueryParam {
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Header หนึ่งตัว — key/value บังคับ
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Header {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ตัวกำหนดว่าจะอ่าน field ไหนของ body / render UI แบบไหน
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BodyMode {
    #[serde(rename = "raw")]
    Raw,
    #[serde(rename = "urlencoded")]
    UrlEncoded,
    #[serde(rename = "formdata")]
    FormData,
    #[serde(rename = "file")]
    File,
    #[serde(rename = "graphql")]
    GraphQl,
}

/// Request body — มี mode ครบทั้งห้าแบบ
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequestBody {
    #[serde(default)]
    pub mode: Option<BodyMode>,
    #[serde(default)]
    pub raw: Option<String>,
    #[serde(default)]
    pub urlencoded: Option<Vec<UrlEncodedParameter>>,
    #[serde(default)]
    pub formdata: Option<Vec<FormParameter>>,
    #[serde(default)]
    pub file: Option<FileBody>,
    #[serde(default)]
    pub graphql: Option<GraphQlBody>,
    /// เช่น options.raw.language = "json" | "xml" | "text" สำหรับ syntax highlight
    #[serde(default)]
    pub options: Option<BodyOptions>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ลูกของ body ชนิด urlencoded
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UrlEncodedParameter {
    pub key: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ลูกของ body ชนิด formdata — text หรือ file
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FormParameter {
    pub key: String,
    /// ใช้เมื่อ type === "text"
    #[serde(default)]
    pub value: Option<String>,
    /// ใช้เมื่อ type === "file" (path ของไฟล์) — เป็นได้ทั้ง string และ array
    #[serde(default, deserialize_with = "deserialize_form_src")]
    pub src: Option<StringOr<Vec<String>>>,
    #[serde(default, rename = "type")]
    pub type_: Option<String>,
    #[serde(default, rename = "contentType")]
    pub content_type: Option<String>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ลูกของ body ชนิด file
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileBody {
    #[serde(default)]
    pub src: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ลูกของ body ชนิด graphql
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphQlBody {
    #[serde(default)]
    pub query: Option<String>,
    /// variables มักถูกเก็บเป็น string ของ JSON
    #[serde(default)]
    pub variables: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ตัวเลือกเสริมของ body (options) — ชนิดไหนก็ได้นอกเหนือจาก raw
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BodyOptions {
    #[serde(default)]
    pub raw: Option<RawBodyOptions>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawBodyOptions {
    /// ภาษาของ raw body สำหรับ syntax highlight เช่น "json" | "xml" | "text"
    #[serde(default)]
    pub language: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// รูปแบบใน v2.1: type เป็น key ที่บอกชนิด แล้วมี property ชื่อเดียวกับ type
/// เก็บเป็น array ของ AuthAttribute เช่น
///   { "type": "bearer", "bearer": [ { "key": "token", "value": "{{token}}" } ] }
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Auth {
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(default)]
    pub apikey: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub awsv4: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub basic: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub bearer: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub digest: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub edgegrid: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub hawk: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub ntlm: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub oauth1: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub oauth2: Option<Vec<AuthAttribute>>,
    #[serde(default)]
    pub noauth: Option<Vec<AuthAttribute>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// attribute หนึ่งตัวใน auth — value เป็นอะไรก็ได้ (unknown)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AuthAttribute {
    pub key: String,
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(default, rename = "type")]
    pub type_: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Event — "prerequest" = รันก่อนยิง, "test" = รันหลังได้ response (ที่เก็บ pm.test)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    #[serde(default)]
    pub id: Option<String>,
    pub listen: String,
    #[serde(default)]
    pub script: Option<Script>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Script — โค้ดเก็บเป็น array ของบรรทัด หรือ string เดียว
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Script {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default, rename = "type")]
    pub type_: Option<String>,
    /// โค้ดเก็บเป็น array ของบรรทัด — join ด้วย "\n" ก่อนแสดง / ก่อนรัน
    #[serde(default, deserialize_with = "deserialize_exec")]
    pub exec: Option<StringOr<Vec<String>>>,
    /// ทางเลือก: โหลด script จาก url ภายนอกแทน exec — เป็นได้ทั้ง string และ object
    #[serde(default, deserialize_with = "deserialize_script_src")]
    pub src: Option<StringOr<Url>>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ตัวแปร — value เป็นอะไรก็ได้ (unknown)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Variable {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(default, rename = "type")]
    pub type_: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_description")]
    pub description: Option<StringOr<Description>>,
    #[serde(default)]
    pub system: Option<bool>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Response — saved examples ที่บันทึกไว้กับ request
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Response {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    /// request ต้นฉบับที่ทำให้เกิด response นี้
    #[serde(default, rename = "originalRequest")]
    pub original_request: Option<Request>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub code: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_header")]
    pub header: Option<StringOr<Vec<Header>>>,
    #[serde(default)]
    pub cookie: Option<Vec<Cookie>>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default, deserialize_with = "deserialize_response_time")]
    pub response_time: Option<StringOr<f64>>,
    #[serde(default)]
    pub timings: Option<Map<String, Value>>,
    /// ภาษาของ body สำหรับ syntax highlight เช่น "json"
    #[serde(default, rename = "_postman_previewlanguage")]
    pub _postman_previewlanguage: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Cookie — ใน array `cookie` ของ saved response
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cookie {
    pub domain: String,
    pub path: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default, deserialize_with = "deserialize_expires")]
    pub expires: Option<StringOr<f64>>,
    #[serde(default, deserialize_with = "deserialize_max_age")]
    pub max_age: Option<StringOr<f64>>,
    #[serde(default, rename = "hostOnly")]
    pub host_only: Option<bool>,
    #[serde(default, rename = "httpOnly")]
    pub http_only: Option<bool>,
    #[serde(default)]
    pub secure: Option<bool>,
    #[serde(default)]
    pub session: Option<bool>,
    #[serde(default)]
    pub extensions: Option<Vec<Value>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Description — เป็น object โครงสร้าง (หรือ string ด้วย StringOr)
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Description {
    #[serde(default)]
    pub content: Option<String>,
    /// เช่น "text/markdown" | "text/html" | "text/plain"
    #[serde(default, rename = "type")]
    pub type_: Option<String>,
    #[serde(default)]
    pub version: Option<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Proxy config ของ request
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProxyConfig {
    #[serde(default, rename = "match")]
    pub match_: Option<String>,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u64>,
    #[serde(default)]
    pub tunnel: Option<bool>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Client certificate ของ request
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Certificate {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub matches: Option<Vec<String>>,
    #[serde(default)]
    pub key: Option<CertificateFile>,
    #[serde(default)]
    pub cert: Option<CertificateFile>,
    #[serde(default)]
    pub passphrase: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ไฟล์ key/cert ของ certificate — เก็บเป็น object `{ src?: string }`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CertificateFile {
    #[serde(default)]
    pub src: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// freeform — ปิด/เปิด behaviour ต่างๆ เช่น { "disableBodyPruning": true }
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProtocolProfileBehavior {
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/* ===========================================================================
 * deserialize_with wrappers — ส่งชื่อ field และชื่อชนิดเข้าไปใน error
 * ของ StringOr เพื่อให้รู้ว่าตัวไหนพัง (ADR-003, TC-U-012)
 * ======================================================================== */

fn deserialize_request<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<StringOr<Request>, D::Error> {
    deserialize_string_or(deserializer, "request", "Request")
}

fn deserialize_description<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Description>>, D::Error> {
    deserialize_optional_string_or(deserializer, "description", "Description")
}

fn deserialize_version<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<CollectionVersion>>, D::Error> {
    deserialize_optional_string_or(deserializer, "version", "CollectionVersion")
}

fn deserialize_url<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Url>>, D::Error> {
    deserialize_optional_string_or(deserializer, "url", "Url")
}

fn deserialize_header<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Vec<Header>>>, D::Error> {
    deserialize_optional_string_or(deserializer, "header", "Header array")
}

fn deserialize_host<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Vec<String>>>, D::Error> {
    deserialize_optional_string_or(deserializer, "host", "String array")
}

fn deserialize_path<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Vec<PathSegment>>>, D::Error> {
    deserialize_optional_string_or(deserializer, "path", "Path array")
}

fn deserialize_exec<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Vec<String>>>, D::Error> {
    deserialize_optional_string_or(deserializer, "exec", "String array")
}

fn deserialize_script_src<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Url>>, D::Error> {
    deserialize_optional_string_or(deserializer, "src", "Url")
}

fn deserialize_form_src<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<Vec<String>>>, D::Error> {
    deserialize_optional_string_or(deserializer, "src", "String array")
}

fn deserialize_response_time<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<f64>>, D::Error> {
    deserialize_optional_string_or(deserializer, "responseTime", "Number")
}

fn deserialize_expires<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<f64>>, D::Error> {
    deserialize_optional_string_or(deserializer, "expires", "Number")
}

fn deserialize_max_age<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<StringOr<f64>>, D::Error> {
    deserialize_optional_string_or(deserializer, "maxAge", "Number")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-U-008 — url แบบ string form
    #[test]
    fn tc_u_008_url_parses_from_string_form() {
        let req: Request = serde_json::from_value(serde_json::json!({
            "method": "GET",
            "url": "https://api.example.com/v1/users"
        }))
        .unwrap();
        match req.url.unwrap() {
            StringOr::Str(s) => assert_eq!(s, "https://api.example.com/v1/users"),
            other => panic!("expected StringOr::Str, got {other:?}"),
        }
    }

    /// TC-U-009 — url แบบ object form
    #[test]
    fn tc_u_009_url_parses_from_object_form() {
        let req: Request = serde_json::from_value(serde_json::json!({
            "method": "GET",
            "url": { "host": ["a", "com"], "path": ["x"] }
        }))
        .unwrap();
        match req.url.unwrap() {
            StringOr::Structured(Url {
                host: Some(StringOr::Structured(host)),
                path: Some(StringOr::Structured(path)),
                ..
            }) => {
                assert_eq!(host, vec!["a", "com"]);
                assert_eq!(path, vec![PathSegment::Str("x".into())]);
            }
            other => panic!("expected StringOr::Structured(Url), got {other:?}"),
        }
    }

    /// TC-U-010 — unknown fields ถูกเก็บไว้ใน `extra` ไม่ได้ถูกทิ้ง
    #[test]
    fn tc_u_010_unknown_fields_are_preserved_in_extra() {
        let collection: PostmanCollection = serde_json::from_value(serde_json::json!({
            "info": {
                "name": "x",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [],
            "_futureField": { "a": 1 }
        }))
        .unwrap();
        assert_eq!(
            collection.extra.get("_futureField"),
            Some(&serde_json::json!({ "a": 1 }))
        );
    }

    /// TC-U-011 — folder vs request leaf แยกด้วยโครงสร้าง (มี `item` vs มี `request`)
    #[test]
    fn tc_u_011_item_discriminates_folder_vs_request() {
        let items: Vec<Item> = serde_json::from_value(serde_json::json!([
            {
                "name": "folder",
                "item": [
                    { "name": "inner", "request": { "method": "GET", "url": "https://a.test" } }
                ]
            },
            { "name": "leaf", "request": { "method": "GET", "url": "https://b.test" } }
        ]))
        .unwrap();

        assert_eq!(items.len(), 2);
        assert!(matches!(items[0], Item::Group(_)));
        assert!(matches!(items[1], Item::Request(_)));
    }

    /// acceptance — สนับสนุนการซ้อน folder ไปเรื่อยๆ (arbitrary depth)
    #[test]
    fn folder_nests_to_arbitrary_depth() {
        let mut value =
            serde_json::json!({ "request": { "method": "GET", "url": "https://x.test" } });
        for i in 0..32 {
            value = serde_json::json!({ "name": format!("level {i}"), "item": [value] });
        }
        let mut items: Vec<Item> = serde_json::from_value(serde_json::json!([value])).unwrap();
        assert_eq!(items.len(), 1);
        assert!(matches!(items[0], Item::Group(_)));

        let mut depth = 1;
        loop {
            match items.into_iter().next() {
                Some(Item::Group(group)) => {
                    depth += 1;
                    items = group.item;
                }
                Some(Item::Request(_)) => break,
                None => panic!("unexpected empty item list at depth {depth}"),
            }
        }
        assert_eq!(depth, 33);
    }

    /// TC-U-012 — polymorphic field ที่ไม่ตรงสัก variant ต้องบอกชื่อ field
    /// และทั้งสองแบบที่ลองแล้ว
    #[test]
    fn tc_u_012_polymorphic_failure_names_field_and_variants() {
        let err = serde_json::from_str::<Request>(r#"{ "url": 123 }"#)
            .unwrap_err()
            .to_string();
        assert!(err.contains("url"), "error ต้องมีชื่อ field: {err}");
        assert!(err.contains("string"), "error ต้องบอกตัวเลือก string: {err}");
        assert!(err.contains("object"), "error ต้องบอกตัวเลือก object: {err}");
    }
}
