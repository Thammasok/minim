//! Node index — แปลง item tree แบบ recursive ให้เป็น arena แบบแบนๆ
//!
//! สิ่งที่ serde ออกมา (`PostmanCollection.item: Vec<Item>`) ยังเป็น tree ที่ซ้อนกัน
//! ได้ไม่จำกัดชั้น (FR-014) แต่ UI และ `get_node_detail` ต้องการค้นแบบ O(1) และ
//! เรียงตามลำดับเอกสาร (FR-018) จึง flatten ทิ้งเป็น arena `Vec<Node>` พร้อม
//! `NodeId` แบบตำแหน่งต่อ node (ADR-006) — เทียบเท่า `walkRequests` ของฝั่ง
//! TypeScript แต่ทำงานกับทุก node (collection / folder / request) ไม่ใช่แค่ leaf
//!
//! เดิน tree ด้วย **explicit stack** (`Vec<Frame>`) ไม่ใช้ recursion เพื่อให้
//! ซ้อนลึก 512 ชั้น (TC-U-031) หรือลึกกว่านั้นไม่ทำ stack overflow (FR-008)
//!
//! ใน pass เดียวกันยังทำของอีกสองอย่าง:
//!   - หา **effective auth** ของทุก node ตาม FR-030 — ของตัวเอง ก่อน folder แม่
//!     ใกล้ที่สุด แล้ว collection — พร้อมจด **source** ว่าได้จากระดับไหน (Own /
//!     Folder(id) / Collection) เพราะ ux-design.md ให้ UI ติดป้าย "inherited from"
//!   - สร้าง **variable reference index** — แต่ละ request เอ่ยถึง `{{name}}` ตัวไหนบ้าง
//!     (url + headers + body raw + event scripts) และนับย้อนกลับต่อชื่อ เพื่อให้
//!     หน้าจอ S4 รู้ว่า collection variable ตัวใดถูกใช้กี่ครั้ง

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::str::FromStr;

use serde::Serialize;

use crate::normalize::{self, LoadWarning};
use crate::postman::model::{Auth, Item, ItemRequest, PostmanCollection};
use crate::postman::polymorphic::StringOr;

/// NodeId แบบตำแหน่งตาม ADR-006 — เก็บ dotted path ของตำแหน่งใน document order
/// เช่น `"0"`, `"1.0"`, `"1.0.3"` (root.children[0] = "0", children[1].children[0] = "1.0")
///
/// เป็น **string ของตำแหน่ง** ไม่ใช่ UUID และไม่ใช่ `id` ของ Postman (v2.1 กำหนด `id`
/// เป็น optional และ real exports มักไม่มีหรือซ้ำกัน) จึง total, unique และเสถียร
/// ข้ามการโหลดไฟล์เดิมซ้ำ (FR-016)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
pub struct NodeId(String);

impl NodeId {
    /// node รากของคอลเล็กชัน (arena[0]) — id ว่าง `""`
    pub fn root() -> Self {
        NodeId(String::new())
    }

    /// `""` เมื่อเป็น node รากของคอลเล็กชัน
    pub fn is_root(&self) -> bool {
        self.0.is_empty()
    }

    /// ลูกตัวที่ `index` ของ node นี้ — root.child(0) = "0", ("1").child(0) = "1.0"
    pub fn child(&self, index: usize) -> Self {
        if self.0.is_empty() {
            NodeId(index.to_string())
        } else {
            NodeId(format!("{}.{}", self.0, index))
        }
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl FromStr for NodeId {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(NodeId(s.to_string()))
    }
}

/// ประเภทของ node ใน arena
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    /// node รากที่แทน collection เอง (S4)
    Collection,
    /// folder — มี `children`
    Folder,
    /// request leaf — node ที่ยิงได้จริง
    Request,
}

/// ระดับที่ auth ที่แสดงผลได้มาจาก (FR-030) — UI เอาไปติดป้าย "inherited from"
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthSource {
    /// auth ของ node ตัวเอง
    Own,
    /// สืบทอดจาก folder ที่ใกล้ที่สุด — เก็บ `NodeId` ของ folder ตัวที่ให้
    /// (T-008 จะ map ไปชื่อ folder ให้ `AuthView.source = Folder(name)`)
    Folder(NodeId),
    /// สืบทอดจากระดับ collection
    Collection,
    /// ไม่มี auth ที่ไหนเลย (null/absent ตลอดสาย)
    None,
}

