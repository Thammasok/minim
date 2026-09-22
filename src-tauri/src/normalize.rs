//! Normalizer ของ Postman Collection Format v2.1
//!
//! ตัวแปลงจาก polymorphic wire model (T-004) ให้เป็นรูปร่างมาตรฐานสำหรับ view —
//! พอร์ตมาจาก `.claude/docs/postman-collection.ts` (`getUrlString` / `getHeaders` /
//! `getScriptSource` / `getDescription`) ซึ่ง CLAUDE.md ตั้งให้เป็น contract จริง
//! ถ้า schema อนุญาต field หลายรูปทรง (url / header / description / exec / host /
//! path) ห้าม code ตัวอื่นอ่าน field พวกนั้นตรงๆ — ต้องผ่าน function ในไฟล์นี้เสมอ
//!
//! ความต่างจาก TS เป็นไปโดยตั้งใจ และระบุไว้ตรงที่เกิด:
//!   - `headers` บรรทัดที่ไม่มี `:` จะถูกข้ามและเพิ่ม `LoadWarning::MalformedRawHeaderLine`
//!     (TS ทำ `{ key, value: '' }` เงียบๆ แทน) — ตาม acceptance ของ T-006
//!   - `headers` บรรทัดที่ key ว่าง (เช่น `: orphan-value` ขึ้นต้นด้วย `:`) ยังคงให้
//!     `Header { key: "", .. }` เหมือน TS แต่เพิ่ม `LoadWarning::MalformedRawHeaderLine`
//!     ให้รู้ว่าผิดปกติด้วย (TC-UNIT-010 กำหนดไม่ให้ drop ทิ้ง)
//!   - `url_to_string` มอง `raw: ""` เหมือนไม่มี raw แล้วประกอบใหม่จาก parts —
//!     ตรงกับ truthiness ของ TS (`if (url.raw)`) และ TC-UNIT-006

use crate::postman::model::{Description, Header, Script, Url};
use crate::postman::polymorphic::{PathSegment, StringOr};

/// คำเตือนระหว่างการโหลด (FR-009) — เก็บรวมเป็น `Vec<LoadWarning>` ต่อการโหลด
/// เพื่อให้ collection ที่ "ประหลาด" ยังเปิดได้ แล้ว UI โชว์สาเหตุแทนที่จะเงียบ
///
/// หมายเหตุ: `Copy` ถูกลบออกเมื่อ T-007 เพิ่ม `DuplicateVariableKey` ซึ่งพก `String`
/// (design.md §LoadWarning ระบุให้แต่ละ variant พก `{ node_id?, detail }`)
///
/// อนาคต: T-008/T-009 จะเพิ่ม `UnknownAuthType`, `UnknownBodyMode`,
/// `ItemNeitherGroupNorRequest` และ depth-cap variants
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoadWarning {
    /// บรรทัด raw header ที่ไม่มี `:` — ข้ามบรรทัดนั้นแล้วเตือน
    MalformedRawHeaderLine,
    /// ตัวแปรระดับ collection ประกาศ `key` ซ้ำ — ใช้ key ตัวแรก แล้วเตือนให้รู้ว่า
    /// ตัวหลังถูกมองข้าม (เจอที่ index pass — TC-U ของ T-007)
    DuplicateVariableKey { key: String },
}

