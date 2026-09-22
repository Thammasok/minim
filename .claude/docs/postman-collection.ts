/**
 * Postman type definitions
 * ---------------------------------------------------------------------------
 * ครอบคลุม:
 *   1. Collection Format v2.1  (ไฟล์ที่ Newman รันได้)
 *   2. Environment export
 *   3. Iteration data file (ไฟล์ที่ส่งผ่าน newman -d)
 *   4. Type guards สำหรับ parse tree แบบ recursive
 *
 * อ้างอิงจาก schema:
 *   https://schema.getpostman.com/json/collection/v2.1.0/collection.json
 *
 * หมายเหตุ: Newman รองรับเฉพาะ v2.1 JSON เท่านั้น (ไม่รองรับ v3 YAML)
 */

/* ===========================================================================
 * 1. COLLECTION — Top level
 * ======================================================================== */

export interface PostmanCollection {
  info: CollectionInfo;
  /** tree ของ request/folder ที่ซ้อนกันได้ไม่จำกัดชั้น */
  item: Item[];
  /** auth ระดับ collection (request ที่ไม่มี auth ของตัวเองจะ inherit อันนี้) */
  auth?: Auth | null;
  /** script ระดับ collection (prerequest / test ที่รันทุก request) */
  event?: Event[];
  /** ตัวแปรระดับ collection */
  variable?: Variable[];
  protocolProfileBehavior?: ProtocolProfileBehavior;
}

export interface CollectionInfo {
  name: string;
  /** UUID ของ collection */
  _postman_id?: string;
  description?: Description | string;
  version?: CollectionVersion | string;
  /** ควรลงท้ายด้วย .../v2.1.0/collection.json — ใช้เช็ค version ก่อน parse */
  schema: string;
  _exporter_id?: string;
  _collection_link?: string;
}

export interface CollectionVersion {
  major: number;
  minor: number;
  patch: number;
  identifier?: string;
  meta?: unknown;
}

/* ===========================================================================
 * 2. ITEM — Request หรือ Folder
 * ---------------------------------------------------------------------------
 * item หนึ่งตัวเป็นได้ 2 แบบ:
 *   - ItemGroup (folder) : มี property `item`
 *   - ItemRequest (leaf) : มี property `request`
 * ใช้ type guard ข้างล่างแยก
 * ======================================================================== */

export type Item = ItemGroup | ItemRequest;

/** Folder — มี item array ของตัวเอง */
export interface ItemGroup {
  id?: string;
  name?: string;
  description?: Description | string;
  /** ลูกๆ ข้างใน folder */
  item: Item[];
  /** auth ระดับ folder */
  auth?: Auth | null;
  event?: Event[];
  variable?: Variable[];
  protocolProfileBehavior?: ProtocolProfileBehavior;
}

/** Request — leaf node จริงๆ ที่ยิงได้ */
export interface ItemRequest {
  id?: string;
  name?: string;
  description?: Description | string;
  /** request เป็นได้ทั้ง object และ string (URL เปล่าๆ) — พบใน export จริงจาก Postman */
  request: Request | string;
  /** saved examples / responses ที่บันทึกไว้ */
  response?: Response[];
  event?: Event[];
  variable?: Variable[];
  protocolProfileBehavior?: ProtocolProfileBehavior;
}

/* ===========================================================================
 * 3. REQUEST
 * ======================================================================== */

export interface Request {
  /** url เป็นได้ทั้ง object และ string — ต้อง handle ทั้งสองแบบ */
  url?: Url | string;
  method?: HttpMethod | string;
  /** header เป็นได้ทั้ง array และ string (raw header block) */
  header?: Header[] | string;
  body?: RequestBody | null;
  auth?: Auth | null;
  description?: Description | string;
  proxy?: ProxyConfig;
  certificate?: Certificate;
}

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'TRACE'
  | 'CONNECT'
  | 'PROPFIND'
  | 'PROPPATCH'
  | 'MKCOL'
  | 'COPY'
  | 'MOVE'
  | 'LOCK'
  | 'UNLOCK'
  | 'VIEW'
  | 'LINK'
  | 'UNLINK'
  | 'PURGE';

/* ---- URL --------------------------------------------------------------- */

export interface Url {
  /** URL แบบเต็มเป็น string — ใช้แสดงผลได้เลยง่ายสุด */
  raw?: string;
  protocol?: string;
  /** host เป็นได้ทั้ง string หรือ array ของ segment เช่น ["api","example","com"] */
  host?: string | string[];
  /** path segment เช่น ["users",":id"] — element ที่ขึ้นต้น : คือ path variable */
  path?: string | Array<string | { type?: string; value?: string }>;
  port?: string;
  query?: QueryParam[];
  hash?: string;
  /** ค่าของ path variable เช่น :id */
  variable?: Variable[];
}