/// effective auth ของ node หนึ่ง — ประเภท + ระดับที่มันได้มา
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedAuth {
    /// ค่า `auth.type` (เช่น `"bearer"`, `"basic"`, `"noauth"`) — `None` เมื่อไม่มี auth
    pub auth_type: Option<String>,
    /// ระดับที่ auth นี้ถูกสืบทอด/เข้าครอบครองมา
    pub source: AuthSource,
}

/// หนึ่ง node ใน arena — struct-of-views ให้ T-008 map ไป DTO ได้ตรงๆ
#[derive(Debug, Clone)]
pub struct Node {
    pub node_id: NodeId,
    pub kind: NodeKind,
    /// ชื่อ (folder/request/collection name) — ไม่มีชื่อเป็น `""` (unknown node ยังมี id)
    pub name: String,
    /// ลำดับในพี่น้องของตัวเอง (0-based) — ใช้ทำ aria-posinset กับ sort ได้ที่ T-015
    pub order: usize,
    pub parent: Option<NodeId>,
    /// ลูกๆ เรียงตามเอกสาร (folder/collection เท่านั้น)
    pub children: Vec<NodeId>,
    /// ชื่อ folder ราก → ใบ เรียงจากนอกสุด ข้างนอกสุดก่อน ไม่รวมตัวเอง (FR-015)
    pub folder_path: Vec<String>,
    /// ระดับใน tree (collection = 0, root child = 1, …)
    pub depth: usize,
    /// auth ที่ได้ผลจริง (ตัวเอง → folder แม่ → collection)
    pub effective_auth: ResolvedAuth,
    /// ชื่อ `{{var}}` ที่ request นี้เอ่ยถึง (ไม่ซ้ำ, เรียงตามที่เจอก่อน) — collection/folder ว่าง
    pub variable_refs: Vec<String>,
    /// wire node ต้นทาง — ย้ายเข้ามาเป็นของ arena แล้ว (folder ถูกเอาลูกออก) `None` ที่ collection
    pub wire: Option<Item>,
}

/// ผลลัพธ์ของ `build_index` — arena + index ครบทุกอย่างที่ T-008/T-009 ต้องใช้
#[derive(Debug, Clone)]
pub struct NodeIndex {
    /// arena — เรียง document order, depth-first; `nodes[0]` คือ collection node
    pub nodes: Vec<Node>,
    /// `NodeId` → ตำแหน่งใน `nodes` — `by_id` เป็น O(1)
    pub by_id: HashMap<NodeId, usize>,
    /// ป้ายชื่อ (`key`) ของ collection variables เรียงตามเอกสาร ไม่ซ้ำ (ตัวแรกชนะ)
    pub collection_var_names: Vec<String>,
    /// นับย้อนกลับจำนวนครั้งที่ทุก request เอ่ยถึง `{{name}}` — รวมชื่อที่ไม่ได้นิยามไว้ด้วย
    pub collection_var_counts: HashMap<String, usize>,
    /// ความลึกของ node ลึกสุด (collection depth 0)
    pub max_depth: usize,
    pub request_count: usize,
    pub folder_count: usize,
}

impl NodeIndex {
    /// O(1) lookup — `None` เมื่อไม่มี node นั้นใน arena
    pub fn by_id(&self, id: &NodeId) -> Option<&Node> {
        self.by_id.get(id).map(|&i| &self.nodes[i])
    }

