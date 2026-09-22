//! พฤติกรรม polymorphic ของ Postman Collection Format v2.1
//!
//! ฟิลด์หลายตัวใน schema เป็นได้หลายรูปทรง เช่น `url` เป็นได้ทั้ง `Url` และ `string`,
//! `description` เป็นได้ทั้ง `Description` และ `string` มี `StringOr<T>` ครอบไว้
//! รูปทรงของ data คือ untagged (เหมือน `#[serde(untagged)]`) แต่ `Deserialize`
//! เขียนด้วยมือ เพื่อให้ error บอกได้ว่า tried รูปแบบไหนและ field ไหนพัง
//! เพราะ `#[serde(untagged)]` แบบดิบให้ error ที่อ่านไม่รู้เรื่อง (ADR-003)
//!
//! อ้างอิง: `.claude/docs/postman-collection.ts`

use serde::de::{DeserializeOwned, Error};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

/// ฟิลด์ polymorphic ที่เป็นได้ทั้ง `String` และ `T`
///
/// รูปทรงข้อมูล: string -> `Str`, อย่างอื่น -> `Structured` (ถ้า `T` อ่านได้)
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum StringOr<T> {
    Str(String),
    Structured(T),
}

/// path segment ของ `Url.path` — เป็นได้ทั้ง string เปล่าๆ และ object `{ type?, value? }`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PathSegment {
    Str(String),
    Segment(PathVariable),
}

/// object ของ path variable เช่น `"tenants"` / `":id"` ที่เก็บเป็น `{ type?, value? }`
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct PathVariable {
    #[serde(default, rename = "type")]
    pub type_: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// เปลี่ยน `Value` ที่อ่านมาแล้วให้เป็น `StringOr<T>` — ถ้าไม่ใช่ string และ
/// `T` ก็อ่านไม่ได้ จะคืน error ที่มีชื่อ field และชื่อชนิดทั้งสองตัว
fn from_value<T: DeserializeOwned>(
    value: Value,
    field: &'static str,
    ty: &'static str,
) -> Result<StringOr<T>, String> {
    match value {
        Value::String(s) => Ok(StringOr::Str(s)),
        value => match serde_json::from_value::<T>(value) {
            Ok(x) => Ok(StringOr::Structured(x)),
            Err(err) => Err(format!(
                "expected field \"{field}\" to be a string or a {ty} object: tried string, failed; tried {ty} object, failed with: {err}"
            )),
        },
    }
}

/// deserialize field แบบ required ที่เป็น `StringOr<T>`
///
/// ใช้ร่วมกับ `#[serde(deserialize_with)]` — ต้องส่งชื่อ field และชื่อชนิด
/// เข้าไป เพื่อให้ error ออกมาเจาะจงว่าตัวไหนพัง
pub(crate) fn deserialize_string_or<'de, D, T>(
    deserializer: D,
    field: &'static str,
    ty: &'static str,
) -> Result<StringOr<T>, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned,
{
    let value = Value::deserialize(deserializer)?;
    from_value(value, field, ty).map_err(Error::custom)
}

/// deserialize field แบบ optional ที่เป็น `StringOr<T>` — `null` และการหายไป
/// ต่างไปเป็น `None` เหมือนเดิม
pub(crate) fn deserialize_optional_string_or<'de, D, T>(
    deserializer: D,
    field: &'static str,
    ty: &'static str,
) -> Result<Option<StringOr<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    match value {
        Some(v) => from_value(v, field, ty).map(Some).map_err(Error::custom),
        None => Ok(None),
    }
}

impl<'de, T> Deserialize<'de> for StringOr<T>
where
    T: DeserializeOwned,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let ty = type_name_of::<T>();
        deserialize_string_or(deserializer, "value", ty)
    }
}

/// ชื่อชนิดแบบสั้น (เอาส่วนท้ายหลัง `::` ออก) ไว้ใช้ทำ error ของ `StringOr`
///
/// หมายเหตุ: กรณีนี้ข้อมูล generic ไปไม่ถึงชื่อ field ของตัวแม่ จึงใช้ชื่อ
/// ชนิดเป็นตัวบอก และ field ที่ต้องการ error เจาะจงจะใช้
/// `#[serde(deserialize_with)]` ที่ส่งชื่อ field เข้าไปตรงๆ
fn type_name_of<T>() -> &'static str {
    let name = std::any::type_name::<T>();
    name.rsplit("::").next().unwrap_or(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn string_or_str_เมื่อเจอ_json_string() {
        let v: StringOr<serde_json::Map<String, Value>> =
            serde_json::from_str(r#""hello""#).unwrap();
        assert!(matches!(v, StringOr::Str(s) if s == "hello"));
    }

    #[test]
    fn string_or_structured_เมื่อเจอ_object() {
        let v: StringOr<serde_json::Map<String, Value>> =
            serde_json::from_str(r#"{"a":1}"#).unwrap();
        assert!(matches!(v, StringOr::Structured(_)));
    }

    #[test]
    fn path_segment_แยก_string_กับ_object() {
        let segs: Vec<PathSegment> =
            serde_json::from_str(r#"["v1",{"type":"string","value":"tenants"}]"#).unwrap();
        assert_eq!(segs.len(), 2);
        assert!(matches!(&segs[0], PathSegment::Str(s) if s == "v1"));
        assert!(matches!(
            &segs[1],
            PathSegment::Segment(PathVariable {
                value: Some(v),
                ..
            }) if v == "tenants"
        ));
    }
}
