# Database Migration Workflow

## Architecture Overview

```
Prisma           → generates SQL only (--create-only)
Liquibase        → applies SQL to database
Dockerfile       → service container (no migration)
Dockerfile.migrate → migration container (Liquibase)
```

---

## 1. Developer Workflow (สร้าง migration ใหม่)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. แก้ไข prisma/schema.prisma                                  │
│                                                                  │
│  2. make migrate-gen  (หรือ make mg)                            │
│     └─ prisma migrate dev --create-only                         │
│        └─ สร้าง liquibase/migrations/{timestamp}_{name}/        │
│              └─ migration.sql                                    │
│                                                                  │
│  3. เพิ่ม <changeSet> ใน liquibase/schema-changelog.xml         │
│     หรือ liquibase/data-changelog.xml (ถ้าเป็น data migration)  │
│                                                                  │
│  4. git commit ทั้งสองไฟล์พร้อมกัน                             │
│     - liquibase/migrations/{timestamp}/migration.sql            │
│     - liquibase/schema-changelog.xml                            │
└─────────────────────────────────────────────────────────────────┘
```

### เพิ่ม changeSet ใน schema-changelog.xml

```xml
<changeSet id="{timestamp}_{name}" author="prisma">
  <sqlFile
    path="migrations/{timestamp}_{name}/migration.sql"
    relativeToChangelogFile="true"
    splitStatements="true"
    stripComments="false"
    endDelimiter=";"
  />
</changeSet>
```

---

## 2. Local Migration Flow

```
make migrate
    │
    ├─ docker compose --profile migrate up --build migrate-data
    │
    ▼
┌──────────┐   healthy    ┌─────────────────┐  completed   ┌───────────────┐
│  db      │─────────────▶│ migrate-schema  │─────────────▶│ migrate-data  │
│ postgres │              │ Liquibase 5.0.3 │              │ Liquibase     │
│ :5432    │              │ schema-changelog│              │ data-changelog│
└──────────┘              └─────────────────┘              └───────────────┘
                               DATABASECHANGELOG table tracks applied changesets
```

| Command | ทำอะไร |
|---|---|
| `make migrate-gen` | generate SQL file ใหม่จาก schema diff (ไม่ apply) |
| `make migrate-status` | ดู pending migrations |
| `make migrate-schema` | apply schema (DDL) เท่านั้น |
| `make migrate` | apply schema → data ตามลำดับ |

---

## 3. Production / CI-CD Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ CI/CD Pipeline                                                       │
│                                                                      │
│  Step 1: Build images                                                │
│  ├─ docker build -f service/Dockerfile        → happy-sure-service   │
│  └─ docker build -f service/Dockerfile.migrate → happy-sure-migrate  │
│                                                                      │
│  Step 2: Schema migration                                            │
│  └─ docker run \                                                     │
│       -e NODE_ENV=production \                                       │
│       -e DATABASE_URL=postgresql://... \                             │
│       -e MIGRATE_TYPE=schema \                                       │
│       happy-sure-migrate                                             │
│                                                                      │
│  Step 3: Data migration                                              │
│  └─ docker run \                                                     │
│       -e NODE_ENV=production \                                       │
│       -e DATABASE_URL=postgresql://... \                             │
│       -e MIGRATE_TYPE=data \                                         │
│       happy-sure-migrate                                             │
│                                                                      │
│  Step 4: Deploy service                                              │
│  └─ docker run \                                                     │
│       -e NODE_ENV=production \                                       │
│       -e DATABASE_URL=postgresql://... \                             │
│       happy-sure-service                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### SSL Handling

| Environment | SSL | มาจาก |
|---|---|---|
| Local | ❌ | `NODE_ENV` ไม่ใช่ `production` |
| Production | ✅ `verify-ca` | `NODE_ENV=production` → code เพิ่ม SSL เอง |

`DATABASE_URL` ไม่ต้องมี `sslmode=require` — code จัดการให้ตาม `NODE_ENV`

---

## 4. Schema vs Data Migration

| ประเภท | Changelog | SQL อยู่ที่ | ตัวอย่าง |
|---|---|---|---|
| **Schema** (DDL) | `schema-changelog.xml` | `liquibase/migrations/{timestamp}/migration.sql` | CREATE TABLE, ALTER COLUMN, ADD INDEX |
| **Data** (DML) | `data-changelog.xml` | `liquibase/data/*.sql` | INSERT reference data, backfill columns |

**กฎ:** Schema ต้อง apply ก่อน Data เสมอ — `depends_on: service_completed_successfully` enforce ไว้แล้วใน docker-compose

### เพิ่ม data changeset ใน data-changelog.xml

```xml
<!-- SQL ทั่วไป (INSERT, UPDATE) -->
<changeSet id="data_{YYYYMMDD}_{description}" author="{author}">
  <sqlFile
    path="data/{filename}.sql"
    relativeToChangelogFile="true"
    splitStatements="true"
    endDelimiter=";"
  />
</changeSet>

<!-- SQL ที่มี dollar quoting ($$ ... $$) เช่น DO blocks -->
<changeSet id="data_{YYYYMMDD}_{description}" author="{author}">
  <sqlFile
    path="data/{filename}.sql"
    relativeToChangelogFile="true"
    splitStatements="false"
  />
</changeSet>
```

### Data changesets ที่มีอยู่

| Changeset ID | ไฟล์ | ข้อมูล |
|---|---|---|
| `data_20260530_system_config` | `data/system-config.sql` | 5 system config keys (ON CONFLICT DO NOTHING) |
| `data_20260530_administrative_areas` | `data/administrative-areas.sql` | ข้อมูลตำบล/อำเภอ/จังหวัดทั้งหมด (splitStatements=false) |

---

## 5. File Structure

```
service/
├── prisma/
│   └── schema.prisma              ← แก้ที่นี่
│
├── liquibase/
│   ├── schema-changelog.xml       ← เพิ่ม <changeSet> ด้วยมือหลัง migrate-gen
│   ├── data-changelog.xml         ← เพิ่ม data changesets ด้วยมือ
│   ├── migrate.sh                 ← parse DATABASE_URL → JDBC, SSL via NODE_ENV
│   ├── migrations/                ← DDL SQL จาก Prisma (make migrate-gen)
│   │   ├── migration_lock.toml
│   │   └── {timestamp}_{name}/
│   │       └── migration.sql
│   └── data/                      ← DML SQL สำหรับ data migrations
│       ├── system-config.sql
│       └── administrative-areas.sql
│
├── Dockerfile                     ← service container (ไม่มี migration)
└── Dockerfile.migrate             ← Liquibase 5.0.3 migration container
```