/// url ที่เป็นได้ทั้ง string และ `Url` — คืน string สำหรับแสดงเสมอ
///
/// ถ้ามี `raw` (ไม่ใช่ string ว่าง) คืน raw ตรงๆ; ไม่มีก็ประกอบจาก
/// protocol/host/port/path ตาม TS `getUrlString` (path variable ใช้ field `value`,
/// query/hash ถูกทิ้งแบบเดียวกับ TS)
pub fn url_to_string(url: &Option<StringOr<Url>>) -> String {
    let Some(url) = url else {
        return String::new();
    };
    match url {
        StringOr::Str(s) => s.clone(),
        StringOr::Structured(url) => {
            if let Some(raw) = url.raw.as_deref().filter(|r| !r.is_empty()) {
                return raw.to_string();
            }

            let mut out = String::new();
            if let Some(protocol) = url.protocol.as_deref().filter(|p| !p.is_empty()) {
                out.push_str(protocol);
                out.push_str("://");
            }
            match &url.host {
                Some(StringOr::Str(host)) => out.push_str(host),
                Some(StringOr::Structured(host)) => out.push_str(&host.join(".")),
                None => {}
            }
            if let Some(port) = url.port.as_deref().filter(|p| !p.is_empty()) {
                out.push(':');
                out.push_str(port);
            }
            let path = match &url.path {
                Some(StringOr::Str(path)) => path.clone(),
                Some(StringOr::Structured(segments)) => segments
                    .iter()
                    .map(|segment| match segment {
                        PathSegment::Str(s) => s.as_str(),
                        PathSegment::Segment(path_variable) => {
                            path_variable.value.as_deref().unwrap_or("")
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("/"),
                None => String::new(),
            };
            if !path.is_empty() {
                out.push('/');
                out.push_str(&path);
            }
            out
        }
    }
}

/// header ที่เป็นได้ทั้ง array และ raw block (string) — คืน `Vec<Header>` เสมอ
/// พร้อม `Vec<LoadWarning>` ที่เจอระหว่างแยก
///
/// แยก raw block ด้วย `\r?\n`, ข้ามบรรทัดว่าง, แยก key/value ที่ `:` ตัวแรก
/// เท่านั้น (ค่าที่มี `:` อยู่ข้างในต้องรอด — TC-U-021) แล้ว trim key/value
pub fn headers(header: &Option<StringOr<Vec<Header>>>) -> (Vec<Header>, Vec<LoadWarning>) {
    match header {
        Some(StringOr::Str(raw)) => {
            let mut parsed = Vec::new();
            let mut warnings = Vec::new();
            for line in raw.lines() {
                if line.is_empty() {
                    continue;
                }
                match line.find(':') {
                    Some(idx) => {
                        let key = line[..idx].trim();
                        let value = line[idx + 1..].trim();
                        if key.is_empty() {
                            warnings.push(LoadWarning::MalformedRawHeaderLine);
                        }
                        parsed.push(Header {
                            key: key.to_string(),
                            value: value.to_string(),
                            ..Default::default()
                        });
                    }
                    None => warnings.push(LoadWarning::MalformedRawHeaderLine),
                }
            }
            (parsed, warnings)
        }
        Some(StringOr::Structured(list)) => (list.clone(), Vec::new()),
        None => (Vec::new(), Vec::new()),
    }
}

/// script — คืน source code เป็น string เดียว
///
/// `exec` ที่เป็น array join ด้วย `\n`, ที่เป็น string คืนตามเดิม, ไม่มีแล้วคืน ""
pub fn script_source(script: &Script) -> String {
    match &script.exec {
        Some(StringOr::Str(s)) => s.clone(),
        Some(StringOr::Structured(lines)) => lines.join("\n"),
        None => String::new(),
    }
}

/// description ที่เป็นได้ทั้ง string และ object — คืน string เสมอ
pub fn description(desc: &Option<StringOr<Description>>) -> String {
    match desc {
        Some(StringOr::Str(s)) => s.clone(),
        Some(StringOr::Structured(d)) => d.content.clone().unwrap_or_default(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::postman::model::{Description, Header, Script, Url};
    use crate::postman::polymorphic::{PathSegment, PathVariable, StringOr};

    /// TC-U-018 — url มี raw ต้องคืน raw ตามเดิม ไม่สนใจ parts ข้างอื่น
    #[test]
    fn tc_u_018_url_to_string_prefers_raw() {
        let url = Some(StringOr::Structured(Url {
            raw: Some("https://a.com/x?y=1".to_string()),
            host: Some(StringOr::Structured(
                ["a", "com"].map(String::from).to_vec(),
            )),
            ..Default::default()
        }));
        assert_eq!(url_to_string(&url), "https://a.com/x?y=1");
    }

    /// TC-U-019 — ไม่มี raw ประกอบจาก protocol/host/port/path เรียงตามลำดับ
    #[test]
    fn tc_u_019_url_to_string_reassembles_parts() {
        let url = Some(StringOr::Structured(Url {
            protocol: Some("https".to_string()),
            host: Some(StringOr::Structured(
                ["api", "example", "com"].map(String::from).to_vec(),
            )),
            port: Some("8443".to_string()),
            path: Some(StringOr::Structured(vec![
                PathSegment::Str("v1".to_string()),
                PathSegment::Str("users".to_string()),
            ])),
            ..Default::default()
        }));
        assert_eq!(url_to_string(&url), "https://api.example.com:8443/v1/users");
    }

    /// TC-U-020 — url object เปล่าทุก field ต้องคืน "" ไม่ panic
    #[test]
    fn tc_u_020_url_to_string_empty_url_is_empty_string() {
        let url = Some(StringOr::Structured(Url::default()));
        assert_eq!(url_to_string(&url), "");
        assert_eq!(url_to_string(&None), "");
    }

    /// TC-U-006 (test-design) — raw: "" ต้องประกอบใหม่ ไม่คืน ""
    #[test]
    fn tc_u_006_raw_empty_falls_back_to_reassembly() {
        let url = Some(StringOr::Structured(Url {
            raw: Some(String::new()),
            host: Some(StringOr::Str("api.example.com".to_string())),
            path: Some(StringOr::Structured(vec![PathSegment::Str(
                "ping".to_string(),
            )])),
            ..Default::default()
        }));
        assert_eq!(url_to_string(&url), "api.example.com/ping");
    }

    /// path variable รูป object ใช้ field value ต่อเข้ากับ path
    #[test]
    fn url_to_string_uses_path_variable_value() {
        let url = Some(StringOr::Structured(Url {
            host: Some(StringOr::Str("api.example.com".to_string())),
            path: Some(StringOr::Structured(vec![
                PathSegment::Str("v1".to_string()),
                PathSegment::Segment(PathVariable {
                    value: Some("tenants".to_string()),
                    ..Default::default()
                }),
            ])),
            ..Default::default()
        }));
        assert_eq!(url_to_string(&url), "api.example.com/v1/tenants");
    }

    /// path รูป string ก็ต่อ '/'; url ที่เป็น string ตรงๆ คืนตามเดิม
    #[test]
    fn url_to_string_handles_string_path_and_string_url() {
        let path = Some(StringOr::Structured(Url {
            host: Some(StringOr::Str("a.com".to_string())),
            path: Some(StringOr::Str("x/y".to_string())),
            ..Default::default()
        }));
        assert_eq!(url_to_string(&path), "a.com/x/y");

        assert_eq!(
            url_to_string(&Some(StringOr::Str("https://b.test".to_string()))),
            "https://b.test"
        );
    }

    /// TC-U-021 — แยกที่ `:` ตัวแรกเท่านั้น ค่าที่เป็น url มี `:` ข้างในรอด
    #[test]
    fn tc_u_021_raw_header_value_containing_colon_survives() {
        let raw = Some(StringOr::Str("Location: https://a.com/x".to_string()));
        let (headers, warnings) = headers(&raw);
        assert_eq!(
            headers,
            vec![Header {
                key: "Location".to_string(),
                value: "https://a.com/x".to_string(),
                ..Default::default()
            }]
        );
        assert!(warnings.is_empty());
    }

    /// TC-U-022 — บรรทัดที่ไม่มี `:` ถูกข้ามและลง MalformedRawHeaderLine ไม่เงียบ
    #[test]
    fn tc_u_022_raw_header_line_without_colon_warns() {
        let raw = Some(StringOr::Str(
            "Accept: application/json\ngarbage-line".to_string(),
        ));
        let (headers, warnings) = headers(&raw);
        assert_eq!(headers.len(), 1);
        assert_eq!(headers[0].key, "Accept");
        assert_eq!(headers[0].value, "application/json");
        assert_eq!(warnings, vec![LoadWarning::MalformedRawHeaderLine]);
    }

    /// TC-UNIT-008 (test-design) — CRLF กับบรรทัดว่างต้องไม่สร้าง entry ปลอม
    #[test]
    fn tc_unit_008_raw_header_block_crlf_and_blank_lines() {
        let raw = Some(StringOr::Str(
            "Accept: application/json\r\n\r\nX-Trace: abc\r\n".to_string(),
        ));
        let (headers, warnings) = headers(&raw);
        assert_eq!(headers.len(), 2);
        assert_eq!(headers[0].key, "Accept");
        assert_eq!(headers[0].value, "application/json");
        assert_eq!(headers[1].key, "X-Trace");
        assert_eq!(headers[1].value, "abc");
        assert!(warnings.is_empty());
    }

    /// TC-UNIT-009 (test-design) — trim key/value ขอบข้าง แต่ไม่แตะ whitespace ข้างใน
    #[test]
    fn tc_unit_009_key_value_trimmed_inner_whitespace_kept() {
        let raw = Some(StringOr::Str("  X-Note :  hello   world  ".to_string()));
        let (headers, warnings) = headers(&raw);
        assert_eq!(
            headers,
            vec![Header {
                key: "X-Note".to_string(),
                value: "hello   world".to_string(),
                ..Default::default()
            }]
        );
        assert!(warnings.is_empty());
    }

    /// TC-UNIT-010 (test-design) — key ว่าง (ขึ้นต้น `:`) ยังได้ entry + คำเตือน
    #[test]
    fn tc_unit_010_empty_key_header_warns_but_is_kept() {
        let raw = Some(StringOr::Str(": orphan-value".to_string()));
        let (headers, warnings) = headers(&raw);
        assert_eq!(
            headers,
            vec![Header {
                key: String::new(),
                value: "orphan-value".to_string(),
                ..Default::default()
            }]
        );
        assert_eq!(warnings, vec![LoadWarning::MalformedRawHeaderLine]);
    }

    /// TC-UNIT-011 (test-design) — array form ผ่านไปตามเดิม ทั้ง disabled/description
    #[test]
    fn tc_unit_011_header_array_form_passes_through_verbatim() {
        let header_list = Some(StringOr::Structured(vec![Header {
            key: "A".to_string(),
            value: "1".to_string(),
            disabled: Some(true),
            description: Some(StringOr::Structured(Description {
                content: Some("why".to_string()),
                ..Default::default()
            })),
            ..Default::default()
        }]));
        let (out, warnings) = headers(&header_list);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].key, "A");
        assert_eq!(out[0].value, "1");
        assert_eq!(out[0].disabled, Some(true));
        assert_eq!(description(&out[0].description), "why");
        assert!(warnings.is_empty());
    }

    /// TC-UNIT-012 (test-design) — รูปแบบว่าง/ไม่มีคืนรายการเปล่า ไม่เตือน
    #[test]
    fn tc_unit_012_empty_and_absent_header_forms() {
        let (out, warnings) = headers(&Some(StringOr::Str(String::new())));
        assert!(out.is_empty());
        assert!(warnings.is_empty());

        let (out, warnings) = headers(&None);
        assert!(out.is_empty());
        assert!(warnings.is_empty());
    }

    /// TC-U-023 — exec array form join ด้วย "\n"
    #[test]
    fn tc_u_023_script_source_joins_exec_lines() {
        let script = Script {
            exec: Some(StringOr::Structured(vec![
                "const a = 1;".to_string(),
                "pm.test('x', ok);".to_string(),
            ])),
            ..Default::default()
        };
        assert_eq!(script_source(&script), "const a = 1;\npm.test('x', ok);");
    }

    /// exec string form คืนตามเดิม, ไม่มี exec คืน ""
    #[test]
    fn script_source_handles_string_and_absent_exec() {
        let script = Script {
            exec: Some(StringOr::Str("pm.test('y', ok);".to_string())),
            ..Default::default()
        };
        assert_eq!(script_source(&script), "pm.test('y', ok);");

        let script = Script::default();
        assert_eq!(script_source(&script), "");
    }

    /// TC-U-024 — description object form คืน content
    #[test]
    fn tc_u_024_description_unwraps_object_content() {
        let desc = Some(StringOr::Structured(Description {
            content: Some("Creates an invoice.".to_string()),
            type_: Some("text/markdown".to_string()),
            ..Default::default()
        }));
        assert_eq!(description(&desc), "Creates an invoice.");
    }

    /// description string form คืนตามเดิม, object ที่ไม่มี content คืน "", ว่างคืน ""
    #[test]
    fn description_is_total() {
        assert_eq!(
            description(&Some(StringOr::Str("plain".to_string()))),
            "plain"
        );
        assert_eq!(
            description(&Some(StringOr::Structured(Description::default()))),
            ""
        );
        assert_eq!(description(&None), "");
    }
}
