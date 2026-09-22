/**
 * `cn` — รวม Tailwind class โดยให้ class ที่มาทีหลังชนะเมื่อขัดแย้งกัน
 *
 * shadcn/ui รุ่นปัจจุบัน generate component ที่ `import { cn } from 'cn'` โดยตรง
 * (แพ็กเกจ `cn` คือตัวแทนของ clsx + tailwind-merge ที่ shadcn ดูแลเอง)
 * ไฟล์นี้ re-export ตัวเดียวกันนั้นออกมาที่ `@/lib/utils` ตามที่ design.md กำหนด
 * เพื่อให้โค้ดของเรามี import path เดียว และไม่เกิด cn สองตัวในโปรเจกต์
 */
export { cn } from 'cn';
