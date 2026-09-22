//! โมเดลข้อมูล Postman Collection Format v2.1
//!
//! `model` คือ wire model (serde structs ตรงตาม schema v2.1) และ `polymorphic`
//! คือตัวช่วยสำหรับฟิลด์ polymorphic (`StringOr<T>`, `PathSegment`)

pub mod model;
pub mod polymorphic;