export interface QueryParam {
  key?: string | null;
  value?: string | null;
  disabled?: boolean;
  description?: Description | string | null;
}

/* ---- Header ------------------------------------------------------------ */

export interface Header {
  key: string;
  value: string;
  disabled?: boolean;
  description?: Description | string | null;
}

/* ---- Body -------------------------------------------------------------- */

export type BodyMode = 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';

export interface RequestBody {
  /** ตัวกำหนดว่าจะอ่าน field ไหน / render UI แบบไหน */
  mode?: BodyMode;
  raw?: string;
  urlencoded?: UrlEncodedParameter[];
  formdata?: FormParameter[];
  file?: { src?: string | null; content?: string };
  graphql?: GraphQlBody;
  /** เช่น options.raw.language = "json" | "xml" | "text" สำหรับ syntax highlight */
  options?: {
    raw?: { language?: 'json' | 'xml' | 'html' | 'text' | 'javascript' | string };
    [key: string]: unknown;
  };
  disabled?: boolean;
}

export interface UrlEncodedParameter {
  key: string;
  value?: string;
  disabled?: boolean;
  description?: Description | string | null;
}

export interface FormParameter {
  key: string;
  /** ใช้เมื่อ type === "text" */
  value?: string;
  /** ใช้เมื่อ type === "file" (path ของไฟล์) */
  src?: string | string[] | null;
  type?: 'text' | 'file';
  contentType?: string;
  disabled?: boolean;
  description?: Description | string | null;
}

export interface GraphQlBody {
  query?: string;
  /** variables มักถูกเก็บเป็น string ของ JSON */
  variables?: string;
}

/* ===========================================================================
 * 4. AUTH
 * ---------------------------------------------------------------------------
 * รูปแบบใน v2.1: type เป็น key ที่บอกชนิด แล้วมี property ชื่อเดียวกับ type
 * เก็บเป็น array ของ AuthAttribute เช่น
 *   { "type": "bearer", "bearer": [ { "key": "token", "value": "{{token}}" } ] }
 * ======================================================================== */

export type AuthType =
  | 'apikey'
  | 'awsv4'
  | 'basic'
  | 'bearer'
  | 'digest'
  | 'edgegrid'
  | 'hawk'
  | 'ntlm'
  | 'oauth1'
  | 'oauth2'
  | 'noauth';

export interface AuthAttribute {
  key: string;
  value?: unknown;
  type?: string;
}

export interface Auth {
  type: AuthType;
  apikey?: AuthAttribute[];
  awsv4?: AuthAttribute[];
  basic?: AuthAttribute[];
  bearer?: AuthAttribute[];
  digest?: AuthAttribute[];
  edgegrid?: AuthAttribute[];
  hawk?: AuthAttribute[];
  ntlm?: AuthAttribute[];
  oauth1?: AuthAttribute[];
  oauth2?: AuthAttribute[];
  noauth?: AuthAttribute[] | null;
}

/* ===========================================================================
 * 5. EVENT / SCRIPT  (pre-request & test)
 * ======================================================================== */

export interface Event {
  id?: string;
  /** "prerequest" = รันก่อนยิง, "test" = รันหลังได้ response (ที่เก็บ pm.test) */
  listen: 'prerequest' | 'test' | string;
  script?: Script;
  disabled?: boolean;
}

export interface Script {
  id?: string;
  type?: string;
  /** โค้ดเก็บเป็น array ของบรรทัด — join ด้วย "\n" ก่อนแสดง / ก่อนรัน */
  exec?: string | string[];
  /** ทางเลือก: โหลด script จาก url ภายนอกแทน exec */
  src?: Url | string;
  name?: string;
}

/* ===========================================================================
 * 6. VARIABLE
 * ======================================================================== */

export interface Variable {
  id?: string;
  key?: string;
  value?: unknown;
  type?: 'string' | 'boolean' | 'number' | 'any';
  name?: string;
  description?: Description | string;
  system?: boolean;
  disabled?: boolean;
}

/* ===========================================================================
 * 7. RESPONSE (saved examples)
 * ======================================================================== */

export interface Response {
  id?: string;
  name?: string;
  /** request ต้นฉบับที่ทำให้เกิด response นี้ */
  originalRequest?: Request;
  status?: string;
  code?: number;
  header?: Header[] | string | null;
  cookie?: Cookie[];
  body?: string | null;
  responseTime?: number | string | null;
  timings?: Record<string, unknown> | null;
  /** ภาษาของ body สำหรับ syntax highlight เช่น "json" */
  _postman_previewlanguage?: string;
}

export interface Cookie {
  domain: string;
  path: string;
  name?: string;
  value?: string;
  expires?: string | number | null;
  maxAge?: string | number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  extensions?: unknown[];
}

