# packages/game-data

ข้อมูลเกมทั้งหมด (ตัวละคร, สกิล, ศัตรู, ไอเทม, เควสต์, ดรอป) เป็น JSON/TS พร้อม schema ตรวจสอบ

ปรับสมดุล/เพิ่มเนื้อหาได้โดยไม่ต้องแก้ engine

## ตอนนี้มี
- `src/elements.ts` — 5 ธาตุ วงจรชนะทาง (`BEATS`), `matchup()` (ธาตุของผู้โจมตีกับธาตุของเป้า — ฮีโร่หนึ่งตัวมีธาตุเดียว), ตัวคูณดาเมจ (ยังเป็นค่าตัวแทน)
- `src/races.ts` — 10 เผ่า

ใช้จาก client: `import { ELEMENTS, RACES, matchup } from '@mythoria/game-data'` (npm workspace, ไฟล์ TS ตรงๆ)
รายละเอียดกติกา: `docs/game-design/elements-races.md`
