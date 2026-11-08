# 03 — Roadmap: จากศูนย์ถึงเปิดให้บริการ

> ค่อยเป็นค่อยไป — จบแต่ละ Phase ต้องมีผลลัพธ์ที่ **เล่นได้/ทดสอบได้** เสมอ

## Phase 0 — Foundation (ตอนนี้)
- [x] สร้าง repo + โครงโฟลเดอร์ + เอกสารแผน
- [ ] ผู้สร้างกำหนดคอนเซปต์เกม (โลก, ตัวละคร, สไตล์ภาพ, ระบบต่อสู้) → เขียนลง `docs/game-design/`
- [ ] ตัดสินใจมุมกล้อง 2.5D + engine (Phaser vs Three.js) → บันทึก ADR

## Phase 1 — Prototype (เล่นได้บน GitHub Pages)
เป้าหมาย: พิสูจน์ว่า "เดินแมพ → เจอศัตรู → สู้ turn-based" สนุกและลื่นบนทุกอุปกรณ์
- [ ] ตั้ง Vite + Phaser + TypeScript ใน `apps/client`
- [ ] GitHub Actions deploy ขึ้น GitHub Pages อัตโนมัติ
- [ ] World Scene: แมพ Tiled 1 แผ่น, ตัวละครเดินได้ (joystick บนจอ / คลิก / WASD), กล้องตาม, depth sorting
- [ ] Encounter: ชนศัตรูบนแมพ → เปลี่ยนฉากเข้า Battle
- [ ] `packages/combat`: turn order ตาม Speed, โจมตีปกติ/สกิล/อัลติ, ชนะ/แพ้ + unit test
- [ ] Battle Scene: แสดงทีมเรา vs ศัตรู, เลือกเป้าหมาย, แอนิเมชันพื้นฐาน
- [ ] Responsive: แนวนอน/แนวตั้ง, iPad, เต็มจอบนมือถือ
- [ ] เซฟลง localStorage

## Phase 2 — Vertical Slice (เกมเล็กที่ครบวงจร)
- [ ] ล็อกสไตล์ภาพ: ตัวละคร, tileset, UI, VFX ชุดแรก
- [ ] ภูมิภาคแรก + เนื้อเรื่องบทที่ 1 (ระบบบทสนทนา/เควสต์)
- [ ] ตัวละคร 6–8 ตัว, จุดอ่อนธาตุ, เลเวล/อุปกรณ์/อัปสกิล
- [ ] เมนูหลัก: ทีม, กระเป๋า, ตัวละคร, ตั้งค่า
- [ ] เสียง/เพลง, PWA ติดตั้งได้
- [ ] ให้คนอื่นทดลองเล่นผ่าน GitHub Pages + เก็บ feedback

## Phase 3 — Backend & Accounts (เริ่มออนไลน์)
- [ ] `apps/server`: Fastify + Colyseus + PostgreSQL + Redis (dev ด้วย Docker Compose ใน `infra/`)
- [ ] ระบบบัญชี: Guest → ผูก Email/Google, cloud save
- [ ] ย้ายการตัดสินผลต่อสู้/รางวัลไปที่ server (server-authoritative)
- [ ] `OnlineGameService` ใน client
- [ ] Deploy staging: client (Cloudflare Pages/Vercel) + server (Fly.io/Railway) + โดเมน

## Phase 4 — Online Features
- [ ] เพื่อน, แชท
- [ ] กิลด์: สร้าง/เข้าร่วม/ยศ/แชทกิลด์/ภารกิจ
- [ ] PvP Async Arena + อันดับ (season)
- [ ] World Boss Raid + กระดานคะแนน
- [ ] (ต่อยอด) Realtime PvP / Co-op Raid
- [ ] ระบบ mail / event / daily mission

## Phase 5 — Closed Beta
- [ ] Admin panel (`apps/admin`): ดูผู้เล่น, ส่งของ, แบน, จัดอีเวนต์
- [ ] Analytics / telemetry, error tracking (Sentry)
- [ ] Load test, anti-cheat, rate limit, backup DB
- [ ] Terms of Service, Privacy Policy (**PDPA**), นโยบายผู้เยาว์
- [ ] ปรับสมดุลเกมจากข้อมูลจริง

## Phase 6 — Monetization & Payment
- [ ] ออกแบบเศรษฐกิจ: สกุลเงินพรีเมียม, แพ็กเกจ, Battle Pass / Monthly card
- [ ] เชื่อม Payment Gateway (Stripe และ/หรือ Opn/Omise) — บัตร, PromptPay, TrueMoney
- [ ] Flow: client ขอ checkout → server สร้าง order → ผู้เล่นจ่าย → **webhook ยืนยัน** → server เติมของ (idempotent)
- [ ] Ledger ธุรกรรม, ประวัติการซื้อ, ใบเสร็จ, นโยบายคืนเงิน
- [ ] ถ้ามี Gacha: **เปิดเผยอัตราดรอป**, ระบบ pity, ตรวจข้อกฎหมาย
- [ ] ทดสอบด้วย test mode ทุกช่องทางก่อนเปิดจริง
- [ ] จดทะเบียนธุรกิจ/ภาษี ตามที่ผู้ให้บริการชำระเงินกำหนด

## Phase 7 — Official Launch & Live Ops
- [ ] Production infra: CDN, หลายเครื่อง, monitoring/alert, autoscale
- [ ] Open Beta → Official Launch
- [ ] รอบอัปเดตเนื้อหา, อีเวนต์ตามฤดูกาล, ชุมชน (Discord/Facebook)