/* ===========================================================================
 * 8. ส่วนประกอบย่อยที่ใช้ร่วมกัน
 * ======================================================================== */

export interface Description {
  content?: string;
  /** เช่น "text/markdown" | "text/html" | "text/plain" */
  type?: string;
  version?: unknown;
}

export interface ProxyConfig {
  match?: string;
  host?: string;
  port?: number;
  tunnel?: boolean;
  disabled?: boolean;
}

export interface Certificate {
  name?: string;
  matches?: string[];
  key?: { src?: string };
  cert?: { src?: string };
  passphrase?: string;
}

/** freeform — ปิด/เปิด behaviour ต่างๆ เช่น { "disableBodyPruning": true } */
export type ProtocolProfileBehavior = Record<string, unknown>;

/* ===========================================================================
 * 9. ENVIRONMENT (ไฟล์แยกจาก collection)
 * ======================================================================== */

export interface PostmanEnvironment {
  id?: string;
  name: string;
  values: EnvironmentValue[];
  _postman_variable_scope?: 'environment' | 'globals' | string;
  _postman_exported_at?: string;
  _postman_exported_using?: string;
}

export interface EnvironmentValue {
  key: string;
  value: string;
  /** "secret" = ค่าถูกซ่อนใน UI ของ Postman */
  type?: 'default' | 'secret' | string;
  enabled?: boolean;
}

/* ===========================================================================
 * 10. ITERATION DATA FILE (ส่งผ่าน newman -d)
 * ---------------------------------------------------------------------------
 * ไม่ได้อยู่ในไฟล์ collection — เป็นไฟล์แยก
 * แต่ละ element ใน array = 1 iteration
 * key ในแต่ละ object -> เข้าถึงได้ผ่าน pm.iterationData.get(key) และ {{key}}
 *
 * รองรับได้ทั้ง JSON (แบบนี้) และ CSV (บรรทัดแรกเป็น header)
 * ======================================================================== */

export type IterationDataFile = Array<Record<string, unknown>>;

/** ตัวเลือกหลักที่เกี่ยวกับ iteration เวลาเรียก Newman แบบ programmatic */
export interface NewmanRunOptions {
  collection: PostmanCollection | string;
  environment?: PostmanEnvironment | string;
  /** data file สำหรับ iteration (-d) */
  iterationData?: IterationDataFile | string;
  /** จำนวนรอบ (-n) — ถ้าไม่ใส่จะเท่ากับจำนวนแถวใน iterationData */
  iterationCount?: number;
  globals?: PostmanEnvironment | string;
  [key: string]: unknown;
}

/* ===========================================================================
 * 11. TYPE GUARDS — ตัวช่วย parse tree
 * ======================================================================== */

/** true ถ้า item เป็น folder (มีลูก) */
export function isItemGroup(item: Item): item is ItemGroup {
  return Array.isArray((item as ItemGroup).item);
}

/** true ถ้า item เป็น request จริง (leaf) */
export function isItemRequest(item: Item): item is ItemRequest {
  return (item as ItemRequest).request !== undefined;
}

/** url อาจเป็น string หรือ object — normalize ให้เป็น string เสมอ */
export function getUrlString(url: Url | string | undefined): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  if (url.raw) return url.raw;
  // ประกอบเองจาก part ต่างๆ ถ้าไม่มี raw
  const host = Array.isArray(url.host) ? url.host.join('.') : url.host ?? '';
  const path = Array.isArray(url.path)
    ? url.path.map((p) => (typeof p === 'string' ? p : p.value ?? '')).join('/')
    : url.path ?? '';
  const proto = url.protocol ? `${url.protocol}://` : '';
  const port = url.port ? `:${url.port}` : '';
  return `${proto}${host}${port}${path ? '/' + path : ''}`;
}

/** header อาจเป็น string หรือ array — normalize ให้เป็น array เสมอ */
export function getHeaders(header: Header[] | string | undefined): Header[] {
  if (!header) return [];
  if (typeof header === 'string') {
    return header
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(':');
        return idx === -1
          ? { key: line.trim(), value: '' }
          : { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
      });
  }
  return header;
}

/** script.exec อาจเป็น string หรือ string[] — คืน source code เป็น string เดียว */
export function getScriptSource(script: Script | undefined): string {
  if (!script?.exec) return '';
  return Array.isArray(script.exec) ? script.exec.join('\n') : script.exec;
}

/** description อาจเป็น string หรือ object — คืนเป็น string เสมอ */
export function getDescription(desc: Description | string | undefined): string {
  if (!desc) return '';
  return typeof desc === 'string' ? desc : desc.content ?? '';
}

/**
 * เดินทั้ง tree แบบ recursive แล้ว callback ทุก request (leaf)
 * พร้อม path ของ folder ที่มันอยู่ — สะดวกสำหรับทำ list / search ใน UI
 */