    /// จำนวน node ทั้งหมดใน arena
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

/// งานค้างหนึ่ง node — ข้อมูลที่จำเป็นต่อการสร้าง node + สิ่งที่สืบทอดไปให้ลูก
struct Work {
    item: Item,
    parent_id: NodeId,
    /// index ของ node แม่ใน arena — ใช้ `nodes[parent_idx].children.push(...)`
    /// แทนการตามหา `by_id` (การันตีว่าแม่ถูก insert เข้า arena ก่อนงานของลูก)
    parent_idx: usize,
    /// ตำแหน่งในพี่น้อง (index ใน array ของ folder แม่) — ใช้ทำ `NodeId` กับ `order`
    position: usize,
    folder_path: Vec<String>,
    inherit_auth_type: Option<String>,
    inherit_auth_source: Option<AuthSource>,
    /// depth ของ parent (node ที่สร้างจะได้ depth = นี้ + 1)
    depth: usize,
}

/// งานของลูกๆ ที่รอ folder แม่ได้ index ใน arena ก่อน — ใช้ผลัด push เข้า stack
/// หลังจาก `nodes.push` เสร็จ เพื่อให้ `parent_idx` ของ Work ชี้ node ที่มีอยู่จริง
struct PendingChildren {
    /// (position, item) ตามลำดับ document ของลูกใน array ของ folder
    items: Vec<(usize, Item)>,
    folder_path: Vec<String>,
    inherit_auth_type: Option<String>,
    inherit_auth_source: Option<AuthSource>,
    depth: usize,
}

/// flatten item tree → arena (มือเปล่า ไม่มี recursion ลึก) + ทำ variable index พร้อมๆ กัน
///
/// กิน `collection.item` (ย้ายลูกๆ เข้า arena) — collection ที่ส่งเข้ายังใช้
/// `info` / `variable` / `auth` ต่อได้ แต่ `item` จะว่างเพราะ node ทั้งหมดอยู่
/// ใน arena แล้ว
pub fn build_index(collection: &mut PostmanCollection) -> (NodeIndex, Vec<LoadWarning>) {
    let mut warnings = Vec::new();
    let root_items = std::mem::take(&mut collection.item);

    let root_auth_type = collection.auth.as_ref().map(|a| a.type_.clone());
    let root_auth_source = collection.auth.as_ref().map(|_| AuthSource::Collection);
    let root_auth = ResolvedAuth {
        auth_type: root_auth_type.clone(),
        source: root_auth_source.clone().unwrap_or(AuthSource::None),
    };

    let root_id = NodeId::root();
    // collection node ก่อนเสมอ — อยู่ใน arena และใน by_id เหมือน node อื่น
    let mut nodes = vec![Node {
        node_id: root_id.clone(),
        kind: NodeKind::Collection,
        name: collection.info.name.clone(),
        order: 0,
        parent: None,
        children: Vec::new(),
        folder_path: Vec::new(),
        depth: 0,
        effective_auth: root_auth,
        variable_refs: Vec::new(),
        wire: None,
    }];
    let mut by_id: HashMap<NodeId, usize> = HashMap::new();
    by_id.insert(root_id.clone(), 0);

    // กดทุก root item ไว้ก้อนเดียว แล้วค่อย pop — push กลับลำดับเพื่อให้ document
    // order ยืนเหมือนเดิมตอน pop (DFS preorder: ลูกของ folder ทั้งหมดได้ node ก่อน
    // ป้า/ลุง ของมัน) — ไม่มี recursion ลึกในตัว walk เอง
    let mut stack: Vec<Work> = root_items
        .into_iter()
        .enumerate()
        .rev()
        .map(|(k, item)| Work {
            item,
            parent_id: root_id.clone(),
            parent_idx: 0,
            position: k,
            folder_path: Vec::new(),
            inherit_auth_type: root_auth_type.clone(),
            inherit_auth_source: root_auth_source.clone(),
            depth: 0,
        })
        .collect();

    let mut max_depth = 0usize;
    let mut request_count = 0usize;
    let mut folder_count = 0usize;
    let mut collection_var_counts: HashMap<String, usize> = HashMap::new();

    while let Some(work) = stack.pop() {
        // invariant: งานใน stack ทุกชิ้นมี parent_idx ชี้ node แม่ที่สร้างเสร็จไปแล้ว
        // (ราก = 0, ลูกของ folder ถูก push ต่อเมื่อ folder ได้ index ใน arena แล้ว)
        debug_assert!(work.parent_idx < nodes.len());

        let child_id = work.parent_id.child(work.position);
        let child_depth = work.depth + 1;
        max_depth = max_depth.max(child_depth);

        let (node, pending) = match work.item {
            Item::Request(request) => {
                request_count += 1;
                let effective_auth = resolve_auth(
                    own_auth(&request),
                    &work.inherit_auth_type,
                    &work.inherit_auth_source,
                );
                let refs = scan_request_vars(&request, &mut collection_var_counts, &mut warnings);
                (
                    Node {
                        node_id: child_id.clone(),
                        kind: NodeKind::Request,
                        name: request.name.clone().unwrap_or_default(),
                        order: work.position,
                        parent: Some(work.parent_id.clone()),
                        children: Vec::new(),
                        folder_path: work.folder_path.clone(),
                        depth: child_depth,
                        effective_auth,
                        variable_refs: refs,
                        wire: Some(Item::Request(request)),
                    },
                    None,
                )
            }
            Item::Group(mut group) => {
                folder_count += 1;
                let effective_auth = resolve_auth(
                    group.auth.as_ref(),
                    &work.inherit_auth_type,
                    &work.inherit_auth_source,
                );
                let mut next_path = work.folder_path.clone();
                next_path.push(group.name.clone().unwrap_or_default());
                let child_items = std::mem::take(&mut group.item);
                // rebase: ลูกที่สืบทอด auth จาก folder ตัวนี้ต้องอ้าง folder ตัวนี้
                // (ไม่ใช่ "Own" ซึ่งหมายถึง folder เอง) ส่วนที่สืบทอดต่อลงไปก็เป็น
                // folder ผู้ประกาศเดิม ไม่ใช่ folder ตัวกลาง
                let next_source = match effective_auth.source {
                    AuthSource::Own => AuthSource::Folder(child_id.clone()),
                    ref shown => shown.clone(),
                };
                let next_type = effective_auth.auth_type.clone();
                // ยังไม่ push งานของลูกเข้า stack — folder node ยังไม่มี index ใน
                // arena จนกว่าจะ `nodes.push` เสร็จ (ขั้นตอนด้านล่าง) จึงคืนข้อมูล
                // ไว้เป็น `pending` และ push งานของลูกด้วย `parent_idx` ที่แน่ชัด
                (
                    Node {
                        node_id: child_id.clone(),
                        kind: NodeKind::Folder,
                        name: group.name.clone().unwrap_or_default(),
                        order: work.position,
                        parent: Some(work.parent_id.clone()),
                        children: Vec::new(),
                        folder_path: work.folder_path.clone(),
                        depth: child_depth,
                        effective_auth,
                        variable_refs: Vec::new(),
                        wire: Some(Item::Group(group)),
                    },
                    Some(PendingChildren {
                        items: child_items.into_iter().enumerate().collect(),
                        folder_path: next_path,
                        inherit_auth_type: next_type,
                        inherit_auth_source: Some(next_source),
                        depth: child_depth,
                    }),
                )
            }
        };

        let idx = nodes.len();
        nodes.push(node);
        by_id.insert(child_id.clone(), idx);
        // push งานของลูกเข้าหลังจาก folder มี `idx` แล้ว — ลูกทุกชิ้นจะ pop มาพร้อม
        // `parent_idx = idx` ซึ่งอ้าง node ที่สร้างเสร็จใน arena เรียบร้อยเสมอ
        if let Some(pcd) = pending {
            for (j, child_item) in pcd.items.into_iter().rev() {
                stack.push(Work {
                    item: child_item,
                    parent_id: child_id.clone(),
                    parent_idx: idx,
                    position: j,
                    folder_path: pcd.folder_path.clone(),
                    inherit_auth_type: pcd.inherit_auth_type.clone(),
                    inherit_auth_source: pcd.inherit_auth_source.clone(),
                    depth: pcd.depth,
                });
            }
        }
        nodes[work.parent_idx].children.push(child_id);
    }

    // collection variables — ประกาศ key ซ้ำ → เตือน (ใช้ตัวแรก)
    let mut collection_var_names = Vec::new();
    let mut seen_keys = HashSet::new();
    for variable in collection.variable.iter().flatten() {
        let Some(key) = variable.key.as_deref() else {
            continue;
        };
        if !seen_keys.insert(key) {
            warnings.push(LoadWarning::DuplicateVariableKey {
                key: key.to_string(),
            });
        } else {
            collection_var_names.push(key.to_string());
        }
    }

    (
        NodeIndex {
            nodes,
            by_id,
            collection_var_names,
            collection_var_counts,
            max_depth,
            request_count,
            folder_count,
        },
        warnings,
    )
}

/// auth ของ request เอง — `request` เป็น string URL เต็มๆ ได้ (ไม่มี auth)
fn own_auth(request: &ItemRequest) -> Option<&Auth> {
    match &request.request {
        StringOr::Structured(req) => req.auth.as_ref(),
        StringOr::Str(_) => None,
    }
}

/// effective auth ของ node: ของตัวเองก่อน → สืบทอดจาก frame (folder แม่/collection)
fn resolve_auth(
    own: Option<&Auth>,
    inherit_type: &Option<String>,
    inherit_source: &Option<AuthSource>,
) -> ResolvedAuth {
    match own {
        Some(auth) => ResolvedAuth {
            auth_type: Some(auth.type_.clone()),
            source: AuthSource::Own,
        },
        None => ResolvedAuth {
            auth_type: inherit_type.clone(),
            source: inherit_source.clone().unwrap_or(AuthSource::None),
        },
    }
}

/// เอา `{{name}}` ทั้งหมดจาก request (url + headers + body raw + event scripts)
/// — ส่งชื่อซ้ำได้ (นับ occurrence) ผู้เรียกเป็นคน dedup เอง
fn scan_request_vars(
    request: &ItemRequest,
    counts: &mut HashMap<String, usize>,
    warnings: &mut Vec<LoadWarning>,
) -> Vec<String> {
    let mut occurrences = Vec::new();

    let url_text = match &request.request {
        StringOr::Str(raw) => raw.clone(),
        StringOr::Structured(req) => normalize::url_to_string(&req.url),
    };
    scan_vars(&url_text, &mut occurrences);

    if let StringOr::Structured(req) = &request.request {
        let (headers, header_warnings) = normalize::headers(&req.header);
        warnings.extend(header_warnings);
        for header in &headers {
            scan_vars(&header.value, &mut occurrences);
        }
        if let Some(body) = &req.body {
            if let Some(raw) = &body.raw {
                scan_vars(raw, &mut occurrences);
            }
        }
    }

    for event in request.event.iter().flatten() {
        if let Some(script) = event.script.as_ref() {
            let source = normalize::script_source(script);
            scan_vars(&source, &mut occurrences);
        }
    }

    // refs ต่างหาก (ไม่ซ้ำ) จาก occurrences (ซ้ำได้) — นับทุก occurrence ลง counts
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    for name in occurrences {
        *counts.entry(name.clone()).or_insert(0) += 1;
        if seen.insert(name.clone()) {
            refs.push(name);
        }
    }
    refs
}

/// manual scan หา `{{name}}` — เจอ `{{`, ลากจน `}}`, trim — ไม่ใช้ regex
fn scan_vars(text: &str, out: &mut Vec<String>) {
    let mut rest = text;
    while let Some(start) = rest.find("{{") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else {
            break;
        };
        let name = after[..end].trim();
        if !name.is_empty() {
            out.push(name.to_string());
        }
        rest = &after[end + 2..];
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::json;

    const SCHEMA: &str = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

    fn index_of(value: serde_json::Value) -> NodeIndex {
        let mut collection: PostmanCollection = serde_json::from_value(value).unwrap();
        build_index(&mut collection).0
    }

    fn node<'a>(idx: &'a NodeIndex, name: &str) -> &'a Node {
        idx.nodes
            .iter()
            .find(|n| n.name == name)
            .unwrap_or_else(|| panic!("no node named {name:?} in {:#?}", idx.nodes))
    }

    /// TC-U-025 — NodeIds ตามตำแหน่ง document order แบบ depth-first:
    /// `[Folder A [], Folder B [Request R]]` → A="0", B="1", R="1.0"
    #[test]
    fn tc_u_025_node_ids_follow_document_position_depth_first() {
        let idx = index_of(json!({
            "info": { "name": "Collection", "schema": SCHEMA },
            "item": [
                { "name": "Folder A", "item": [] },
                { "name": "Folder B", "item": [
                    { "name": "Request R", "request": { "method": "GET", "url": "https://x.test" } }
                ] }
            ]
        }));
        assert_eq!(node(&idx, "Collection").node_id.to_string(), "");
        assert_eq!(node(&idx, "Folder A").node_id.to_string(), "0");
        assert_eq!(node(&idx, "Folder B").node_id.to_string(), "1");
        assert_eq!(node(&idx, "Request R").node_id.to_string(), "1.0");
    }

    /// FR-018 — arena เรียงตาม document order ทุกระดับ ไม่ re-sort — collection node ก่อน
    #[test]
    fn arena_preserves_document_order() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "First", "request": { "method": "GET", "url": "https://a.test" } },
                { "name": "Group", "item": [
                    { "name": "Inner-0", "request": { "method": "GET", "url": "https://b.test" } },
                    { "name": "Inner-1", "request": { "method": "POST", "url": "https://c.test" } }
                ] },
                { "name": "Last", "request": { "method": "GET", "url": "https://d.test" } }
            ]
        }));
        let names: Vec<&str> = idx.nodes.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, ["C", "First", "Group", "Inner-0", "Inner-1", "Last"]);
        assert_eq!(
            idx.by_id(&NodeId::root()).unwrap().kind,
            NodeKind::Collection
        );
    }

    /// TC-U-026 — folder path เรียงจากราก ข้างนอกสุดก่อน ไม่รวม request ตัวเอง:
    /// Invoices > Drafts > Batch > "Create" → ["Invoices", "Drafts", "Batch"]
    #[test]
    fn tc_u_026_folder_path_ordered_from_root() {
        let idx = index_of(json!({
            "info": { "name": "Acme", "schema": SCHEMA },
            "item": [
                { "name": "Invoices", "item": [
                    { "name": "Drafts", "item": [
                        { "name": "Batch", "item": [
                            { "name": "Create", "request": { "method": "POST", "url": "https://acme.test/api/invoices" } }
                        ] }
                    ] }
                ] }
            ]
        }));
        let create = node(&idx, "Create");
        assert_eq!(create.folder_path, ["Invoices", "Drafts", "Batch"]);
        assert_eq!(create.depth, 4);
        let drafts = node(&idx, "Drafts");
        assert_eq!(drafts.folder_path, ["Invoices"]);
    }

    /// TC-U-027 — request ไม่มี auth สืบทอดจาก collection: collection=bearer,
    /// folder=none, request=none → bearer, source Collection
    #[test]
    fn tc_u_027_request_inherits_collection_auth() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "tok" }] },
            "item": [
                { "name": "Folder", "item": [
                    { "name": "Request", "request": { "method": "GET", "url": "https://a.test" } }
                ] }
            ]
        }));
        let req = node(&idx, "Request");
        assert_eq!(req.effective_auth.auth_type.as_deref(), Some("bearer"));
        assert_eq!(req.effective_auth.source, AuthSource::Collection);
    }

    /// TC-U-028 — folder ใกล้สุดชนะ collection: collection=bearer, folder=basic,
    /// request=none → basic, source Folder(id ของ folder นั้น)
    #[test]
    fn tc_u_028_nearest_folder_wins_over_collection() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "tok" }] },
            "item": [
                { "name": "Auth", "auth": { "type": "basic", "basic": [{ "key": "username", "value": "u" }] }, "item": [
                    { "name": "Request", "request": { "method": "GET", "url": "https://a.test" } }
                ] }
            ]
        }));
        let req = node(&idx, "Request");
        assert_eq!(req.effective_auth.auth_type.as_deref(), Some("basic"));
        assert_eq!(
            req.effective_auth.source,
            AuthSource::Folder("0".parse().unwrap())
        );
    }

    /// TC-U-029 — auth ของ request ชนะทุก ancestor: collection=bearer, folder=basic,
    /// request=apikey → apikey, source Own
    #[test]
    fn tc_u_029_request_own_auth_wins_over_every_ancestor() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "tok" }] },
            "item": [
                { "name": "Folder", "auth": { "type": "basic", "basic": [{ "key": "username", "value": "u" }] }, "item": [
                    { "name": "Request", "request": {
                        "method": "GET",
                        "url": "https://a.test",
                        "auth": { "type": "apikey", "apikey": [{ "key": "key", "value": "k" }] }
                    } }
                ] }
            ]
        }));
        let req = node(&idx, "Request");
        assert_eq!(req.effective_auth.auth_type.as_deref(), Some("apikey"));
        assert_eq!(req.effective_auth.source, AuthSource::Own);
    }

    /// 3.1 row 5 — `{"type":"noauth"}` คือการปิดแบบชัดเจน (Own) ไม่ใช่การสืบทอด
    #[test]
    fn noauth_is_explicit_own_not_inheritance() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "auth": { "type": "apikey", "apikey": [] },
            "item": [
                { "name": "Folder", "auth": { "type": "basic", "basic": [] }, "item": [
                    { "name": "Request", "request": {
                        "method": "GET", "url": "https://a.test",
                        "auth": { "type": "noauth", "noauth": [] }
                    } }
                ] }
            ]
        }));
        let req = node(&idx, "Request");
        assert_eq!(req.effective_auth.auth_type.as_deref(), Some("noauth"));
        assert_eq!(req.effective_auth.source, AuthSource::Own);
    }

    /// 3.1 row 6/7 — `auth: null` คือ "ไม่ระบุ" (สืบทอด) และ folder ห่างขึ้นไป 2 ระดับก็ยังชนะ
    #[test]
    fn null_auth_inherits_and_grandparent_folder_wins() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "auth": { "type": "apikey", "apikey": [] },
            "item": [
                { "name": "Outer", "auth": { "type": "hawk", "hawk": [] }, "item": [
                    { "name": "Inner", "item": [
                        { "name": "Request", "request": {
                            "method": "GET", "url": "https://a.test", "auth": null
                        } }
                    ] }
                ] }
            ]
        }));
        let req = node(&idx, "Request");
        assert_eq!(req.effective_auth.auth_type.as_deref(), Some("hawk"));
        // ผู้ประกาศคือ folder Outer (node id "0") — folder กลางที่ไม่มี auth ของตัวเอง
        // ไม่ถูกนับเป็นแหล่ง
        assert_eq!(
            req.effective_auth.source,
            AuthSource::Folder("0".parse().unwrap())
        );
    }

    /// TC-U-031 — folders ซ้อน 512 ชั้น ใช้ explicit stack จึงไม่ stack overflow และ
    /// รายงาน depth 512 (deepest folder depth = 512)
    #[test]
    fn tc_u_031_deeply_nested_folders_do_not_overflow_the_stack() {
        // สร้าง raw JSON string ด้วยมือ (ไม่สร้าง nested Value ซึ่ง serde_json::to_string
        // จะ recurse เอง) แล้ว parse ผ่าน serde_stacker (เลื่อน parse-recursion ขึ้น heap)
        // — ทั้งหมดรันบน thread ที่มี stack ใหญ่ เพราะ parse + drop ของ owned tree ลึกๆ
        // recurse ตามโครงสร้าง (serde/โครงสร้างเป็นเรื่อง T-011; ตัว walk ของงานนี้
        // เป็น iterative และผ่านได้แม้ stack เล็ก)
        with_big_stack(|| {
            let text = deep_string(511, r#"{"name":"level-511","item":[]}"#);
            let mut collection = parse_deep(&text);
            let (idx, _) = build_index(&mut collection);
            assert_eq!(idx.max_depth, 512);
            assert!(idx.nodes.len() >= 513); // collection + 512 folders
            assert_eq!(idx.folder_count, 512);
            assert_eq!(idx.request_count, 0);
        });
    }

    /// ใส่ leaf request ไว้ก้นสุดของ 512-folders — ยังไม่ overflow และ folder_path ครบ 512
    #[test]
    fn deep_nesting_with_leaf_request_survives() {
        with_big_stack(|| {
            let text = deep_string(
                512,
                r#"{"name":"Ping","request":{"method":"GET","url":"https://deep.test"}}"#,
            );
            let mut collection = parse_deep(&text);
            let (idx, _) = build_index(&mut collection);
            let ping = idx.nodes.iter().find(|n| n.name == "Ping").unwrap();
            assert_eq!(ping.depth, 513);
            assert_eq!(ping.folder_path.len(), 512);
            assert_eq!(ping.folder_path[0], "level-0");
            assert_eq!(ping.folder_path[511], "level-511");
            assert_eq!(idx.max_depth, 513);
        });
    }

    /// รัน `f` บน thread ที่มี stack 64 MB — test harness ให้ thread แค่ ~2 MB ซึ่ง
    /// ไม่พอสำหรับ parse/drop ของ tree ลึก; ตัว index เอง (build_index) เป็น iterative
    /// และไม่ได้อาศัย stack ใหญ่เลย
    fn with_big_stack<T>(f: impl FnOnce() -> T + Send + 'static) -> T
    where
        T: Send + 'static,
    {
        std::thread::Builder::new()
            .stack_size(64 * 1024 * 1024)
            .spawn(f)
            .expect("spawn big-stack thread")
            .join()
            .expect("big-stack thread panicked")
    }

    /// JSON: collection > 512 folder ซ้อนกัน (level-0..level-511 แต่ละชั้น item เดียว) >
    /// `leaf` — นับวงเล็บให้ตรงกัน พอ deserialize เสร็จต้องไม่มี trailing chars
    fn deep_string(folders: usize, leaf: &str) -> String {
        let mut text = String::new();
        text.push_str(r#"{"info":{"name":"Deep","schema":""#);
        text.push_str(SCHEMA);
        text.push_str(r#""},"item":["#);
        for i in 0..folders {
            text.push_str(&format!(r#"{{"name":"level-{i}","item":["#));
        }
        text.push_str(leaf);
        for _ in 0..=folders {
            text.push(']');
            text.push('}');
        }
        text
    }

    /// parse โดยปิด serde recursion limit แล้วถอดผ่าน serde_stacker (heap-backed stack)
    fn parse_deep(text: &str) -> PostmanCollection {
        let mut de = serde_json::Deserializer::from_str(text);
        de.disable_recursion_limit();
        let stacker = serde_stacker::Deserializer::new(&mut de);
        let collection = PostmanCollection::deserialize(stacker).unwrap();
        de.end().unwrap();
        collection
    }

    /// by_id ครอบทุก node ใน arena และ O(1) กลับคืน node เดียวกัน
    #[test]
    fn by_id_covers_every_node_in_the_arena() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "A", "item": [
                    { "name": "R", "request": { "method": "GET", "url": "https://a.test" } }
                ] },
                { "name": "B", "request": { "method": "GET", "url": "https://b.test" } }
            ]
        }));
        assert_eq!(idx.by_id.len(), idx.nodes.len());
        for node in &idx.nodes {
            let id = &node.node_id;
            assert_eq!(idx.by_id(id).unwrap().node_id, *id);
            assert!(idx.by_id(&id.child(99)).is_none());
        }
    }

    /// variable reference index — dedup ต่อ request แต่ counts นับทุก occurrence ทุก request
    #[test]
    fn variable_refs_and_collection_counts() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "variable": [
                { "key": "base_url", "value": "https://api.test" },
                { "key": "unused", "value": "1" }
            ],
            "item": [
                { "name": "One", "request": {
                    "method": "GET", "url": "{{base_url}}/a?q={{base_url}}",
                    "header": [{ "key": "X-Key", "value": "{{api_key}}" }]
                } },
                { "name": "Two", "request": {
                    "method": "POST", "url": "https://x.test",
                    "body": { "mode": "raw", "raw": "{\"user\":\"{{base_url}}\"}" }
                } }
            ]
        }));
        let one = node(&idx, "One");
        assert_eq!(one.variable_refs, ["base_url", "api_key"]);
        let two = node(&idx, "Two");
        assert_eq!(two.variable_refs, ["base_url"]);

        // base_url ถูกเอ่ยถึง 2 (ใน One) + 1 (ใน Two) = 3 ครั้ง; api_key 1 ครั้ง
        assert_eq!(idx.collection_var_counts.get("base_url"), Some(&3));
        assert_eq!(idx.collection_var_counts.get("api_key"), Some(&1));

        assert_eq!(idx.collection_var_names, ["base_url", "unused"]);
    }

    /// event scripts และ script array form ถูก scan หา {{var}} เช่นกัน
    #[test]
    fn script_events_are_scanned_for_variable_refs() {
        let idx = index_of(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "item": [
                { "name": "Req", "request": { "method": "GET", "url": "https://a.test" },
                  "event": [
                    { "listen": "prerequest",
                      "script": { "exec": ["pm.variables.set('{{run_id}}');", "pm.test('{{token}}', ok);"] } },
                    { "listen": "test",
                      "script": { "exec": "pm.test('{{token}}', ok);" } }
                  ] }
            ]
        }));
        let req = node(&idx, "Req");
        assert_eq!(req.variable_refs, ["run_id", "token"]);
        assert_eq!(idx.collection_var_counts.get("token"), Some(&2));
    }

    /// collection variable key ซ้ำ → เตือน DuplicateVariableKey และใช้ตัวแรก
    #[test]
    fn duplicate_collection_variable_key_warns() {
        let mut collection: PostmanCollection = serde_json::from_value(json!({
            "info": { "name": "C", "schema": SCHEMA },
            "variable": [
                { "key": "dup", "value": "first" },
                { "key": "dup", "value": "second" },
                { "key": "ok", "value": "1" }
            ],
            "item": [
                { "name": "R", "request": { "method": "GET", "url": "https://a.test" } }
            ]
        }))
        .unwrap();
        let (idx, warnings) = build_index(&mut collection);
        assert_eq!(idx.collection_var_names, ["dup", "ok"]);
        assert_eq!(
            warnings,
            vec![LoadWarning::DuplicateVariableKey {
                key: "dup".to_string()
            }]
        );
    }

    /// Cargo.toml ตอนนี้ไม่ได้มี serde::Deserialize โดยตรงใน index — เช็คว่า NodeId
    /// round-trip ผ่าน Display/FromStr และ child ประกอบ id แบบ dotted ได้
    #[test]
    fn node_id_display_fromstr_and_child() {
        let root = NodeId::root();
        assert_eq!(root.to_string(), "");
        assert!(root.is_root());
        let a = root.child(0);
        let b = root.child(1);
        assert_eq!(a.to_string(), "0");
        assert_eq!(b.to_string(), "1");
        assert_eq!(b.child(0).to_string(), "1.0");
        assert_eq!(b.child(3).to_string(), "1.3");

        let parsed: NodeId = "1.0.3".parse().unwrap();
        assert_eq!(parsed.to_string(), "1.0.3");
        assert_eq!(parsed, NodeId::from_str("1.0.3").unwrap());
        assert!(!parsed.is_root());
    }
}
