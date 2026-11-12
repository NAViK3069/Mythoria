# 04 — Folder Structure

```
Mythoria/
├─ apps/
│  ├─ client/          เกมบนเว็บ (Phaser + Vite + PWA) → GitHub Pages / CDN
│  │  ├─ public/assets/   asset ที่ export แล้ว (sprite sheet, tilemap, audio)
│  │  └─ src/
│  │     ├─ scenes/       Boot, World (สำรวจแมพ), Battle, UI
│  │     ├─ world/        การเดิน, กล้อง, แมพ, สัตว์เล็ก (Critters: ผีเสื้อ, Animals: แมว กระรอก นกกระจอก), encounter, NPC
│  │     ├─ fx/effects/   เอฟเฟกต์ที่เราเขียนเอง (ผีเสื้อ, ไฟ) — โค้ดล้วน ไม่มีไฟล์ภาพ
│  │     ├─ battle/       แสดงผลการต่อสู้ (เรียก packages/combat)
│  │     ├─ ui/           เมนู, HUD, ปุ่มทัช
│  │     ├─ input/        รวม touch / mouse / keyboard
│  │     └─ services/     GameService (Local / Online)
│  ├─ server/          เกมเซิร์ฟเวอร์ (Fastify + Colyseus) — Phase 3
│  │  └─ src/
│  │     ├─ http/         REST API: auth, profile, shop, guild
│  │     ├─ rooms/        World / Battle / PvP / Raid rooms
│  │     ├─ db/           schema, migrations
│  │     └─ payment/      payment gateway + webhook
│  └─ admin/           เครื่องมือ GM / แอดมิน — Phase 5
├─ packages/
│  ├─ combat/          ระบบต่อสู้ turn-based (pure TS, deterministic, มี unit test)
│  ├─ game-data/       ข้อมูลเกม: ตัวละคร, สกิล, ศัตรู, ไอเทม, เควสต์ + schema
│  └─ shared/          type กลาง, ค่าคงที่, protocol ข้อความ client↔server
├─ assets/             ไฟล์ต้นฉบับ (ไม่ถูกโหลดในเกมตรงๆ)
│  └─ characters/ enemies/ tilesets/ maps/ ui/ vfx/ audio/
├─ infra/              docker-compose (Postgres, Redis), config deploy
├─ tools/              สคริปต์: pack sprite, ตรวจ game-data ฯลฯ
├─ docs/               เอกสารแผน, GDD, ADR
└─ .github/workflows/  CI + deploy (เพิ่มใน Phase 1)
```

## กฎการวางไฟล์
- **กราฟิก/การแสดงผล** อยู่ใน `apps/client` เท่านั้น — `packages/combat` ห้าม import Phaser/DOM
- **ตัวเลข/ข้อมูลเกม** อยู่ใน `packages/game-data` — ห้าม hardcode ในโค้ด
- **ไฟล์ต้นฉบับอาร์ต** (.aseprite, .psd) อยู่ใน `assets/` → export ผลลัพธ์ไปที่ `apps/client/public/assets/`