export function walkRequests(
  items: Item[],
  callback: (req: ItemRequest, folderPath: string[]) => void,
  folderPath: string[] = [],
): void {
  for (const item of items) {
    if (isItemGroup(item)) {
      walkRequests(item.item, callback, [...folderPath, item.name ?? '']);
    } else if (isItemRequest(item)) {
      callback(item, folderPath);
    }
  }
}

/* ===========================================================================
 * 12. CSV PARSER — แปลงไฟล์ CSV เป็น IterationDataFile
 * ---------------------------------------------------------------------------
 * รองรับตามมาตรฐาน RFC 4180:
 *   - field ที่มี comma / newline / quote ต้องครอบด้วย double quote
 *   - double quote ในค่า escape เป็น "" (สองตัวติดกัน)
 *   - รองรับทั้ง CRLF และ LF
 *   - ตัด BOM (\uFEFF) ออกให้อัตโนมัติ กัน header คอลัมน์แรกเพี้ยน
 *
 * ผลลัพธ์ตรงกับที่ Newman ทำ: ทุกค่าเป็น "string" (ต้อง cast เองใน script)
 * ======================================================================== */

export interface ParseCsvOptions {
  /** ตัวคั่นคอลัมน์ (default ",") — เผื่อไฟล์เป็น TSV ให้ส่ง "\t" */
  delimiter?: string;
  /** ตัด whitespace หน้า-หลังของ header ออก (default true) */
  trimHeaders?: boolean;
}

/**
 * แปลง CSV string -> IterationDataFile
 * แต่ละแถวข้อมูล (หลัง header) = 1 iteration
 *
 * @example
 * const data = parseCsv(await file.text());
 * // data = [ { username: "alice", password: "111" }, ... ]
 */
export function parseCsv(
  csvText: string,
  options: ParseCsvOptions = {},
): IterationDataFile {
  const delimiter = options.delimiter ?? ',';
  const trimHeaders = options.trimHeaders ?? true;

  // ตัด BOM ออกก่อน (สำคัญมากเมื่อไฟล์มาจาก Excel)
  let text = csvText.replace(/^\uFEFF/, '');
  if (text.length === 0) return [];

  const rows = tokenizeCsv(text, delimiter);
  if (rows.length === 0) return [];

  // แถวแรกเป็น header
  let headers = rows[0];
  if (trimHeaders) headers = headers.map((h) => h.trim());

  const result: IterationDataFile = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // ข้ามแถวว่างล้วน (เช่นบรรทัดสุดท้ายที่เป็น newline เปล่า)
    if (row.length === 1 && row[0] === '') continue;

    const record: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = row[c] ?? '';
    }
    result.push(record);
  }
  return result;
}

/**
 * state-machine tokenizer — แตก CSV ทั้งไฟล์เป็น array ของแถว (แต่ละแถวเป็น array ของ cell)
 * จัดการ quote, escaped quote, และ newline ภายใน quoted field ได้ถูกต้อง
 */
function tokenizeCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" = quote จริงหนึ่งตัว
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // ข้าม — ให้ \n เป็นตัวจบบรรทัด (รองรับ CRLF)
    } else {
      field += ch;
    }
  }

  // เก็บ field/row สุดท้ายที่ค้างอยู่ (ไฟล์ไม่จบด้วย newline)
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/* ===========================================================================
 * 13. PREVIEW — สรุปข้อมูล iteration ให้ user ดูก่อนกด run
 * ======================================================================== */

export interface IterationPreview {
  /** จำนวนรอบที่จะรัน = จำนวนแถวข้อมูล */
  iterationCount: number;
  /** ชื่อคอลัมน์ทั้งหมด (= ตัวแปรที่ใช้ผ่าน {{...}} ได้) */
  columns: string[];
  /** ตัวอย่างข้อมูลไม่กี่แถวแรก ไว้โชว์ preview */
  sample: Array<Record<string, unknown>>;
}

/**
 * สรุป IterationDataFile เป็นข้อมูลสำหรับแสดง preview ใน UI
 * เช่น "จะรัน 3 iterations ด้วยคอลัมน์ username, password"
 */
export function previewIterationData(
  data: IterationDataFile,
  sampleSize = 5,
): IterationPreview {
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  return {
    iterationCount: data.length,
    columns,
    sample: data.slice(0, sampleSize),
  };
}

/**
 * ช่วยเดา delimiter จากบรรทัดแรก — เผื่อ user อัปโหลดทั้ง CSV และ TSV
 * เทียบจำนวน comma กับ tab ในบรรทัดแรก แล้วเลือกตัวที่เจอมากกว่า
 */
export function detectDelimiter(csvText: string): ',' | '\t' {
  const firstLine = csvText.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}
